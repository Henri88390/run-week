import { NextResponse, type NextRequest } from "next/server";
import { websiteUser, failure } from "@/features/strava/server/http";
import { stravaConfig } from "@/features/strava/server/config";
import { beginAuthorization } from "@/features/strava/server/oauth";
import { STRAVA_CONSENT_VERSION } from "@/features/strava/types";
import { StravaError } from "@/features/strava/server/api";
import { hostingProvider } from "@/features/garmin/server/privacy";

export async function POST(request: NextRequest) {
  try {
    const userId = await websiteUser(request);
    if (!hostingProvider()) throw new StravaError("unavailable");
    const form = await request.formData();
    if (form.get("consent") !== STRAVA_CONSENT_VERSION) throw new StravaError("invalid", 400);
    const response = new NextResponse(null, { status: 303, headers: { "Cache-Control": "no-store" } });
    await beginAuthorization(stravaConfig(), userId, response, request);
    return response;
  } catch (error) {
    failure(error, "connect");
    const code = error instanceof StravaError ? error.code : "unavailable";
    return NextResponse.redirect(new URL(`/activities?strava=${code}`, request.nextUrl), { status: 303, headers: { "Cache-Control": "no-store" } });
  }
}
