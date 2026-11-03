import { timingSafeEqual } from "node:crypto";
import { connection, NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/features/account/server/auth";
import { garminConfig } from "@/features/garmin/server/config";
import { requestTokens } from "@/features/garmin/server/garmin-api";
import { clearAuthorization, readAuthorization } from "@/features/garmin/server/session";
import { saveConnection } from "@/features/garmin/server/store";
import { GARMIN_CONSENT_VERSION } from "@/features/garmin/privacy";
import { failureDetails, GarminApiError, logGarminFailure, newRequestId } from "@/features/garmin/server/diagnostics";
import type { GarminErrorCode } from "@/features/garmin/sync-request";

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  await connection();
  const requestId = newRequestId();
  const finish = (result: "connected" | "error" | GarminErrorCode) => {
    const response = NextResponse.redirect(new URL(`/?garmin=${result}`, request.nextUrl));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Request-ID", requestId);
    clearAuthorization(response, request);
    return response;
  };
  try {
    const config = garminConfig();
    if (!config) throw new GarminApiError("configuration");
    const authorization = readAuthorization(request, config);
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (!authorization || authorization.consentVersion !== GARMIN_CONSENT_VERSION
      || typeof authorization.consentAt !== "number"
      || request.nextUrl.searchParams.has("error")
      || !code || code.length > 2048 || !state || state.length !== 43
      || !sameState(state, authorization.state)) throw new GarminApiError("invalid_request");
    // The connection belongs to the account that started the authorization.
    if (await currentUserId() !== authorization.userId) throw new GarminApiError("invalid_request");
    const tokens = await requestTokens(config, {
      grant_type: "authorization_code",
      code,
      code_verifier: authorization.codeVerifier,
      redirect_uri: authorization.redirectUri,
    });
    await saveConnection(config, authorization.userId, tokens, {
      version: authorization.consentVersion, at: new Date(authorization.consentAt),
    });
    return finish("connected");
  } catch (error) {
    logGarminFailure(requestId, "callback", error);
    const code = failureDetails(error).code;
    return finish(code === "invalid" ? "error" : code);
  }
}
