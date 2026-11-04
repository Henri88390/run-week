import "server-only";
import { createHmac } from "node:crypto";
import { redisClient, RedisConfigurationError } from "@/server/redis";
import type { GarminConfig } from "./config";
import { GarminApiError } from "./diagnostics";

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

/** Keyed by an HMAC of the account ID so Redis never holds the raw ID. */
export function uploadIdentity(userId: string, config: GarminConfig): string {
  return createHmac("sha256", config.sessionSecret).update("run-week:garmin:upload-identity:v2\0").update(userId).digest("hex");
}

/** Configured Redis failures never fall back: a lost response may have reserved quota. */
export async function reserveUpload(config: GarminConfig, userId: string): Promise<UploadReservation> {
  const development = process.env.NODE_ENV === "development";
  const key = `run-week:garmin:upload:v2:${development ? "development" : "production"}:${uploadIdentity(userId, config)}`;
  try {
    const redis = await redisClient();
    if (!redis) return reserveInMemory(key, development);
    const result: unknown = await redis.eval(RESERVE_UPLOAD_LUA, {
      keys: [key],
      arguments: [development ? "0" : "1"],
    });
    if (!Array.isArray(result) || result.length !== 2) throw new Error();
    const [allowed, retryAfterSeconds]: unknown[] = result;
    if (allowed === 1 && retryAfterSeconds === 0) return { allowed: true };
    if (allowed === 0 && typeof retryAfterSeconds === "number" && Number.isInteger(retryAfterSeconds)
      && retryAfterSeconds >= 1 && retryAfterSeconds <= 86400) return { allowed: false, retryAfterSeconds };
    throw new Error();
  } catch (error) {
    // Never propagate provider bodies, keys, URLs, credentials or network exception details.
    if (error instanceof RedisConfigurationError) throw new GarminApiError("configuration");
    throw new GarminApiError("unavailable");
  }
}
