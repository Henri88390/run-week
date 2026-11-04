import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/features/account/server/db";
import { readJson } from "@/features/account/server/http";
import { websiteUser, failure, json } from "@/features/strava/server/http";
import { StravaError } from "@/features/strava/server/api";
import { stravaConfig } from "@/features/strava/server/config";
import { syncStep } from "@/features/strava/server/store";
import { clearActivityCache } from "@/features/strava/server/cache";

export async function POST(request: NextRequest, context: RouteContext<"/api/strava/activities/[id]">) {
  try {
    const userId = await websiteUser(request);
    const { id } = await context.params;
    if (!id || id.length > 128) throw new StravaError("invalid", 400);
    await syncStep(stravaConfig(), userId, false, id);
    return json({ ok: true });
  } catch (error) { return failure(error, "activity-streams"); }
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/strava/activities/[id]">) {
  try {
    const userId = await websiteUser(request);
    const { id } = await context.params;
    const parsed = z.object({ maximalEffort: z.boolean() }).strict().safeParse(await readJson(request, 1024));
    if (!parsed.success || id.length > 128) throw new StravaError("invalid", 400);
    const result = await db().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
      await clearActivityCache(userId, true);
      return tx.stravaActivity.updateMany({ where: { id, userId }, data: parsed.data });
    });
    if (!result.count) return json({ error: "invalid" }, 404);
    return json({ ok: true });
  } catch (error) { return failure(error, "effort"); }
}
