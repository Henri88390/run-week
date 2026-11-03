import "server-only";
import type { GarminConfig } from "./config";
import type { GarminTokens } from "./garmin-api";
import { GarminApiError } from "./diagnostics";
import { uploadIdentity } from "./session";

/** One atomic reservation, using Redis time rather than an individual function's clock. */
export const RESERVE_UPLOAD_LUA = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local day = math.floor(now / 86400000)
local midnight = (day + 1) * 86400000
local daily = ARGV[1] == '1'
local state = redis.call('HMGET', KEYS[1], 'last', 'day', 'count')
local last = tonumber(state[1])
local storedDay = tonumber(state[2])
local count = tonumber(state[3]) or 0
local wait = 0
if last then wait = math.max(0, 10000 - (now - last)) end
if storedDay ~= day then count = 0 end
if daily and count >= 10 then wait = math.max(wait, midnight - now) end
if wait > 0 then return {0, math.ceil(wait / 1000)} end
redis.call('HSET', KEYS[1], 'last', now, 'day', day, 'count', count + 1)
redis.call('PEXPIRE', KEYS[1], daily and math.max(10000, midnight - now) or 10000)
return {1, 0}
`;

export type UploadReservation = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function redisConfig(): { url: string; token: string } {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  try {
    if (!rawUrl || !token || /[\r\n]/.test(token)) throw new Error();
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.pathname !== "/" || !url.hostname.endsWith(".upstash.io") || url.port) throw new Error();
    return { url: url.origin, token };
  } catch {
    throw new GarminApiError("configuration");
  }
}

/** No retries or memory fallback: even a lost Redis response may have reserved quota. */
export async function reserveUpload(config: GarminConfig, session: GarminTokens): Promise<UploadReservation> {
  const redis = redisConfig();
  const development = process.env.NODE_ENV === "development";
  const key = `run-week:garmin:upload:v1:${development ? "development" : "production"}:${uploadIdentity(session, config)}`;
  try {
    const response = await fetch(redis.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", RESERVE_UPLOAD_LUA, "1", key, development ? "0" : "1"]),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error();
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("result" in body) || "error" in body
      || !Array.isArray(body.result) || body.result.length !== 2) throw new Error();
    const [allowed, retryAfterSeconds]: unknown[] = body.result;
    if (allowed === 1 && retryAfterSeconds === 0) return { allowed: true };
    if (allowed === 0 && typeof retryAfterSeconds === "number" && Number.isInteger(retryAfterSeconds)
      && retryAfterSeconds >= 1 && retryAfterSeconds <= 86400) return { allowed: false, retryAfterSeconds };
    throw new Error();
  } catch {
    // Never propagate provider bodies, keys, URLs, credentials or network exception details.
    throw new GarminApiError("unavailable");
  }
}
