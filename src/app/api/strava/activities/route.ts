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
    if (range.start > new Date().toISOString().slice(0, 10)) throw new StravaError("invalid", 400);
    const data = period.data;
    return json(await cachedDashboard(userId, data.view === "year" ? `${data.year}-01`
      : data.view === "week" ? data.date.slice(0, 7) : data.month,
    data.view === "week" ? data.date : undefined, data.view === "year" ? data.year : undefined));
  } catch (error) { return failure(error, "activities"); }
}
