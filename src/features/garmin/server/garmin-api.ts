import "server-only";
import type { GarminConfig } from "./config";

const AUTHORIZE_URL = "https://connect.garmin.com/oauth2Confirm";
const TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const TRAINING_API_URL = "https://apis.garmin.com/training-api";
const TIMEOUT_MS = 15_000;
const DEFAULT_REFRESH_LIFETIME_SECONDS = 90 * 24 * 3600;

export type GarminTokens = {
  consentVersion?: string;
  consentAt?: number;
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  refreshExpiresAt: number;
};

export class GarminApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function authorizationUrl(config: GarminConfig, options: {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
    redirect_uri: options.redirectUri,
    state: options.state,
  }).toString();
  return url.toString();
}

export async function requestTokens(
  config: GarminConfig,
  grant: { grant_type: "authorization_code"; code: string; code_verifier: string; redirect_uri: string }
    | { grant_type: "refresh_token"; refresh_token: string },
): Promise<GarminTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ ...grant, client_id: config.clientId, client_secret: config.clientSecret }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new GarminApiError(response.status, "Garmin token request failed.");
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.access_token !== "string" || !body.access_token
    || typeof body.refresh_token !== "string" || !body.refresh_token
    || (body.expires_in !== undefined && !isPositiveDuration(body.expires_in))
    || (body.refresh_token_expires_in !== undefined && !isPositiveDuration(body.refresh_token_expires_in))) {
    throw new GarminApiError(502, "Garmin token response is invalid.");
  }
  const now = Date.now();
  const expiresAt = now + (body.expires_in ?? 3600) * 1000;
  const refreshExpiresAt = now + (body.refresh_token_expires_in ?? DEFAULT_REFRESH_LIFETIME_SECONDS) * 1000;
  if (!Number.isFinite(expiresAt) || !Number.isFinite(refreshExpiresAt)) {
    throw new GarminApiError(502, "Garmin token expiry is invalid.");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt,
    refreshExpiresAt,
  };
}

async function trainingApi(accessToken: string, path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${TRAINING_API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok && !(init.method === "DELETE" && response.status === 404)) {
    throw new GarminApiError(response.status, `Garmin Training API ${init.method} ${path} failed.`);
  }
  return response;
}

export async function createWorkout(accessToken: string, workout: Record<string, unknown>): Promise<number> {
  const response = await trainingApi(accessToken, "/workout", { method: "POST", body: JSON.stringify(workout) });
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.workoutId !== "number" || !Number.isSafeInteger(body.workoutId)
    || body.workoutId <= 0) throw new GarminApiError(502, "Garmin did not return a valid workout ID.");
  return body.workoutId;
}

export async function scheduleWorkout(accessToken: string, workoutId: number, date: string): Promise<void> {
  await trainingApi(accessToken, "/schedule", { method: "POST", body: JSON.stringify({ workoutId, date }) });
}

/** Deleting a workout also removes its calendar entries. Missing workouts are ignored. */
export async function deleteWorkout(accessToken: string, workoutId: number): Promise<void> {
  await trainingApi(accessToken, `/workout/${workoutId}`, { method: "DELETE" });
}
