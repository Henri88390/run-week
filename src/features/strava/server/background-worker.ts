import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/features/account/server/db";
import { Prisma } from "@/generated/prisma/client";
import { seal, unseal } from "@/features/garmin/server/session";
import { STRAVA_CONSENT_VERSION } from "../types";
import { syncHistorySchema, syncRangesSchema } from "../sync-history";
import { activeSync } from "../background-sync";
import { activity as fetchActivity, authorizedAthlete, exchange, StravaError, StravaRevokedError, streams, summaries, tokenSchema } from "./api";
import { stravaConfig } from "./config";
import { saveSummary } from "./save-summary";
import { clearActivityCache } from "./cache";
import { logStravaFailure } from "./diagnostics";
import { athleteKey } from "./athlete-key";

export async function syncChunk(jobId: string, version: number) {
  const found = await db().stravaSyncJob.findUnique({ where: { id: jobId } });
  if (!found || found.version !== version || !activeSync(found.status)) return { done: true };
  const job = found;
  const leaseId = randomUUID();
  const claimed = await db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${job.userId}`}))`;
    const current = await tx.stravaSyncJob.findUnique({ where: { id: jobId } });
    const connection = await tx.stravaConnection.findUnique({ where: { userId: job.userId } });
    if (!current || current.version !== version || !activeSync(current.status) || !connection
      || connection.generation !== job.generation || connection.consentVersion !== STRAVA_CONSENT_VERSION) return null;
    const now = new Date();
    const waitUntil = Math.max(current.retryAt?.getTime() ?? 0, connection.leaseUntil?.getTime() ?? 0);
    if (waitUntil > now.getTime()) return { waitUntil: new Date(waitUntil).toISOString() };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('strava-global-quota'))`;
    const quota = await tx.stravaSyncQuota.findUnique({ where: { id: "api" } });
    if (quota && quota.nextCallAt > now) return { waitUntil: quota.nextCallAt.toISOString() };
    await tx.stravaSyncQuota.upsert({ where: { id: "api" }, create: { id: "api", nextCallAt: new Date(now.getTime() + 1100) },
      update: { nextCallAt: new Date(now.getTime() + 1100) } });
    await tx.stravaConnection.update({ where: { userId: job.userId }, data: { leaseId, leaseUntil: new Date(now.getTime() + 90_000) } });
    await tx.stravaSyncJob.update({ where: { id: jobId }, data: { status: "running", retryAt: null } });
    return { tokens: connection.tokens, athleteKey: connection.athleteKey };
  });
  if (!claimed) return { done: true };
  if ("waitUntil" in claimed) return { done: false, waitUntil: claimed.waitUntil };

  async function commit(write: (tx: Prisma.TransactionClient) => Promise<void>, tokenRefresh = false) {
    await db().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${job.userId}`}))`;
      const connection = await tx.stravaConnection.findUnique({ where: { userId: job.userId } });
      const current = await tx.stravaSyncJob.findUnique({ where: { id: jobId } });
      if (!connection || connection.generation !== job.generation || connection.leaseId !== leaseId
        || !current || (!tokenRefresh && (current.version !== version || !activeSync(current.status)))) return;
      await write(tx);
      await clearActivityCache(job.userId, true);
    }, { timeout: 30_000 });
  }
  async function pause(seconds: number) {
    const retryAt = new Date(Date.now() + seconds * 1000);
    await commit(async (tx) => {
      await tx.stravaSyncJob.update({ where: { id: jobId }, data: { status: "paused", retryAt } });
    });
    // Provider quota feedback applies even when this version was superseded/completed.
    await db().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('strava-global-quota'))`;
      const current = await tx.stravaSyncQuota.findUnique({ where: { id: "api" } });
      if (current && current.nextCallAt > retryAt) return;
      await tx.stravaSyncQuota.upsert({ where: { id: "api" }, create: { id: "api", nextCallAt: retryAt },
        update: { nextCallAt: retryAt } });
    });
    return { done: false, waitUntil: retryAt.toISOString() };
  }
  try {
    const config = stravaConfig();
    const tokens = tokenSchema.parse(unseal(claimed.tokens, config.encryptionKey));
    if (tokens.expires_at <= Math.floor(Date.now() / 1000) + 60) {
      const refreshed = await exchange(config, { grant_type: "refresh_token", refresh_token: tokens.refresh_token });
      await commit(async (tx) => {
        await tx.stravaConnection.update({ where: { userId: job.userId }, data: { tokens: seal(refreshed, config.encryptionKey) } });
        if (job.errorCode === "refreshAuthorization")
          await tx.stravaSyncJob.updateMany({ where: { id: jobId, version }, data: { errorCode: "refreshedAuthorization" } });
      }, true);
      return { done: false };
    }
    if (job.kind === "webhook-revocation") {
      const result = await authorizedAthlete(tokens.access_token);
      if (athleteKey(config.encryptionKey, result.id) !== claimed.athleteKey) throw new StravaError("unavailable");
      await commit(async (tx) => {
        await tx.stravaSyncJob.update({ where: { id: jobId }, data: { status: "completed", errorCode: null } });
      });
      return result.delay ? await pause(result.delay) : { done: true };
    }
    if (job.kind === "webhook-activity" && job.phase === "summaries") {
      if (!job.sourceId) throw new StravaError("invalid", 400);
      const result = await fetchActivity(tokens.access_token, job.sourceId);
      if (result.data && athleteKey(config.encryptionKey, result.data.athlete.id) !== claimed.athleteKey)
        throw new StravaError("unavailable");
      const run = result.data && ["Run", "TrailRun", "VirtualRun"].includes(result.data.sport_type ?? result.data.type);
      await commit(async (tx) => {
        if (run && result.data) {
          await saveSummary(tx, job.userId, result.data, true);
          await tx.stravaActivity.updateMany({ where: { userId: job.userId, sourceId: job.sourceId ?? "" },
            data: { streams: Prisma.DbNull, streamState: "pending", elevationStreamState: "pending" } });
        } else {
          // 404 means inaccessible/deleted; a changed sport is also no longer a retained run.
          await tx.stravaActivity.deleteMany({ where: { userId: job.userId, sourceId: job.sourceId ?? "" } });
        }
        await tx.stravaSyncJob.update({ where: { id: jobId }, data: {
          webhookDeleted: !run, phase: "streams", summaries: { increment: 1 }, errorCode: null,
          ...(!run ? { status: "completed" } : {}),
        } });
      });
      return result.delay ? await pause(result.delay) : { done: !run };
    }
    if (job.phase === "summaries") {
      const result = await summaries(tokens.access_token, job.page,
        Math.max(0, Math.floor(Date.parse(`${job.start}T00:00:00Z`) / 1000) - 86400),
        Math.min(job.before, Math.floor(Date.parse(`${job.end}T00:00:00Z`) / 1000) + 86400), 200);
      await commit(async (tx) => {
        for (const activity of result.activities) {
          const date = activity.start_date_local.slice(0, 10);
          if (date >= job.start && date < job.end) await saveSummary(tx, job.userId, activity);
        }
        await tx.stravaSyncJob.update({ where: { id: jobId }, data: {
          page: { increment: 1 }, summaries: { increment: result.activities.filter((activity) =>
            ["Run", "TrailRun", "VirtualRun"].includes(activity.sport_type ?? activity.type)
              && activity.start_date_local.slice(0, 10) >= job.start && activity.start_date_local.slice(0, 10) < job.end).length },
          ...(result.activities.length < 200 ? { phase: "streams" } : {}),
        } });
      });
      return result.delay ? await pause(result.delay) : { done: false };
    }
    const pendingStreams = { OR: [{ streamState: "pending" }, { elevationStreamState: "pending" }] };
    const activity = await db().stravaActivity.findFirst({ where: { userId: job.userId, ...pendingStreams,
      ...(job.kind === "webhook-activity" ? { sourceId: job.sourceId ?? "" }
        : { localDate: { gte: job.start, lt: job.end } }) }, orderBy: [{ startedAt: "desc" }, { id: "asc" }] });
    if (activity) {
      const result = await streams(tokens.access_token, activity.sourceId);
      await commit(async (tx) => {
        await tx.stravaActivity.updateMany({ where: { id: activity.id, userId: job.userId, ...pendingStreams },
          data: {
            ...(result.data || activity.streamState === "pending"
              ? { streams: result.data ?? Prisma.DbNull, streamState: result.data ? "ready" : "unavailable" } : {}),
            elevationStreamState: result.data?.altitude ? "ready" : "unavailable",
          } });
        await tx.stravaSyncJob.update({ where: { id: jobId }, data: { recordings: { increment: 1 } } });
      });
      return result.delay ? await pause(result.delay) : { done: false };
    }
    if (job.kind === "webhook-activity") {
      await commit(async (tx) => {
        await tx.stravaSyncJob.update({ where: { id: jobId }, data: { status: "completed", errorCode: null } });
      });
      return { done: true };
    }
    const remaining = syncRangesSchema.parse(job.remaining);
    const next = remaining[0];
    await commit(async (tx) => {
      const connection = await tx.stravaConnection.findUniqueOrThrow({ where: { userId: job.userId } });
      const history = syncHistorySchema.parse(connection.syncHistory);
      const end = job.end < new Date(job.before * 1000).toISOString().slice(0, 10)
        ? job.end : new Date(job.before * 1000).toISOString().slice(0, 10);
      await tx.stravaConnection.update({ where: { userId: job.userId }, data: {
        syncActive: !!next,
        ...(!next ? { lastSyncedAt: new Date(job.before * 1000) } : {}),
        ...(!next && job.kind === "elevation" ? { elevationVersion: 1 } : {}),
        syncHistory: job.start < end ? [...history.filter((entry) => entry.start !== job.start || entry.end !== end),
          { start: job.start, end, syncedAt: new Date().toISOString() }] : history,
      } });
      await tx.stravaSyncJob.update({ where: { id: jobId }, data: next
        ? { start: next.start, end: next.end, remaining: remaining.slice(1), phase: "summaries", page: 1 }
        : { status: "completed", errorCode: null } });
    });
    return { done: !next };
  } catch (error) {
    logStravaFailure(error, "background-sync");
    if (error instanceof StravaError && error.retrySeconds) return await pause(error.retrySeconds);
    if (error instanceof StravaRevokedError) {
      await commit(async (tx) => {
        await clearActivityCache(job.userId);
        await tx.stravaConnection.deleteMany({ where: { userId: job.userId, generation: job.generation } });
        await tx.stravaActivity.deleteMany({ where: { userId: job.userId } });
        await tx.runningAnalyticsSettings.deleteMany({ where: { userId: job.userId } });
        await tx.verificationToken.deleteMany({ where: { identifier: `strava-oauth:${job.userId}` } });
      });
      return { done: true };
    }
    if (job.kind.startsWith("webhook-") && error instanceof StravaError
      && error.diagnostic?.upstreamStatus === 401 && !["refreshAuthorization", "refreshedAuthorization"].includes(job.errorCode ?? "")) {
      // An access-token 401 alone is not proof of revocation: rotate through the shared refresh path.
      await commit(async (tx) => {
        const tokens = tokenSchema.parse(unseal(claimed.tokens, stravaConfig().encryptionKey));
        await tx.stravaConnection.update({ where: { userId: job.userId },
          data: { tokens: seal({ ...tokens, expires_at: 1 }, stravaConfig().encryptionKey) } });
        await tx.stravaSyncJob.update({ where: { id: jobId }, data: { errorCode: "refreshAuthorization" } });
      });
      return { done: false };
    }
    if (error instanceof StravaError && ["unauthorized", "notConnected", "invalid"].includes(error.code)) {
      await commit(async (tx) => {
        await tx.stravaSyncJob.update({ where: { id: jobId }, data: { status: "failed", errorCode: error.code } });
        if (!job.kind.startsWith("webhook-"))
          await tx.stravaConnection.update({ where: { userId: job.userId }, data: { syncActive: false } });
      });
      return { done: true };
    }
    // Never send raw provider errors, data or credentials to the orchestrator.
    throw new Error("Strava background chunk unavailable");
  } finally {
    await db().stravaConnection.updateMany({ where: { userId: job.userId, generation: job.generation, leaseId },
      data: { leaseId: null, leaseUntil: null } });
  }
}
