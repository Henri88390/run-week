import { connection, NextResponse, type NextRequest } from "next/server";
import { websiteUser } from "@/features/strava/server/http";
import { stravaConfig } from "@/features/strava/server/config";
import { clearStravaAuthorization, consumeAuthorization } from "@/features/strava/server/oauth";
import { exchange, StravaAlreadyLinkedError, StravaError } from "@/features/strava/server/api";
import { saveConnection } from "@/features/strava/server/store";
import { logStravaFailure } from "@/features/strava/server/diagnostics";
import { currentSyncJob, publishJob } from "@/features/strava/server/background-jobs";
import { writeLinkedAccountNotice } from "@/features/strava/server/linked-account-notice";

export async function GET(request: NextRequest) {
  await connection();
  let result = "connected";
  let userId: string | undefined;
  let linkedEmail: string | null = null;
  try {
    userId = await websiteUser();
    const config = stravaConfig();
    const auth = await consumeAuthorization(config, userId, request);
    const code = request.nextUrl.searchParams.get("code");
    const scope = request.nextUrl.searchParams.get("scope")?.split(",") ?? [];
    if (request.nextUrl.searchParams.has("error") || !code || code.length > 2048 || !scope.includes("activity:read_all")) throw new StravaError("invalid", 400);
    const tokens = await exchange(config, { grant_type: "authorization_code", code });
    await saveConnection(config, userId, tokens, new Date(auth.consentAt), auth.state);
    const job = await currentSyncJob(userId);
    if (job) await publishJob(job.id);
  } catch (error) {
    result = error instanceof StravaError ? error.code : "unavailable";
    if (error instanceof StravaAlreadyLinkedError) linkedEmail = error.accountEmail;
    logStravaFailure(error, "callback");
  }
  const response = NextResponse.redirect(new URL(`/activities?strava=${result}`, request.nextUrl), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  clearStravaAuthorization(response, request);
  writeLinkedAccountNotice(response, request, userId, linkedEmail);
  return response;
}
