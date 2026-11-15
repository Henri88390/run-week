import { connection, type NextRequest } from "next/server";
import { websiteUser, failure, json } from "@/features/strava/server/http";
import { syncPeriodSchema, syncPeriodRange } from "@/features/strava/sync-period";
import { cachedDashboard } from "@/features/strava/server/cached-dashboard";
import { StravaError } from "@/features/strava/server/api";

export async function GET(request: NextRequest) {
  await connection();
  try {
    const userId = await websiteUser();
    const period = syncPeriodSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!period.success) throw new StravaError("invalid", 400);
    const range = syncPeriodRange(period.data);
    const today = new Date().toISOString().slice(0, 10);
    if (range.start > today || (period.data.view === "months" && period.data.month > today.slice(0, 7)))
      throw new StravaError("invalid", 400);
    return json(await cachedDashboard(userId, period.data));
  } catch (error) { return failure(error, "activities"); }
}
