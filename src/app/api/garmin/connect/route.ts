import { NextResponse, type NextRequest } from "next/server";
import { garminConfig } from "@/features/garmin/server/config";
import { authorizationUrl } from "@/features/garmin/server/garmin-api";
import { pkceChallenge, randomToken, writeAuthorization } from "@/features/garmin/server/session";

export async function GET(request: NextRequest) {
  const config = garminConfig();
  if (!config) return NextResponse.redirect(new URL("/?garmin=unavailable", request.nextUrl));
  const state = randomToken();
  const codeVerifier = randomToken(48);
  const redirectUri = config.redirectUri ?? new URL("/api/garmin/callback", request.nextUrl.origin).toString();
  const response = NextResponse.redirect(authorizationUrl(config, {
    state,
    codeChallenge: pkceChallenge(codeVerifier),
    redirectUri,
  }));
  writeAuthorization(response, request, config, { state, codeVerifier, redirectUri });
  return response;
}
