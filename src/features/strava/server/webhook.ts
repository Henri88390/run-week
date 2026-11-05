import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/features/account/server/db";
import { STRAVA_CONSENT_VERSION } from "../types";
import { StravaError } from "./api";
import { athleteKey } from "./athlete-key";
import { stravaConfig } from "./config";

const id = z.number().int().positive().safe();
const eventSchema = z.object({
  subscription_id: id, owner_id: id, object_id: id,
  object_type: z.enum(["activity", "athlete"]),
  aspect_type: z.enum(["create", "update", "delete"]),
  event_time: z.number().int().nonnegative().max(2147483647),
  updates: z.record(z.string().max(64), z.union([z.string().max(1000), z.boolean(), z.number().finite()]))
    .refine((value) => Object.keys(value).length <= 16),
}).strict();

export function subscriptionHandshake(url: URL) {
  const secret = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  if (!secret || secret.length < 32 || secret.length > 256) throw new StravaError("unavailable");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge");
  if (url.searchParams.getAll("hub.mode").length !== 1 || url.searchParams.get("hub.mode") !== "subscribe"
    || url.searchParams.getAll("hub.verify_token").length !== 1
    || url.searchParams.getAll("hub.challenge").length !== 1
    || !challenge || challenge.length > 256 || !/^[\w.-]+$/.test(challenge)
    || token.length > 256
    || !timingSafeEqual(createHash("sha256").update(token).digest(), createHash("sha256").update(secret).digest()))
    throw new StravaError("invalid", 403);
  // Subscription ID is intentionally not needed during registration.
  return { "hub.challenge": challenge };
}

export async function readWebhook(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json")
    throw new StravaError("invalid", 415);
  const maxBytes = 8192;
  if (Number(request.headers.get("content-length")) > maxBytes) throw new StravaError("invalid", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new StravaError("invalid", 400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const deadline = AbortSignal.timeout(1500);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  deadline.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      const item = await reader.read();
      if (deadline.aborted) throw new StravaError("invalid", 408);
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new StravaError("invalid", 413); }
      chunks.push(item.value);
    }
    const parsed = eventSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success || parsed.data.event_time > Math.floor(Date.now() / 1000) + 300)
      throw new StravaError("invalid", 400);
    return parsed.data;
  } catch (error) {
    if (error instanceof StravaError) throw error;
    throw new StravaError("invalid", 400);
  } finally { deadline.removeEventListener("abort", cancel); reader.releaseLock(); }
}

/** Notifications are unsigned hints, never authorization to delete local data. */
export async function persistWebhook(event: Awaited<ReturnType<typeof readWebhook>>) {
  const subscription = process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
  if (!subscription || !/^[1-9]\d*$/.test(subscription) || !Number.isSafeInteger(Number(subscription)))
    throw new StravaError("unavailable");
  if (event.subscription_id !== Number(subscription)) throw new StravaError("invalid", 403);
  const revocation = event.object_type === "athlete" && event.aspect_type === "update"
    && event.object_id === event.owner_id && event.updates.authorized === "false";
  if (event.object_type !== "activity" && !revocation) return null;
  const key = athleteKey(stravaConfig().encryptionKey, event.owner_id);
  const owner = await db().stravaConnection.findUnique({ where: { athleteKey: key }, select: { userId: true, generation: true } });
  if (!owner) return null;
  return db().$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${owner.userId}`}))`;
    const connection = await tx.stravaConnection.findUnique({ where: { userId: owner.userId } });
    if (!connection || connection.generation !== owner.generation || connection.athleteKey !== key
      || connection.consentVersion !== STRAVA_CONSENT_VERSION
      || event.event_time < Math.floor(connection.consentAt.getTime() / 1000)) return null;
    const webhookKey = createHash("sha256").update(`${connection.generation}:${event.object_type}:${event.object_id}`).digest("hex");
    const fingerprint = createHash("sha256").update(JSON.stringify([
      event.aspect_type, event.event_time, Object.entries(event.updates).sort(([a], [b]) => a.localeCompare(b)),
    ])).digest("hex");
    const existing = await tx.stravaSyncJob.findUnique({ where: { webhookKey } });
    if (existing && ((existing.webhookEventTime ?? 0) > event.event_time || existing.webhookFingerprint === fingerprint))
      return existing.status === "queued" && !existing.publishedAt ? existing.id : null;
    // A single coalesced revocation check must not be blocked by activity backlog.
    if (!existing && !revocation && await tx.stravaSyncJob.count({ where: { userId: owner.userId,
      kind: { in: ["webhook-activity", "webhook-revocation"] }, status: { in: ["queued", "running", "paused"] },
    } }) >= 1000) throw new StravaError("busy", 503, 60);
    const data = {
      webhookEventTime: event.event_time, webhookFingerprint: fingerprint,
      phase: "summaries", status: "queued", publishedAt: null, retryAt: null, errorCode: null,
    };
    const job = existing
      ? await tx.stravaSyncJob.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
      : await tx.stravaSyncJob.create({ data: {
        ...data, webhookKey, sourceId: String(event.object_id), userId: owner.userId, generation: connection.generation,
        kind: revocation ? "webhook-revocation" : "webhook-activity",
        start: "1970-01-01", end: "1970-01-01", before: 0,
      } });
    return job.id;
  });
}
