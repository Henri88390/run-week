import "server-only";
import { createClient } from "redis";

export class RedisConfigurationError extends Error {
  constructor() { super("Invalid Redis configuration"); }
}

let client: ReturnType<typeof createClient> | undefined;
let connecting: Promise<unknown> | undefined;

type EvalOptions = { keys: string[]; arguments: string[] };
type RedisConnection = {
  get: (key: string) => Promise<unknown>;
  sMembers: (key: string) => Promise<unknown>;
  eval: (script: string, options: EvalOptions) => Promise<unknown>;
};

function upstashConfig() {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!rawUrl && !token) return null;
  try {
    if (!rawUrl || !token || /[\r\n]/.test(token)) throw new RedisConfigurationError();
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.pathname !== "/" || !url.hostname.endsWith(".upstash.io") || url.port) throw new RedisConfigurationError();
    return { url: url.origin, token };
  } catch {
    throw new RedisConfigurationError();
  }
}

export async function redisClient(): Promise<RedisConnection | null> {
  if (process.env.NODE_ENV === "production") {
    const config = upstashConfig();
    if (!config) return null;
    const { url, token } = config;
    async function command(args: string[]): Promise<unknown> {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(args), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error();
        const body: unknown = await response.json();
        if (typeof body !== "object" || body === null || !("result" in body) || "error" in body) throw new Error();
        return body.result;
      } catch {
        throw new Error("Redis request failed");
      }
    }
    return {
      get: (key) => command(["GET", key]),
      sMembers: (key) => command(["SMEMBERS", key]),
      eval: (script, options) => command(["EVAL", script, String(options.keys.length), ...options.keys, ...options.arguments]),
    };
  }
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!["redis:", "rediss:"].includes(parsed.protocol) || !parsed.hostname || parsed.hash) {
      throw new RedisConfigurationError();
    }
  } catch {
    throw new RedisConfigurationError();
  }
  if (!client) {
    client = createClient({ url, socket: { connectTimeout: 2000, reconnectStrategy: false }, disableOfflineQueue: true });
    client.on("error", () => console.error("redis_connection_failed"));
  }
  if (!client.isReady) {
    connecting ??= client.connect().finally(() => { connecting = undefined; });
    await connecting;
  }
  return client.withAbortSignal(AbortSignal.timeout(2000));
}
