import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { db } from "@/features/account/server/db";
import { Prisma } from "@/generated/prisma/client";
import { seal, unseal } from "@/features/garmin/server/session";
import { STRAVA_CONSENT_VERSION, settingsSchema, streamSchema, type DashboardData } from "../types";
import { calendarRange, calendarWeeks, criticalSpeed, effortPerformance, heartRateTimes, paceHistogram, PRESET_MAX_HR, recentEnduranceRange } from "../analytics";
import { exchange, summaries, streams, StravaError, tokenSchema, type Tokens } from "./api";
import type { StravaConfig } from "./config";
import { saveSummary } from "./save-summary";
import { clearActivityCache } from "./cache";
import { weeklyVolumes } from "../weekly-volume";
import { periodSynchronized, syncHistorySchema } from "../sync-history";
import { syncPeriodRange } from "../sync-period";
import { volumeBuckets } from "../volume-chart";

export async function saveConnection(config: StravaConfig, userId: string, tokens: Tokens, consentAt: Date, state: string) {
  if (!tokens.athlete) throw new StravaError("unavailable");
  const athleteKey = createHmac("sha256", config.encryptionKey).update(`run-week:strava:athlete:v1\0${tokens.athlete.id}`).digest("hex");
  try {
    await db().$transaction(async (tx) => {
      // Serializes reconnect with sync commits and local deletion across instances.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
      await clearActivityCache(userId);
      const ticket = await tx.verificationToken.deleteMany({ where: {
        identifier: `strava-oauth:${userId}`, token: createHash("sha256").update(`${state}:claimed`).digest("hex"),
        expires: { gt: new Date() },
      } });
      if (ticket.count !== 1) throw new StravaError("invalid", 400);
      const owner = await tx.stravaConnection.findUnique({ where: { athleteKey }, select: { userId: true } });
      if (owner && owner.userId !== userId) throw new StravaError("alreadyLinked", 409);
      const old = await tx.stravaConnection.findUnique({ where: { userId } });
      if (old && old.athleteKey !== athleteKey) await tx.stravaActivity.deleteMany({ where: { userId } });
      const data = {
        athleteKey, tokens: seal(tokens, config.encryptionKey), consentVersion: STRAVA_CONSENT_VERSION, consentAt,
        syncActive: true, syncPage: 1, syncAfter: 0, syncBefore: Math.floor(Date.now() / 1000),
        leaseId: null, leaseUntil: null, retryAt: null, lastSyncedAt: null, syncHistory: [],
      };
      await tx.stravaConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new StravaError("alreadyLinked", 409);
    throw error;
  }
}

/** No remote activity is deleted. Revoke access in Strava settings as well. */
export async function disconnect(userId: string) {
  await db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
    await clearActivityCache(userId);
    await tx.stravaConnection.deleteMany({ where: { userId } });
    await tx.stravaActivity.deleteMany({ where: { userId } });
    await tx.runningAnalyticsSettings.deleteMany({ where: { userId } });
    await tx.verificationToken.deleteMany({ where: { identifier: `strava-oauth:${userId}` } });
  });
}

/** One durable lease covers refresh and import. Crashed requests recover after 90 seconds. */
export async function syncStep(config: StravaConfig, userId: string, backfill = false, activityId?: string) {
  if (activityId && !await db().stravaActivity.findFirst({ where: { userId, id: activityId }, select: { id: true } }))
    throw new StravaError("invalid", 404);
  const leaseId = randomUUID();
  const now = new Date();
  const claimed = await db().stravaConnection.updateMany({
    where: { userId, consentVersion: STRAVA_CONSENT_VERSION,
      AND: [{ OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, { OR: [{ retryAt: null }, { retryAt: { lte: now } }] }] },
    data: { leaseId, leaseUntil: new Date(now.getTime() + 90_000) },
  });
  if (!claimed.count) {
    const row = await db().stravaConnection.findUnique({ where: { userId } });
    if (!row || row.consentVersion !== STRAVA_CONSENT_VERSION) throw new StravaError("notConnected", 409);
    const seconds = Math.max(1, Math.ceil(((row.retryAt ?? row.leaseUntil ?? now).getTime() - now.getTime()) / 1000));
    throw new StravaError(row.retryAt && row.retryAt > now ? "rateLimited" : "busy", 429, seconds);
  }
  try {
    let row = await db().stravaConnection.findUnique({ where: { userId } });
    if (!row || row.leaseId !== leaseId) throw new StravaError("notConnected", 409);
    const parsed = tokenSchema.safeParse(unseal(row.tokens, config.encryptionKey));
    if (!parsed.success) throw new StravaError("unauthorized", 401);
    let tokens = parsed.data;
    if (tokens.expires_at <= Math.floor(Date.now() / 1000) + 60) {
      tokens = await exchange(config, { grant_type: "refresh_token", refresh_token: tokens.refresh_token });
      const saved = await db().stravaConnection.updateMany({ where: { userId, leaseId }, data: { tokens: seal(tokens, config.encryptionKey) } });
      if (!saved.count) throw new StravaError("notConnected", 409);
    }
    const pending = await db().stravaActivity.findMany({
      where: { userId, ...(activityId ? { id: activityId } : { streamState: "pending" }) },
      take: 1, orderBy: { startedAt: "desc" },
    });
    if (activityId && !pending.length) throw new StravaError("invalid", 404);
    if (!activityId && ((!row.syncActive && !pending.length) || backfill)) {
      const syncBefore = Math.floor(Date.now() / 1000);
      const syncAfter = backfill ? 0 : Math.max(0, Math.floor((row.lastSyncedAt?.getTime() ?? 0) / 1000) - 86400);
      const updated = await db().stravaConnection.updateMany({
        where: { userId, leaseId }, data: { syncPage: 1, syncBefore, syncAfter, syncActive: true },
      });
      if (!updated.count) throw new StravaError("notConnected", 409);
      row = { ...row, syncPage: 1, syncBefore, syncAfter, syncActive: true };
    }
    if (pending.length) {
      for (const activity of pending) {
        const result = await streams(tokens.access_token, activity.sourceId);
        await db().$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
          const active = await tx.stravaConnection.updateMany({
            where: { userId, leaseId }, data: { retryAt: result.delay ? new Date(Date.now() + result.delay * 1000) : null },
          });
          if (!active.count) throw new StravaError("notConnected", 409);
          await clearActivityCache(userId, true);
          await tx.stravaActivity.updateMany({
            where: { userId, id: activity.id },
            data: { streams: result.data ?? Prisma.DbNull, streamState: result.data ? "ready" : "unavailable" },
          });
        });
        if (result.delay) break;
      }
    } else {
      const result = await summaries(tokens.access_token, row.syncPage, row.syncAfter, row.syncBefore);
      await db().$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
        const active = await tx.stravaConnection.updateMany({ where: { userId, leaseId }, data: {
          syncPage: row.syncPage + 1, syncActive: result.activities.length === 20,
          ...(result.activities.length < 20 ? { lastSyncedAt: new Date(row.syncBefore * 1000) } : {}),
          retryAt: result.delay ? new Date(Date.now() + result.delay * 1000) : null,
        } });
        if (!active.count) throw new StravaError("notConnected", 409);
        await clearActivityCache(userId, true);
        for (const activity of result.activities) {
          await saveSummary(tx, userId, activity);
        }
      });
    }
  } catch (error) {
    if (error instanceof StravaError && error.retrySeconds) {
      await db().stravaConnection.updateMany({ where: { userId, leaseId }, data: { retryAt: new Date(Date.now() + error.retrySeconds * 1000) } });
    }
    throw error;
  } finally {
    // Keep a durable per-account cooldown after releasing the cross-instance lease.
    await db().stravaConnection.updateMany({
      where: { userId, leaseId, OR: [{ retryAt: null }, { retryAt: { lt: new Date(Date.now() + 1000) } }] },
      data: { retryAt: new Date(Date.now() + 1000) },
    });
    await db().stravaConnection.updateMany({ where: { userId, leaseId }, data: { leaseId: null, leaseUntil: null } });
  }
}

export async function dashboard(userId: string, month: string, weekDate?: string, year?: string, today = new Date().toISOString().slice(0, 10)): Promise<DashboardData> {
  const range = year ? { start: `${year}-01-01`, end: `${Number(year) + 1}-01-01` } : calendarRange(month, weekDate);
  const enduranceRange = recentEnduranceRange(today);
  const period = year ? { view: "year" as const, year } : weekDate ? { view: "week" as const, date: weekDate } : { view: "month" as const, month };
  const volumeRange = syncPeriodRange(period);
  const [connection, rows, pending, maximalEfforts, volumeDays, endurance, periodVolumeDays] = await Promise.all([
    db().stravaConnection.findUnique({ where: { userId } }),
    db().stravaActivity.findMany({ where: { userId, localDate: { gte: range.start, lt: range.end } },
      orderBy: [{ localDate: "desc" }, { startedAt: "asc" }, { id: "asc" }], take: year ? undefined : 1001 }),
    db().stravaActivity.count({ where: { userId, streamState: "pending" } }),
    db().stravaActivity.findMany({ where: { userId, maximalEffort: true },
      orderBy: [{ startedAt: "desc" }, { id: "asc" }],
      select: { id: true, sourceId: true, name: true, sport: true, localDate: true, distanceMeters: true,
        movingSeconds: true, elapsedSeconds: true, averageHr: true, maxHr: true, maximalEffort: true, streamState: true } }),
    db().stravaActivity.groupBy({ by: ["localDate"], where: { userId,
      localDate: { lt: calendarRange(today.slice(0, 7), today).start } },
      _sum: { distanceMeters: true, movingSeconds: true } }),
    db().stravaActivity.findFirst({ where: { userId, movingSeconds: { gt: 0 }, distanceMeters: { gt: 0 },
      localDate: { gte: enduranceRange.start, lt: enduranceRange.end } },
      orderBy: [{ movingSeconds: "desc" }, { distanceMeters: "desc" }, { localDate: "desc" }, { id: "asc" }],
      select: { id: true, name: true, localDate: true, movingSeconds: true, distanceMeters: true } }),
    db().stravaActivity.groupBy({ by: ["localDate"], where: { userId,
      localDate: { gte: volumeRange.start, lt: volumeRange.end } },
      _sum: { distanceMeters: true, movingSeconds: true } }),
  ]);
  const settings = settingsSchema.safeParse({ maxHr: PRESET_MAX_HR });
  if (!settings.success) throw new StravaError("unavailable");
  const selected = year ? rows : rows.slice(0, 1000);
  const measurements = new Map<string, { above: number; measured: number; zoneSeconds: number[] }>();
  const samples = selected.flatMap((row) => {
    if (row.streams === null) return [];
    const value = streamSchema.safeParse(row.streams);
    if (!value.success) throw new StravaError("unavailable");
    const { threshold: hr, zones } = heartRateTimes([value.data], settings.data);
    if (hr) measurements.set(row.id, { above: hr.above, measured: hr.above + hr.below,
      zoneSeconds: zones.map((zone) => zone.seconds) });
    return [value.data];
  });
  const activities = selected.map((row) => ({
    id: row.id, sourceId: row.sourceId, name: row.name, sport: row.sport, localDate: row.localDate,
    distanceMeters: row.distanceMeters, movingSeconds: row.movingSeconds, elapsedSeconds: row.elapsedSeconds,
    averageHr: row.averageHr, maxHr: row.maxHr, maximalEffort: row.maximalEffort, streamState: row.streamState,
  }));
  const monthActivities = weekDate || year ? activities : activities.filter((activity) => activity.localDate.startsWith(month));
  const syncRange = syncPeriodRange(year ? { view: "year", year } : weekDate ? { view: "week", date: weekDate } : { view: "month", month });
  const history = syncHistorySchema.parse(connection?.syncHistory ?? []);
  const periodLastSyncedAt = history.filter((entry) => entry.start <= syncRange.start && entry.end >= syncRange.end)
    .map((entry) => entry.syncedAt).sort().at(-1) ?? null;
  return {
    connected: !!connection, consentCurrent: connection?.consentVersion === STRAVA_CONSENT_VERSION,
    syncActive: connection?.syncActive ?? false, syncPage: connection?.syncPage ?? 1,
    lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null, retryAt: connection?.retryAt?.toISOString() ?? null,
    periodSynchronized: periodSynchronized(history, syncRange, today), periodLastSyncedAt,
    pending, month, year: year ?? null, weekDate: weekDate ? range.start : null, activities: monthActivities, settings: settings.data, ...heartRateTimes(samples, settings.data),
    weeks: calendarWeeks(month, activities, measurements, settings.data.maxHr, weekDate),
    months: year ? Array.from({ length: 12 }, (_, i) => {
      const month = `${year}-${String(i + 1).padStart(2, "0")}`;
      const runs = activities.filter((activity) => activity.localDate.startsWith(month));
      return { month, zoneSeconds: Array.from({ length: 5 }, (_, zone) =>
        runs.reduce((sum, run) => sum + (measurements.get(run.id)?.zoneSeconds[zone] ?? 0), 0)) };
    }) : [],
    paceDistribution: paceHistogram(samples),
    volumeBuckets: volumeBuckets(period, periodVolumeDays.map((day) => ({
      localDate: day.localDate, distanceMeters: day._sum.distanceMeters ?? 0, movingSeconds: day._sum.movingSeconds ?? 0,
    }))),
    weeklyVolumes: weeklyVolumes(volumeDays.map((day) => ({ localDate: day.localDate,
      distanceMeters: day._sum.distanceMeters ?? 0, movingSeconds: day._sum.movingSeconds ?? 0 }))),
    maximalEfforts, performance: effortPerformance(maximalEfforts), endurance, today,
    criticalSpeed: criticalSpeed(maximalEfforts), truncated: !year && rows.length > 1000,
  };
}
