import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/features/account/server/db";
import { Prisma } from "@/generated/prisma/client";
import { seal } from "@/features/garmin/server/session";
import { STRAVA_CONSENT_VERSION, settingsSchema, streamSchema, type DashboardData } from "../types";
import { calendarRange, calendarWeeks, criticalSpeed, effortPerformance, heartRateTimes, paceHistogram, PRESET_MAX_HR, recentEnduranceRange } from "../analytics";
import { StravaAlreadyLinkedError, StravaError, type Tokens } from "./api";
import type { StravaConfig } from "./config";
import { clearActivityCache } from "./cache";
import { weeklyVolumes } from "../weekly-volume";
import { syncHistorySchema } from "../sync-history";
import { syncPeriodRange } from "../sync-period";
import { volumeBuckets } from "../volume-chart";
import { createSyncJob } from "./background-jobs";
import { requireBackgroundSync } from "./inngest";
import { athleteKey as keyedAthlete } from "./athlete-key";

export async function saveConnection(config: StravaConfig, userId: string, tokens: Tokens, consentAt: Date, state: string) {
  requireBackgroundSync();
  if (!tokens.athlete) throw new StravaError("unavailable");
  const athleteKey = keyedAthlete(config.encryptionKey, tokens.athlete.id);
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
      const owner = await tx.stravaConnection.findUnique({ where: { athleteKey }, select: { userId: true, user: { select: { email: true } } } });
      if (owner && owner.userId !== userId) throw new StravaAlreadyLinkedError(owner.user.email);
      const old = await tx.stravaConnection.findUnique({ where: { userId } });
      await tx.stravaSyncJob.deleteMany({ where: { userId } });
      if (old && old.athleteKey !== athleteKey) await tx.stravaActivity.deleteMany({ where: { userId } });
      const data = {
        athleteKey, tokens: seal(tokens, config.encryptionKey), consentVersion: STRAVA_CONSENT_VERSION, consentAt,
        syncActive: true, syncPage: 1, syncAfter: 0, syncBefore: Math.floor(Date.now() / 1000),
        leaseId: null, leaseUntil: null, retryAt: null, generation: randomUUID(),
        lastSyncedAt: old?.athleteKey === athleteKey ? old.lastSyncedAt : null,
        syncHistory: old?.athleteKey === athleteKey ? syncHistorySchema.parse(old.syncHistory) : [],
        elevationVersion: old?.athleteKey === athleteKey ? old.elevationVersion : 0,
      };
      await tx.stravaConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      await createSyncJob(tx, userId);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const owner = await db().stravaConnection.findUnique({ where: { athleteKey }, select: { userId: true, user: { select: { email: true } } } });
      if (owner && owner.userId !== userId) throw new StravaAlreadyLinkedError(owner.user.email);
      throw new StravaError("alreadyLinked", 409);
    }
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
        movingSeconds: true, elapsedSeconds: true, averageHr: true, maxHr: true, elevationGainMeters: true, maximalEffort: true, streamState: true } }),
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
    elevationGainMeters: row.elevationGainMeters,
  }));
  const monthActivities = weekDate || year ? activities : activities.filter((activity) => activity.localDate.startsWith(month));
  return {
    connected: !!connection, consentCurrent: connection?.consentVersion === STRAVA_CONSENT_VERSION,
    syncActive: connection?.syncActive ?? false, syncPage: connection?.syncPage ?? 1,
    lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null, retryAt: connection?.retryAt?.toISOString() ?? null,
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
