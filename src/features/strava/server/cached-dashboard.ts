import "server-only";
import { db } from "@/features/account/server/db";
import { STRAVA_CONSENT_VERSION, dashboardSchema } from "../types";
import { dashboard } from "./store";
import { readActivityCache, writeActivityCache } from "./cache";
import { StravaError } from "./api";
import type { SyncPeriod } from "../sync-period";

export async function cachedDashboard(userId: string, period: SyncPeriod, today = new Date().toISOString().slice(0, 10)) {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
    const linked = await tx.stravaConnection.findUnique({ where: { userId }, select: { consentVersion: true } });
    if (!linked || linked.consentVersion !== STRAVA_CONSENT_VERSION) throw new StravaError("notConnected", 409);
    const key = period.view === "year" ? `year:${period.year}` : period.view === "week" ? `week:${period.date}`
      : period.view === "months" ? `months:${period.count}:${period.month}` : `month:${period.month}`;
    const field = `dashboard:v17:${key}:${today}`;
    const cached = await readActivityCache(userId, field, dashboardSchema);
    if (cached) return cached;
    const data = await dashboard(userId, period, today);
    await writeActivityCache(userId, field, data);
    return data;
  }, { timeout: 10_000 });
}
