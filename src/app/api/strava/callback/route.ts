import { connection, NextResponse, type NextRequest } from "next/server";
import { websiteUser } from "@/features/strava/server/http";
import { stravaConfig } from "@/features/strava/server/config";
import { clearStravaAuthorization, consumeAuthorization } from "@/features/strava/server/oauth";
import { exchange, StravaError } from "@/features/strava/server/api";
import { saveConnection } from "@/features/strava/server/store";
import { logStravaFailure } from "@/features/strava/server/diagnostics";

export async function GET(request: NextRequest) {
  await connection();
  let result = "connected";
  try {
    const userId = await websiteUser();
    const config = stravaConfig();
    const auth = await consumeAuthorization(config, userId, request);
    const code = request.nextUrl.searchParams.get("code");
    const scope = request.nextUrl.searchParams.get("scope")?.split(",") ?? [];
    if (request.nextUrl.searchParams.has("error") || !code || code.length > 2048 || !scope.includes("activity:read_all")) throw new StravaError("invalid", 400);
    const tokens = await exchange(config, { grant_type: "authorization_code", code });
    await saveConnection(config, userId, tokens, new Date(auth.consentAt), auth.state);
  } catch (error) {
    result = error instanceof StravaError ? error.code : "unavailable";
    logStravaFailure(error, "callback");
  }
  const response = NextResponse.redirect(new URL(`/activities?strava=${result}`, request.nextUrl), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  clearStravaAuthorization(response, request);
  return response;
}
