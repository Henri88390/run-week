import "server-only";
import { db } from "@/features/account/server/db";
import { STRAVA_CONSENT_VERSION, dashboardSchema } from "../types";
import { dashboard } from "./store";
import { readActivityCache, writeActivityCache } from "./cache";
import { StravaError } from "./api";

export async function cachedDashboard(userId: string, month: string, weekDate?: string, year?: string, today = new Date().toISOString().slice(0, 10)) {
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
    const linked = await tx.stravaConnection.findUnique({ where: { userId }, select: { consentVersion: true } });
    if (!linked || linked.consentVersion !== STRAVA_CONSENT_VERSION) throw new StravaError("notConnected", 409);
    const field = `dashboard:v10:${year ? `year:${year}` : weekDate ? `week:${weekDate}` : `month:${month}`}:${today}`;
    const cached = await readActivityCache(userId, field, dashboardSchema);
    if (cached) return cached;
    const data = await dashboard(userId, month, weekDate, year, today);
    await writeActivityCache(userId, field, data);
    return data;
  }, { timeout: 10_000 });
}
