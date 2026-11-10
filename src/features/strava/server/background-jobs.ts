import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/features/account/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { STRAVA_CONSENT_VERSION } from "../types";
import { rangePreviouslySynchronized, syncHistorySchema, uncoveredRanges } from "../sync-history";
import { activeSync, syncJobSchema } from "../background-sync";
import { StravaError } from "./api";
import { inngest } from "./inngest";
import { logStravaFailure, logStravaRecovery } from "./diagnostics";

const activeStatuses = ["queued", "running", "paused"];
const importKinds = ["history", "incremental", "elevation"];

export async function createSyncJob(tx: Prisma.TransactionClient, userId: string) {
  const connection = await tx.stravaConnection.findUnique({ where: { userId } });
  if (!connection || connection.consentVersion !== STRAVA_CONSENT_VERSION) throw new StravaError("notConnected", 409);
  const existing = await tx.stravaSyncJob.findFirst({ where: { userId, kind: { in: importKinds }, status: { in: activeStatuses } } });
  if (existing) return existing;
  const history = syncHistorySchema.parse(connection.syncHistory);
  const elevationBackfill = connection.elevationVersion < 1;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const range = {
    start: !elevationBackfill && connection.lastSyncedAt && rangePreviouslySynchronized(history, {
      start: "1970-01-01", end: connection.lastSyncedAt.toISOString().slice(0, 10),
    })
      ? new Date(Math.max(0, connection.lastSyncedAt.getTime() - 86400_000)).toISOString().slice(0, 10)
      : "1970-01-01",
    end: new Date(now.getTime() + 86400_000).toISOString().slice(0, 10),
  };
  if (range.start > today) throw new StravaError("invalid", 400);
  const incremental = range.start !== "1970-01-01";
  const gaps = incremental || elevationBackfill ? [range] : uncoveredRanges(history, range, today);
  const first = gaps[0];
  if (!first) return null;
  // Scheduled retries resume the saved page rather than refetching the same range.
  const unfinished = await tx.stravaSyncJob.findFirst({ where: { userId, generation: connection.generation, kind: { in: importKinds },
    OR: [{ status: "failed", errorCode: "unavailable" }, { status: "cancelled" }] }, orderBy: { updatedAt: "desc" } });
  await tx.stravaConnection.update({ where: { userId }, data: { syncActive: true } });
  if (unfinished) return tx.stravaSyncJob.update({ where: { id: unfinished.id }, data: {
    status: "queued", errorCode: null, publishedAt: null, retryAt: null, version: { increment: 1 },
    ...(elevationBackfill && unfinished.kind !== "elevation" ? {
      kind: "elevation", start: first.start, end: first.end, remaining: gaps.slice(1),
      phase: "summaries", page: 1, summaries: 0, recordings: 0, before: Math.floor(now.getTime() / 1000),
    } : {}),
  } });
  return tx.stravaSyncJob.create({ data: {
    id: randomUUID(), userId, generation: connection.generation, kind: elevationBackfill ? "elevation" : incremental ? "incremental" : "history",
    start: first.start, end: first.end, remaining: gaps.slice(1),
    before: Math.min(Math.floor(now.getTime() / 1000), Math.floor(Date.parse(`${range.end}T00:00:00Z`) / 1000) + 86400),
  } });
}

export async function publishJob(jobId: string) {
  const job = await db().stravaSyncJob.findUnique({ where: { id: jobId } });
  if (!job || job.publishedAt || !activeSync(job.status)) return;
  try {
    await inngest.send({ id: `strava-sync:${job.id}:${job.version}`, name: "strava/sync.requested",
      data: { jobId: job.id, version: job.version } });
    await db().stravaSyncJob.updateMany({ where: { id: job.id, version: job.version, publishedAt: null },
      data: { publishedAt: new Date() } });
  } catch (error) {
    // The database outbox remains queued; the scheduled dispatcher will retry delivery.
    logStravaFailure(error, "sync-dispatch");
    throw new StravaError("unavailable");
  }
}

// Inngest acceptance is not execution acknowledgement. Without a persisted run ID
// or a supported SDK run-status lookup, age alone cannot identify a lost event.
const recoveryGraceMs = 30 * 60_000;

/** Recover at most the queue head, and only after global database quiescence. */
export async function recoverPublishedSyncJob() {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('strava-outbox-recovery'))`;
    const now = new Date();
    const cutoff = new Date(now.getTime() - recoveryGraceMs);
    // Include unpublished heads: never leapfrog a legitimate concurrency backlog.
    const head = await tx.stravaSyncJob.findFirst({ where: { status: "queued" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (!head?.publishedAt || head.publishedAt > cutoff || head.updatedAt > cutoff) return 0;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${head.userId}`}))`;
    const current = await tx.stravaSyncJob.findUnique({ where: { id: head.id } });
    if (!current || current.version !== head.version || current.status !== "queued"
      || current.publishedAt?.getTime() !== head.publishedAt.getTime()
      || current.updatedAt.getTime() !== head.updatedAt.getTime()) return 0;
    const connection = await tx.stravaConnection.findUnique({ where: { userId: head.userId } });
    if (!connection || connection.generation !== head.generation
      || connection.consentVersion !== STRAVA_CONSENT_VERSION) return 0;
    const ageMinutes = Math.floor((now.getTime() - head.publishedAt.getTime()) / 60_000);
    // Lock order matches the worker (user, then global quota). Re-read quota under
    // its lock, including sleeps that started before wait persistence was deployed.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('strava-global-quota'))`;
    const quota = await tx.stravaSyncQuota.findUnique({ where: { id: "api" } });
    const busy = await tx.stravaSyncJob.findFirst({ where: { OR: [
      { status: { in: ["running", "paused"] } },
      { status: { in: activeStatuses }, retryAt: { gt: cutoff } },
      // Completed/cancelled jobs also demonstrate recent queue progress.
      { updatedAt: { gt: cutoff } },
    ] }, select: { id: true } });
    const leased = await tx.stravaConnection.findFirst({ where: { leaseUntil: { gt: now } }, select: { userId: true } });
    if (busy || leased || (quota && quota.nextCallAt > cutoff)) {
      logStravaRecovery("deferred", ageMinutes);
      return 0;
    }
    const recovered = await tx.stravaSyncJob.updateMany({ where: {
      id: head.id, version: head.version, status: "queued", publishedAt: head.publishedAt, updatedAt: head.updatedAt,
    }, data: { version: { increment: 1 }, publishedAt: null, retryAt: null } });
    if (recovered.count) logStravaRecovery("requeued", ageMinutes);
    // Publishing happens through the normal outbox, after this transaction commits.
    // A crash/send failure therefore cannot lose the replacement event.
    return recovered.count;
  });
}

export async function scheduleDueSyncAccounts() {
  const accounts = await db().stravaConnection.findMany({
    where: { consentVersion: STRAVA_CONSENT_VERSION,
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(Date.now() - 86400_000) } }, { elevationVersion: { lt: 1 } }],
      jobs: { none: { kind: { in: importKinds }, OR: [{ status: { in: activeStatuses } },
        { status: "failed", errorCode: { in: ["invalid", "unauthorized", "notConnected"] } }] } } },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } }, take: 100, select: { userId: true },
  });
  for (const { userId } of accounts) {
    const job = await db().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
      return createSyncJob(tx, userId);
    });
    if (job) await publishJob(job.id);
  }
  return accounts.length;
}

export function jobStatus(job: { id: string; status: string; phase: string; summaries: number; recordings: number; retryAt: Date | null; errorCode: string | null }) {
  return syncJobSchema.parse({ ...job, retryAt: job.retryAt?.toISOString() ?? null });
}

export async function currentSyncJob(userId: string) {
  const job = await db().stravaSyncJob.findFirst({ where: { userId, status: { in: activeStatuses } }, orderBy: { updatedAt: "desc" } })
    ?? await db().stravaSyncJob.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" } });
  return job ? jobStatus(job) : null;
}

export async function currentSyncState(userId: string) {
  const [job, latest] = await Promise.all([
    currentSyncJob(userId),
    db().stravaSyncJob.findFirst({ where: { userId }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { id: true, version: true, updatedAt: true } }),
  ]);
  return { job, revision: latest ? `${latest.id}:${latest.version}:${latest.updatedAt.toISOString()}` : "none" };
}

/** Requeue only transiently failed targeted work; never start a broad resync. */
export async function retryWebhookJobs() {
  const jobs = await db().stravaSyncJob.findMany({ where: {
    kind: { in: ["webhook-activity", "webhook-revocation"] }, status: "failed", errorCode: "unavailable",
    updatedAt: { lt: new Date(Date.now() - 600_000) },
  }, orderBy: { updatedAt: "asc" }, take: 100, select: { id: true, userId: true, version: true } });
  for (const job of jobs) await db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${job.userId}`}))`;
    await tx.stravaSyncJob.updateMany({ where: { id: job.id, version: job.version, status: "failed", errorCode: "unavailable" },
      data: { status: "queued", version: { increment: 1 }, publishedAt: null, errorCode: null } });
  });
  return jobs.length;
}
