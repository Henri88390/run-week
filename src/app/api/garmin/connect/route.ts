import { NextResponse, type NextRequest } from "next/server";
import { garminConfig } from "@/features/garmin/server/config";
import { authorizationUrl } from "@/features/garmin/server/garmin-api";
import { pkceChallenge, randomToken, writeAuthorization } from "@/features/garmin/server/session";
import { hostingProvider } from "@/features/garmin/server/privacy";
import { GARMIN_CONSENT_VERSION } from "@/features/garmin/privacy";
import { failureDetails, GarminApiError, logGarminFailure, newRequestId } from "@/features/garmin/server/diagnostics";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/garmin/consent", request.nextUrl));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
      logGarminFailure(requestId, "connect", new GarminApiError("invalid_request"));
      return NextResponse.json({ error: "invalid" }, {
        status: 403, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    }
    if (!hostingProvider()) throw new GarminApiError("configuration");
    const form = await request.formData().catch(() => null);
    if (form?.get("consent") !== GARMIN_CONSENT_VERSION) throw new GarminApiError("invalid_request");
    const config = garminConfig();
    if (!config) throw new GarminApiError("configuration");
    const state = randomToken();
    const codeVerifier = randomToken(48);
    const redirectUri = config.redirectUri ?? new URL("/api/garmin/callback", request.nextUrl.origin).toString();
    const response = NextResponse.redirect(authorizationUrl(config, {
      state,
      codeChallenge: pkceChallenge(codeVerifier),
      redirectUri,
    }), 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-ID", requestId);
    writeAuthorization(response, request, config, {
      state, codeVerifier, redirectUri, consentVersion: GARMIN_CONSENT_VERSION, consentAt: Date.now(),
    });
    return response;
  } catch (error) {
    logGarminFailure(requestId, "connect", error);
    const code = failureDetails(error).code;
    const response = NextResponse.redirect(new URL(`/?garmin=${code === "invalid" ? "error" : code}`, request.nextUrl), 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Request-ID", requestId);
    return response;
  }
}
