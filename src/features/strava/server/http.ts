import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/features/account/server/auth";
import { headers } from "next/headers";
import { isSameOrigin, NO_STORE } from "@/features/account/server/http";
import { StravaError } from "./api";
import { logStravaFailure } from "./diagnostics";

export function json(body: unknown, status = 200, retry?: number) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...(retry ? { "Retry-After": String(retry) } : {}) } });
}
export async function websiteUser(request?: NextRequest) {
  // Strava endpoints are deliberately not exposed through native bearer routing.
  if ((await headers()).has("authorization") || (request && !isSameOrigin(request))) throw new StravaError("invalid", 403);
  const id = await currentUserId();
  if (!id) throw new StravaError("unauthorized", 401);
  return id;
}
export function failure(error: unknown, operation: string) {
  const known = error instanceof StravaError;
  const requestId = logStravaFailure(error, operation);
  return json({ error: known ? error.code : "unavailable", requestId, retrySeconds: known ? error.retrySeconds : undefined },
    known ? error.status : 503, known ? error.retrySeconds : undefined);
}
export function monthValue(value: string | null): string {
  if (value === null) return new Date().toISOString().slice(0, 7);
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new StravaError("invalid", 400);
  return value;
}
