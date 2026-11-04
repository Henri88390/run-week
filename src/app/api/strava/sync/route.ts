import type { NextRequest } from "next/server";
import { readJson } from "@/features/account/server/http";
import { websiteUser, failure, json } from "@/features/strava/server/http";
import { syncStep } from "@/features/strava/server/store";
import { stravaConfig } from "@/features/strava/server/config";
import { StravaError } from "@/features/strava/server/api";
import { z } from "zod";
import { db } from "@/features/account/server/db";
import { syncPeriodSchema } from "@/features/strava/sync-period";
import { syncPeriod } from "@/features/strava/server/sync-period";

export async function POST(request: NextRequest) {
  try {
    const userId = await websiteUser(request);
    const parsed = z.union([syncPeriodSchema, z.object({ backfill: z.boolean().optional() }).strict()]).safeParse(await readJson(request, 1024));
    if (!parsed.success) throw new StravaError("invalid", 400);
    if ("view" in parsed.data) {
      await syncPeriod(stravaConfig(), userId, parsed.data, AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]));
      return json({ ok: true });
    }
    await syncStep(stravaConfig(), userId, parsed.data.backfill);
    const [connection, pending] = await Promise.all([
      db().stravaConnection.findUnique({ where: { userId }, select: { syncActive: true, retryAt: true } }),
      db().stravaActivity.count({ where: { userId, streamState: "pending" } }),
    ]);
    if (!connection) throw new StravaError("notConnected", 409);
    return json({ ok: true, syncActive: connection.syncActive, pending, retryAt: connection.retryAt?.toISOString() ?? null });
  } catch (error) { return failure(error, "sync"); }
}
