import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { db } from "@/features/account/server/db";
import { Prisma } from "@/generated/prisma/client";
import { seal, unseal } from "@/features/garmin/server/session";
import { STRAVA_CONSENT_VERSION } from "../types";
import { syncPeriodRange, type SyncPeriod } from "../sync-period";
import { exchange, streams, summaries, StravaError, tokenSchema } from "./api";
import type { StravaConfig } from "./config";
import { saveSummary } from "./save-summary";
import { readActivityCache, writeActivityCache, clearActivityCache } from "./cache";
import { z } from "zod";
import { periodSynchronized, syncHistorySchema } from "../sync-history";

export async function syncPeriod(config: StravaConfig, userId: string, period: SyncPeriod, signal: AbortSignal) {
  const range = syncPeriodRange(period);
  if (range.start > new Date().toISOString().slice(0, 10)) throw new StravaError("invalid", 400);
  const localDate = { gte: range.start, lt: range.end };
  const after = Math.floor(Date.parse(`${range.start}T00:00:00Z`) / 1000) - 86400;
  const before = Math.floor(Date.parse(`${range.end}T00:00:00Z`) / 1000) + 86400;
  const cacheField = `sync:${range.start}:${range.end}`;
  const leaseId = randomUUID();
  const now = new Date();
  const claimed = await db().stravaConnection.updateMany({
    where: { userId, consentVersion: STRAVA_CONSENT_VERSION, AND: [
      { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      { OR: [{ retryAt: null }, { retryAt: { lte: now } }] },
    ] },
    data: { leaseId, leaseUntil: new Date(Date.now() + 90_000) },
  });
  if (!claimed.count) {
    const row = await db().stravaConnection.findUnique({ where: { userId } });
    if (!row || row.consentVersion !== STRAVA_CONSENT_VERSION) throw new StravaError("notConnected", 409);
    throw new StravaError("rateLimited", 429, Math.max(1, Math.ceil(((row.retryAt ?? row.leaseUntil ?? now).getTime() - Date.now()) / 1000)));
  }
  let retryAt: Date | null = null;
  let calls = 0;
  async function beforeCall() {
    signal.throwIfAborted();
    if (calls++) await wait(1000, undefined, { signal });
    const active = await db().stravaConnection.updateMany({
      where: { userId, leaseId }, data: { leaseUntil: new Date(Date.now() + 90_000) },
    });
    if (!active.count) throw new StravaError("notConnected", 409);
    signal.throwIfAborted();
    await clearActivityCache(userId, true);
  }
  function checkQuota(delay?: number) {
    if (delay) throw new StravaError("rateLimited", 429, delay);
  }
  async function commit(write: (tx: Prisma.TransactionClient) => Promise<void>) {
    signal.throwIfAborted();
    await db().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
      const active = await tx.stravaConnection.updateMany({
        where: { userId, leaseId }, data: { leaseUntil: new Date(Date.now() + 90_000) },
      });
      if (!active.count) throw new StravaError("notConnected", 409);
      signal.throwIfAborted();
      await write(tx);
    });
  }
  try {
    const row = await db().stravaConnection.findUnique({ where: { userId } });
    if (!row || row.leaseId !== leaseId) throw new StravaError("notConnected", 409);
    const { syncHistory: history } = z.object({ syncHistory: syncHistorySchema }).parse({ syncHistory: row.syncHistory });
    if (periodSynchronized(history, range, new Date().toISOString().slice(0, 10))) return;
    if (await readActivityCache(userId, cacheField, z.literal(true))) return;
    const parsed = tokenSchema.safeParse(unseal(row.tokens, config.encryptionKey));
    if (!parsed.success) throw new StravaError("unauthorized", 401);
    let tokens = parsed.data;
    for (let page = 1; ; page++) {
      if (tokens.expires_at <= Math.floor(Date.now() / 1000) + 60) {
        await beforeCall();
        tokens = await exchange(config, { grant_type: "refresh_token", refresh_token: tokens.refresh_token }, signal);
        await commit(async (tx) => {
          await tx.stravaConnection.updateMany({ where: { userId, leaseId }, data: { tokens: seal(tokens, config.encryptionKey) } });
        });
      }
      await beforeCall();
      const result = await summaries(tokens.access_token, page, after, before, 200, signal);
      await commit(async (tx) => {
        for (const activity of result.activities) {
          const date = activity.start_date_local.slice(0, 10);
          if (date < range.start || date >= range.end) continue;
          await saveSummary(tx, userId, activity);
        }
      });
      checkQuota(result.delay);
      if (result.activities.length < 200) break;
    }
    for (;;) {
      signal.throwIfAborted();
      const activity = await db().stravaActivity.findFirst({
        where: { userId, localDate, streamState: "pending" }, orderBy: { startedAt: "desc" },
      });
      if (!activity) break;
      await beforeCall();
      const result = await streams(tokens.access_token, activity.sourceId, signal);
      await commit(async (tx) => {
        await tx.stravaActivity.updateMany({ where: { userId, id: activity.id },
          data: { streams: result.data ?? Prisma.DbNull, streamState: result.data ? "ready" : "unavailable" } });
      });
      checkQuota(result.delay);
    }
    await commit(async (tx) => {
      const completedAt = new Date();
      await tx.stravaConnection.updateMany({ where: { userId, leaseId }, data: {
        lastSyncedAt: completedAt, syncActive: false,
        syncHistory: [...history.filter((entry) => entry.start !== range.start || entry.end !== range.end),
          { ...range, syncedAt: completedAt.toISOString() }],
      } });
      await clearActivityCache(userId, true);
      await writeActivityCache(userId, cacheField, true);
    });
  } catch (error) {
    if (error instanceof StravaError && error.retrySeconds) retryAt = new Date(Date.now() + error.retrySeconds * 1000);
    if (signal.aborted) throw new StravaError("unavailable", 504);
    throw error;
  } finally {
    await db().stravaConnection.updateMany({
      where: { userId, leaseId }, data: { leaseId: null, leaseUntil: null, retryAt: retryAt ?? new Date(Date.now() + 1000) },
    });
  }
}
