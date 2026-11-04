import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { seal, unseal, randomToken } from "@/features/garmin/server/session";
import { db } from "@/features/account/server/db";
import { STRAVA_CONSENT_VERSION } from "../types";
import { stravaOrigin, type StravaConfig } from "./config";
import { StravaError } from "./api";

const COOKIE = "run-week-strava-auth";
const authSchema = z.object({
  userId: z.string().min(1), state: z.string().length(43), consentVersion: z.literal(STRAVA_CONSENT_VERSION),
  consentAt: z.number().int().positive(), redirectUri: z.string().url(),
});
function options(request: NextRequest, maxAge: number) {
  return { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax" as const, path: "/api/strava", maxAge };
}
export function clearStravaAuthorization(response: NextResponse, request: NextRequest) {
  response.cookies.set(COOKIE, "", options(request, 0));
}
export async function beginAuthorization(config: StravaConfig, userId: string, response: NextResponse, request: NextRequest) {
  const state = randomToken();
  const consentAt = Date.now();
  await db().$transaction([
    db().verificationToken.deleteMany({ where: { identifier: `strava-oauth:${userId}` } }),
    db().verificationToken.create({ data: {
      identifier: `strava-oauth:${userId}`, token: createHash("sha256").update(state).digest("hex"),
      expires: new Date(consentAt + 600_000),
    } }),
  ]);
  response.cookies.set(COOKIE, seal({ userId, state, consentVersion: STRAVA_CONSENT_VERSION, consentAt, redirectUri: config.redirectUri }, config.encryptionKey), options(request, 600));
  const url = new URL("/oauth/authorize", stravaOrigin());
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code",
    scope: "read,activity:read_all", approval_prompt: "force", state,
  }).toString();
  // Official Strava OAuth does not document PKCE: do not invent parameters.
  response.headers.set("Location", url.toString());
}
export async function consumeAuthorization(config: StravaConfig, userId: string, request: NextRequest) {
  const parsed = authSchema.safeParse(unseal(request.cookies.get(COOKIE)?.value, config.encryptionKey));
  const state = request.nextUrl.searchParams.get("state");
  if (!parsed.success || !state || state.length !== 43 || parsed.data.userId !== userId
    || parsed.data.redirectUri !== config.redirectUri || Date.now() - parsed.data.consentAt > 600_000
    || parsed.data.consentAt > Date.now()
    || !timingSafeEqual(Buffer.from(state), Buffer.from(parsed.data.state))) throw new StravaError("invalid", 400);
  await db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
    const deleted = await tx.verificationToken.deleteMany({ where: {
      identifier: `strava-oauth:${userId}`, token: createHash("sha256").update(state).digest("hex"), expires: { gt: new Date() },
    } });
    if (deleted.count !== 1) throw new StravaError("invalid", 400);
    // A cancellable in-flight ticket, checked again atomically when storing tokens.
    await tx.verificationToken.create({ data: {
      identifier: `strava-oauth:${userId}`, token: createHash("sha256").update(`${state}:claimed`).digest("hex"),
      expires: new Date(parsed.data.consentAt + 600_000),
    } });
  });
  return parsed.data;
}
