import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { GarminConfig } from "./config";
import { requestTokens, type GarminTokens } from "./garmin-api";
import { GARMIN_CONSENT_VERSION } from "../privacy";

export const SESSION_COOKIE = "run-week-garmin";
export const AUTHORIZATION_COOKIE = "run-week-garmin-auth";
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

type Authorization = {
  state: string; codeVerifier: string; redirectUri: string; consentVersion: string; consentAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGarminTokens(value: unknown): value is GarminTokens {
  return isRecord(value)
    && typeof value.accessToken === "string" && value.accessToken.length > 0
    && typeof value.refreshToken === "string" && value.refreshToken.length > 0
    && typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt)
    && typeof value.refreshExpiresAt === "number" && Number.isFinite(value.refreshExpiresAt)
    && value.consentVersion === GARMIN_CONSENT_VERSION
    && typeof value.consentAt === "number" && Number.isFinite(value.consentAt);
}

function isAuthorization(value: unknown): value is Authorization {
  return isRecord(value)
    && typeof value.state === "string" && value.state.length > 0
    && typeof value.codeVerifier === "string" && value.codeVerifier.length > 0
    && typeof value.redirectUri === "string" && value.redirectUri.length > 0
    && value.consentVersion === GARMIN_CONSENT_VERSION
    && typeof value.consentAt === "number" && Number.isFinite(value.consentAt);
}

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM, so cookie contents are both confidential and tamper-evident. */
export function seal(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function unseal(sealed: string | undefined, secret: string): unknown | null {
  if (!sealed || sealed.length > 8192) return null;
  try {
    const bytes = Buffer.from(sealed, "base64url");
    if (bytes.length < 28) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const value: unknown = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
    return value;
  } catch {
    return null;
  }
}

function cookieOptions(request: NextRequest, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: "/api/garmin",
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  };
}

export function readSession(request: NextRequest, config: GarminConfig): GarminTokens | null {
  const tokens = unseal(request.cookies.get(SESSION_COOKIE)?.value, config.sessionSecret);
  return isGarminTokens(tokens) && tokens.refreshExpiresAt > Date.now() ? tokens : null;
}

export function writeSession(response: NextResponse, request: NextRequest, config: GarminConfig, tokens: GarminTokens) {
  response.cookies.set(SESSION_COOKIE, seal(tokens, config.sessionSecret),
    cookieOptions(request, (tokens.refreshExpiresAt - Date.now()) / 1000));
}

export function clearSession(response: NextResponse, request: NextRequest) {
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(request, 0));
}

export function writeAuthorization(response: NextResponse, request: NextRequest, config: GarminConfig, value: Authorization) {
  response.cookies.set(AUTHORIZATION_COOKIE, seal(value, config.sessionSecret), cookieOptions(request, 600));
}

export function readAuthorization(request: NextRequest, config: GarminConfig): Authorization | null {
  const authorization = unseal(request.cookies.get(AUTHORIZATION_COOKIE)?.value, config.sessionSecret);
  return isAuthorization(authorization) ? authorization : null;
}

export function clearAuthorization(response: NextResponse, request: NextRequest) {
  response.cookies.set(AUTHORIZATION_COOKIE, "", cookieOptions(request, 0));
}

/** Refreshes the access token shortly before it expires. Garmin rotates the refresh token on refresh. */
export async function freshTokens(
  config: GarminConfig,
  tokens: GarminTokens,
): Promise<{ tokens: GarminTokens; refreshed: boolean }> {
  if (tokens.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return { tokens, refreshed: false };
  return {
    tokens: {
      ...await requestTokens(config, { grant_type: "refresh_token", refresh_token: tokens.refreshToken }),
      consentVersion: tokens.consentVersion,
      consentAt: tokens.consentAt,
    },
    refreshed: true,
  };
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Rejects cross-site state-changing requests in addition to the SameSite=Lax session cookie. */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin === request.nextUrl.origin;
}
