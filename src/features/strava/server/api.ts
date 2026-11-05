import "server-only";
import { z } from "zod";
import { stravaOrigin, type StravaConfig } from "./config";
import { streamSchema, type ActivityStreams } from "../types";

export class StravaError extends Error {
  constructor(public readonly code: "invalid" | "unauthorized" | "alreadyLinked" | "rateLimited" | "busy" | "unavailable" | "notConnected",
    public readonly status = 503, public readonly retrySeconds?: number,
    public readonly diagnostic?: {
      stage: "request" | "token" | "summaries" | "streams";
      reason: "network" | "timeout" | "http" | "bodyTooLarge" | "emptyBody" | "invalidJson" | "bodyRead" | "schema" | "timestamps" | "sampleAlignment";
      upstreamStatus?: number;
      fields?: string[];
      decreasingIntervals?: number;
    }) { super(code); }
}

export class StravaAlreadyLinkedError extends StravaError {
  constructor(public readonly accountEmail: string | null) {
    super("alreadyLinked", 409);
  }
}

function schemaFailure(stage: "token" | "summaries" | "streams", error: z.ZodError): StravaError {
  // Schema paths contain field names and array offsets only; never record values.
  const fields = [...new Set(error.issues.map((issue) => issue.path.filter((part) => typeof part === "string").join(".")))].slice(0, 10);
  return new StravaError("unavailable", 503, undefined, { stage, reason: "schema", fields });
}
export const tokenSchema = z.object({
  access_token: z.string().min(1).max(4096), refresh_token: z.string().min(1).max(4096),
  expires_at: z.number().int().positive(), athlete: z.object({ id: z.number().int().positive().safe() }).optional(),
});
export type Tokens = z.infer<typeof tokenSchema>;
function validHeartRate(value: number | null): number | null {
  return value !== null && value >= 30 && value <= 240 ? value : null;
}
const summaryHeartRate = z.number().finite().nullable().optional();
const summarySchema = z.object({
  id: z.number().int().positive().safe(), name: z.string().max(1000),
  sport_type: z.string().optional(), type: z.string(),
  start_date: z.iso.datetime(), start_date_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
  distance: z.number().finite().nonnegative(), moving_time: z.number().int().nonnegative(),
  elapsed_time: z.number().int().nonnegative(), average_heartrate: summaryHeartRate,
  max_heartrate: summaryHeartRate,
});
export type Summary = z.infer<typeof summarySchema>;
const TIMEOUT = 8000;
const MAX_BODY = 8_000_000;

function quotaDelay(response: Response): number | undefined {
  for (const prefix of ["X-RateLimit", "X-ReadRateLimit"]) {
    const limit = response.headers.get(`${prefix}-Limit`)?.split(",").map(Number);
    const usage = response.headers.get(`${prefix}-Usage`)?.split(",").map(Number);
    if (limit?.length === 2 && usage?.length === 2) {
      if (limit[1] > 0 && usage[1] >= limit[1] - 1) return Math.ceil((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1) - Date.now()) / 1000);
      if (limit[0] > 0 && usage[0] >= limit[0] - 1) return 901 - Math.floor(Date.now() / 1000) % 900;
    }
  }
  return undefined;
}
export async function request(path: string, init: RequestInit): Promise<{ value: unknown; delay?: number; missing?: boolean }> {
  let response: Response;
  try {
    response = await fetch(`${stravaOrigin()}${path}`, { ...init, cache: "no-store", redirect: "error",
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT)]) : AbortSignal.timeout(TIMEOUT) });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new StravaError("unavailable", 503, undefined, { stage: "request", reason: timeout ? "timeout" : "network" });
  }
  const delay = quotaDelay(response);
  if (response.status === 429) {
    const retry = Number(response.headers.get("Retry-After"));
    throw new StravaError("rateLimited", 429, Math.min(86400, Math.max(delay ?? 900, Number.isFinite(retry) ? retry : 900)));
  }
  if (response.status === 401 || response.status === 403) throw new StravaError("unauthorized", 401);
  if (response.status === 404) return { value: null, missing: true, delay };
  if (!response.ok) throw new StravaError("unavailable", 503, undefined, { stage: "request", reason: "http", upstreamStatus: response.status });
  if (Number(response.headers.get("content-length")) > MAX_BODY)
    throw new StravaError("unavailable", 503, undefined, { stage: "request", reason: "bodyTooLarge" });
  // Bound streamed bodies too, even when Content-Length is absent.
  const reader = response.body?.getReader();
  if (!reader) throw new StravaError("unavailable", 503, undefined, { stage: "request", reason: "emptyBody" });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > MAX_BODY) {
        await reader.cancel();
        throw new StravaError("unavailable", 503, undefined, { stage: "request", reason: "bodyTooLarge" });
      }
      chunks.push(item.value);
    }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return { value, delay };
  } catch (error) {
    if (error instanceof StravaError) throw error;
    throw new StravaError("unavailable", 503, undefined, {
      stage: "request", reason: error instanceof SyntaxError ? "invalidJson" : "bodyRead",
    });
  }
}
export async function exchange(config: StravaConfig, fields: Record<string, string>, signal?: AbortSignal) {
  const { value } = await request("/oauth/token", {
    method: "POST", body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }), signal,
  });
  const parsed = tokenSchema.safeParse(value);
  if (!parsed.success) throw schemaFailure("token", parsed.error);
  return parsed.data;
}
export async function summaries(accessToken: string, page: number, after: number, before: number, pageSize: 20 | 200 = 20, signal?: AbortSignal) {
  const result = await request(`/api/v3/athlete/activities?per_page=${pageSize}&page=${page}&after=${after}&before=${before}`, {
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const parsed = z.array(summarySchema).max(pageSize).safeParse(result.value);
  if (!parsed.success) throw schemaFailure("summaries", parsed.error);
  const excluded = { average_heartrate: 0, max_heartrate: 0 };
  const activities = parsed.data.map((activity) => {
    const normalize = (field: keyof typeof excluded) => {
      const value = activity[field] ?? null;
      const valid = validHeartRate(value);
      if (value !== null && valid === null) excluded[field]++;
      return valid;
    };
    return { ...activity, average_heartrate: normalize("average_heartrate"), max_heartrate: normalize("max_heartrate") };
  });
  if (excluded.average_heartrate || excluded.max_heartrate)
    console.warn("strava_summary_hr_excluded", { reason: "outOfRange", counts: excluded });
  return { activities, delay: result.delay };
}
export async function streams(accessToken: string, id: string, signal?: AbortSignal): Promise<{ data: ActivityStreams | null; delay?: number }> {
  if (!/^\d+$/.test(id)) throw new StravaError("invalid", 400);
  const result = await request(`/api/v3/activities/${id}/streams?keys=time,heartrate,velocity_smooth,distance&key_by_type=true`, {
    signal,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (result.missing) return { data: null, delay: result.delay };
  const raw = z.object({
    time: z.object({ data: z.array(z.number().finite().nonnegative()).max(100_000) }).optional(),
    heartrate: z.object({ data: z.array(z.number().finite().nullable()).max(100_000) }).optional(),
    velocity_smooth: z.object({ data: z.array(z.number().finite().nonnegative().nullable()).max(100_000) }).optional(),
    distance: z.object({ data: z.array(z.number().finite().nonnegative().nullable()).max(100_000) }).optional(),
  }).safeParse(result.value);
  if (!raw.success) throw schemaFailure("streams", raw.error);
  if (!raw.data.time) return { data: null, delay: result.delay };
  const time = raw.data.time.data;
  const decreasingIntervals = time.reduce((count, n, i) => count + (i > 0 && n < time[i - 1] ? 1 : 0), 0);
  if (decreasingIntervals)
    throw new StravaError("unavailable", 503, undefined, { stage: "streams", reason: "timestamps", decreasingIntervals });
  const align = (values: (number | null)[] | undefined) => {
    if (!values) return null;
    if (values.length !== time.length)
      throw new StravaError("unavailable", 503, undefined, { stage: "streams", reason: "sampleAlignment" });
    return values;
  };
  const parsed = streamSchema.safeParse({
    time, heartrate: align(raw.data.heartrate?.data)?.map(validHeartRate) ?? null,
    velocity_smooth: align(raw.data.velocity_smooth?.data), distance: align(raw.data.distance?.data),
  });
  if (!parsed.success) throw schemaFailure("streams", parsed.error);
  // Keep the last sample at each timestamp: earlier duplicates have no duration.
  const indices = time.flatMap((value, i) => i === time.length - 1 || value !== time[i + 1] ? [i] : []);
  const duplicates = time.length - indices.length;
  if (!duplicates) return { data: parsed.data, delay: result.delay };
  console.warn("strava_stream_timestamps_normalized", { reason: "duplicates", removedSamples: duplicates });
  const select = (values: (number | null)[] | null) => values === null ? null : indices.map((i) => values[i]);
  return { data: {
    time: indices.map((i) => time[i]),
    heartrate: select(parsed.data.heartrate), velocity_smooth: select(parsed.data.velocity_smooth),
    distance: select(parsed.data.distance),
  }, delay: result.delay };
}
