import "server-only";
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { redisClient } from "@/server/redis";
import { seal, unseal } from "@/features/garmin/server/session";
import { stravaConfig } from "./config";

const TTL_SECONDS = 300;
const entrySchema = z.object({ expiresAt: z.number().finite(), value: z.unknown() });
let warned = false;

async function redis() {
  const client = await redisClient();
  if (!client) {
    if (!warned) { console.warn("strava_cache_disabled", { reason: "redis_not_configured" }); warned = true; }
  }
  return client;
}

function key(userId: string) {
  return `run-week:strava:v1:${createHash("sha256").update(userId).digest("hex")}`;
}

function entryKey(userId: string, field: string) {
  const type = field.startsWith("dashboard:") ? "dashboard" : "sync";
  return `${key(userId)}:${type}:${createHash("sha256").update(field).digest("hex")}`;
}

function cacheSecret(userId: string, field: string) {
  return createHmac("sha256", stravaConfig().encryptionKey)
    .update(`run-week:strava:cache:v1\0${userId}\0${field}`).digest("base64url");
}

export async function readActivityCache<T>(userId: string, field: string, schema: z.ZodType<T>): Promise<T | null> {
  const connection = await redis();
  if (!connection) return null;
  const { redisValue: stored } = z.object({ redisValue: z.string().nullable() })
    .parse({ redisValue: await connection.get(entryKey(userId, field)) });
  if (stored === null) return null;
  const { cacheEntry: entry } = z.object({ cacheEntry: entrySchema })
    .parse({ cacheEntry: unseal(stored, cacheSecret(userId, field), 8_000_000) });
  if (entry.expiresAt <= Date.now()) return null;
  return z.object({ cachePayload: schema }).parse({ cachePayload: entry.value }).cachePayload;
}

export async function writeActivityCache(userId: string, field: string, value: unknown) {
  const connection = await redis();
  if (!connection) return;
  const stored = seal({ expiresAt: Date.now() + TTL_SECONDS * 1000, value }, cacheSecret(userId, field));
  if (stored.length > 8_000_000) throw new Error("Strava cache entry exceeds size limit");
  const entry = entryKey(userId, field);
  const result = await connection.eval(`
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SADD', KEYS[2], KEYS[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1
`, { keys: [entry, key(userId)], arguments: [stored, String(TTL_SECONDS)] });
  z.object({ redisWriteResult: z.literal(1) }).parse({ redisWriteResult: result });
}

export async function clearActivityCache(userId: string, dashboardsOnly = false) {
  const connection = await redis();
  if (!connection) return;
  const { redisIndex: owned } = z.object({ redisIndex: z.array(z.string().refine((entry) =>
    entry.startsWith(`${key(userId)}:`) && /:(dashboard|sync):[a-f0-9]{64}$/.test(entry)))
  }).parse({ redisIndex: await connection.sMembers(key(userId)) });
  const entries = owned.filter((entry) => !dashboardsOnly || entry.startsWith(`${key(userId)}:dashboard:`));
  if (entries.length || !dashboardsOnly) {
    const result = await connection.eval(`
for i = 2, #KEYS do
  redis.call('DEL', KEYS[i])
  redis.call('SREM', KEYS[1], KEYS[i])
end
if ARGV[1] == '1' then redis.call('DEL', KEYS[1]) end
return 1
`, { keys: [key(userId), ...entries], arguments: [dashboardsOnly ? "0" : "1"] });
    z.object({ redisClearResult: z.literal(1) }).parse({ redisClearResult: result });
  }
}
