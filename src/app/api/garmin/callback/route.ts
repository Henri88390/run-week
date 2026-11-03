import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { garminConfig } from "@/features/garmin/server/config";
import { requestTokens } from "@/features/garmin/server/garmin-api";
import { clearAuthorization, readAuthorization, writeSession } from "@/features/garmin/server/session";
import { GARMIN_CONSENT_VERSION } from "@/features/garmin/privacy";

function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  const config = garminConfig();
  const finish = (result: "connected" | "error" | "unavailable") => {
    const response = NextResponse.redirect(new URL(`/?garmin=${result}`, request.nextUrl));
    clearAuthorization(response, request);
    return response;
  };
  if (!config) return finish("unavailable");

  const authorization = readAuthorization(request, config);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!authorization || authorization.consentVersion !== GARMIN_CONSENT_VERSION
    || typeof authorization.consentAt !== "number"
    || !code || !state || !sameState(state, authorization.state)) return finish("error");

  try {
    const tokens = await requestTokens(config, {
      grant_type: "authorization_code",
      code,
      code_verifier: authorization.codeVerifier,
      redirect_uri: authorization.redirectUri,
    });
    const response = finish("connected");
    writeSession(response, request, config, {
      ...tokens, consentVersion: authorization.consentVersion, consentAt: authorization.consentAt,
    });
    return response;
  } catch {
    return finish("error");
  }
}
