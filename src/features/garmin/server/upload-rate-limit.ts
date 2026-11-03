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

type MemoryQuota = { last: number; day: number; count: number; expiresAt: number };
const memoryGlobal = globalThis as typeof globalThis & {
  garminUploadQuotas?: Map<string, MemoryQuota>;
};

function reserveInMemory(key: string, development: boolean): UploadReservation {
  if (!memoryGlobal.garminUploadQuotas) {
    memoryGlobal.garminUploadQuotas = new Map();
    console.warn(JSON.stringify({
      event: "garmin_rate_limit_memory_fallback",
      scope: "process",
      reason: "redis_not_configured",
    }));
  }
  const quotas = memoryGlobal.garminUploadQuotas;
  const now = Date.now();
  for (const [identity, quota] of quotas) {
    if (quota.expiresAt <= now) quotas.delete(identity);
  }
  const day = Math.floor(now / 86400000);
  const midnight = (day + 1) * 86400000;
  const previous = quotas.get(key);
  const count = previous?.day === day ? previous.count : 0;
  let wait = previous ? Math.max(0, 10000 - (now - previous.last)) : 0;
  if (!development && count >= 10) wait = Math.max(wait, midnight - now);
  if (wait > 0) return { allowed: false, retryAfterSeconds: Math.ceil(wait / 1000) };
  quotas.set(key, {
    last: now, day, count: count + 1,
    expiresAt: development ? now + 10000 : Math.max(now + 10000, midnight),
  });
  return { allowed: true };
}

function redisConfig(): { url: string; token: string } | null {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!rawUrl && !token) return null;
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

/** Configured Redis failures never fall back: a lost response may have reserved quota. */
export async function reserveUpload(config: GarminConfig, session: GarminTokens): Promise<UploadReservation> {
  const redis = redisConfig();
  const development = process.env.NODE_ENV === "development";
  const key = `run-week:garmin:upload:v1:${development ? "development" : "production"}:${uploadIdentity(session, config)}`;
  if (!redis) return reserveInMemory(key, development);
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
