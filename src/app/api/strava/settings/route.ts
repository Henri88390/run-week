import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/features/account/server/db";
import { readJson } from "@/features/account/server/http";
import { websiteUser, failure, json } from "@/features/strava/server/http";
import { StravaError } from "@/features/strava/server/api";
import { clearActivityCache } from "@/features/strava/server/cache";

/** `null` restores the shared HRmax preset. Other stored settings are left untouched. */
const bodySchema = z.object({ maxHr: z.number().int().min(60).max(240).nullable() }).strict();

export async function PUT(request: NextRequest) {
  try {
    const userId = await websiteUser(request);
    const parsed = bodySchema.safeParse(await readJson(request, 2048));
    if (!parsed.success) throw new StravaError("invalid", 400);
    // Keep settings/deletion serialized, so a disconnect cannot leave newly written settings.
    await db().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
      if (!await tx.stravaConnection.findUnique({ where: { userId } })) throw new StravaError("notConnected", 409);
      await clearActivityCache(userId, true);
      await tx.runningAnalyticsSettings.upsert({ where: { userId },
        create: { userId, zoneBounds: [], maxHr: parsed.data.maxHr }, update: { maxHr: parsed.data.maxHr } });
    });
    return json({ ok: true });
  } catch (error) { return failure(error, "settings"); }
}
