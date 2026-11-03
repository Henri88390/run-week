import { NextResponse, type NextRequest } from "next/server";
import { garminConfig } from "@/features/garmin/server/config";
import { authorizationUrl } from "@/features/garmin/server/garmin-api";
import { pkceChallenge, randomToken, writeAuthorization } from "@/features/garmin/server/session";
import { hostingProvider } from "@/features/garmin/server/privacy";
import { GARMIN_CONSENT_VERSION } from "@/features/garmin/privacy";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/garmin/consent", request.nextUrl));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return new NextResponse("Cross-site authorization is not allowed.", { status: 403 });
  }
  if (!hostingProvider()) {
    return new NextResponse("Garmin authorization is unavailable until the hosting provider is disclosed in the privacy policy.", { status: 503 });
  }
  let consent: FormDataEntryValue | null;
  try {
    consent = (await request.formData()).get("consent");
  } catch {
    return new NextResponse("Please read the privacy policy and consent before connecting Garmin.", { status: 400 });
  }
  if (consent !== GARMIN_CONSENT_VERSION) {
    return new NextResponse("Please read the privacy policy and consent before connecting Garmin.", { status: 400 });
  }
  const config = garminConfig();
  if (!config) {
    const response = NextResponse.redirect(new URL("/?garmin=unavailable", request.nextUrl), 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const state = randomToken();
  const codeVerifier = randomToken(48);
  const redirectUri = config.redirectUri ?? new URL("/api/garmin/callback", request.nextUrl.origin).toString();
  const response = NextResponse.redirect(authorizationUrl(config, {
    state,
    codeChallenge: pkceChallenge(codeVerifier),
    redirectUri,
  }), 303);
  response.headers.set("Cache-Control", "no-store");
  writeAuthorization(response, request, config, {
    state, codeVerifier, redirectUri, consentVersion: GARMIN_CONSENT_VERSION, consentAt: Date.now(),
  });
  return response;
}
