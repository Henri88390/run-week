// In-process synthetic provider and database only; never loads environment files.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const external = createRequire(import.meta.url);
const modules = new Map();
const config = { encryptionKey: "synthetic-webhook-encryption-key-0123456789", clientId: "123", clientSecret: "synthetic" };
let connection, jobs, activities, quota, provider, calls, invalidations, failPersistence, deliveryFails;
const deliveries = [];
const diagnostics = [];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((entry) => matches(row, entry));
    if (key === "userId_sourceId") return matches(row, value);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value).every(([op, expected]) => {
        if (op === "in") return expected.includes(row[key]);
        if (op === "lt") return row[key] < expected;
        if (op === "gte") return row[key] >= expected;
        throw new Error(`Unsupported mock operator ${op}`);
      });
    }
    return row[key] === value;
  });
}
function update(row, data) {
  for (const [key, value] of Object.entries(data))
    row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
  row.updatedAt = new Date();
  return structuredClone(row);
}
const database = {
  async $executeRaw() {},
  async $transaction(work) { if (failPersistence) throw new Error("Synthetic storage outage"); return work(database); },
  stravaConnection: {
    async findUnique({ where }) { return connection && matches(connection, where) ? structuredClone(connection) : null; },
    async update({ data }) { assert.ok(connection); return update(connection, data); },
    async updateMany({ where, data }) {
      if (!connection || !matches(connection, where)) return { count: 0 };
      update(connection, data); return { count: 1 };
    },
    async deleteMany({ where }) {
      if (connection && matches(connection, where)) { connection = null; jobs.clear(); return { count: 1 }; }
      return { count: 0 };
    },
  },
  stravaSyncJob: {
    async findMany({ where }) { return structuredClone([...jobs.values()].filter((row) => matches(row, where))); },
    async findUnique({ where }) { return structuredClone([...jobs.values()].find((row) => matches(row, where)) ?? null); },
    async findFirst({ where }) { return structuredClone([...jobs.values()].find((row) => matches(row, where)) ?? null); },
    async count({ where }) { return [...jobs.values()].filter((row) => matches(row, where)).length; },
    async create({ data }) {
      const row = { id: `job-${jobs.size}`, status: "queued", phase: "summaries", version: 1, retryAt: null,
        webhookDeleted: false, summaries: 0, recordings: 0, ...data };
      jobs.set(row.id, row); return structuredClone(row);
    },
    async update({ where, data }) {
      const row = [...jobs.values()].find((row) => matches(row, where)); assert.ok(row); return update(row, data);
    },
    async updateMany({ where, data }) {
      const rows = [...jobs.values()].filter((row) => matches(row, where));
      rows.forEach((row) => update(row, data)); return { count: rows.length };
    },
  },
  stravaActivity: {
    async findFirst({ where }) { return structuredClone(activities.find((row) => matches(row, where)) ?? null); },
    async upsert({ where, create, update: data }) {
      const row = activities.find((row) => matches(row, where));
      if (row) return update(row, data);
      activities.push({ id: `activity-${activities.length}`, streamState: "pending", elevationStreamState: "pending",
        maximalEffort: false, ...create });
    },
    async updateMany({ where, data }) {
      const rows = activities.filter((row) => matches(row, where));
      rows.forEach((row) => update(row, data)); return { count: rows.length };
    },
    async deleteMany({ where }) { activities = activities.filter((row) => !matches(row, where)); },
  },
  stravaSyncQuota: {
    async findUnique() { return quota; },
    async upsert({ create, update: data }) { quota = quota ? { ...quota, ...data } : create; },
  },
  runningAnalyticsSettings: { async deleteMany() {} },
  verificationToken: { async deleteMany() {} },
};
function load(file) {
  const absolute = path.resolve(root, file);
  if (modules.has(absolute)) return modules.get(absolute).exports;
  const compiled = { exports: {} };
  modules.set(absolute, compiled);
  const code = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (name) => {
    if (name === "server-only") return {};
    if (name === "@/features/account/server/db") return { db: () => database };
    if (name === "@/generated/prisma/client") return { Prisma: { DbNull: null } };
    if (name === "./config") return { stravaConfig: () => config, stravaOrigin: () => "https://strava.invalid" };
    if (name === "./cache") return { clearActivityCache: async () => { invalidations++; } };
    if (name === "./diagnostics") return { logStravaFailure: (error) => diagnostics.push(error.code ?? "unavailable") };
    if (name === "./inngest") return { inngest: { async send(event) {
      if (deliveryFails) throw new Error("Synthetic dispatch outage");
      deliveries.push(event);
    } } };
    if (name.startsWith(".") || name.startsWith("@/")) {
      const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
      return load(`${base}.ts`);
    }
    return external(name);
  };
  new Function("require", "module", "exports", code)(require, compiled, compiled.exports);
  return compiled.exports;
}
const { persistWebhook, readWebhook, subscriptionHandshake } = load("src/features/strava/server/webhook.ts");
const { syncChunk } = load("src/features/strava/server/background-worker.ts");
const { athleteKey } = load("src/features/strava/server/athlete-key.ts");
const { seal, unseal } = load("src/features/garmin/server/session.ts");
const { STRAVA_CONSENT_VERSION } = load("src/features/strava/types.ts");
const { saveSummary } = load("src/features/strava/server/save-summary.ts");
const { publishJob, retryWebhookJobs } = load("src/features/strava/server/background-jobs.ts");
const { WEBHOOK_DISCLOSURE } = load("src/features/strava/webhook-messages.ts");
const originalFetch = globalThis.fetch;
process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = "synthetic-verify-token-01234567890123";
process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = "12345";
const now = Math.floor(Date.now() / 1000);
const summary = { id: 901, athlete: { id: 88 }, name: "Synthetic run", sport_type: "Run", type: "Run",
  start_date: "2026-01-01T10:00:00Z", start_date_local: "2026-01-01T10:00:00Z",
  distance: 5000, elapsed_time: 1800, moving_time: 1790, average_heartrate: 150, max_heartrate: 180 };
const event = (changes = {}) => ({ subscription_id: 12345, owner_id: 88, object_id: 901,
  object_type: "activity", aspect_type: "create", event_time: now, updates: {}, ...changes });
const revocation = () => event({ object_type: "athlete", object_id: 88, aspect_type: "update", updates: { authorized: "false" } });
function reset() {
  connection = { userId: "synthetic-user", generation: "g1", consentVersion: STRAVA_CONSENT_VERSION,
    consentAt: new Date((now - 100) * 1000), athleteKey: athleteKey(config.encryptionKey, 88),
    tokens: seal({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_at: now + 3600 }, config.encryptionKey),
    leaseId: null, leaseUntil: null };
  jobs = new Map(); activities = []; quota = null; calls = []; invalidations = 0; failPersistence = false; deliveryFails = false;
  provider = { detail: structuredClone(summary), revoked: false, access401: false, refresh401: false, status: 200, delay: false, gate: null };
}
function response(value, status = 200) { return Response.json(value, { status }); }
globalThis.fetch = async (input) => {
  const url = new URL(input);
  calls.push(url.pathname);
  if (provider.gate) { const gate = provider.gate; provider.gate = null; await gate(); }
  if (url.pathname === "/oauth/token") {
    if (provider.refresh401) return response({}, 401);
    if (provider.revoked) return response({ errors: [{ resource: "RefreshToken", field: "refresh_token", code: "invalid" }] }, 400);
    return response({ access_token: "rotated-access", refresh_token: "rotated-refresh", expires_at: now + 7200 });
  }
  if (provider.revoked || provider.access401) return response({}, 401);
  if (provider.status !== 200) return response({}, provider.status);
  if (url.pathname === "/api/v3/athlete") return response({ id: 88 });
  if (url.pathname.endsWith("/streams")) return response({
    time: { data: [0, 5, 10] }, distance: { data: [0, 20, 40] },
    heartrate: { data: [140, 150, 155] }, altitude: { data: [1, 2, 3] },
  });
  const result = provider.detail ? response(provider.detail) : response({}, 404);
  if (provider.delay) {
    result.headers.set("X-ReadRateLimit-Limit", "100,1000");
    result.headers.set("X-ReadRateLimit-Usage", "99,1");
  }
  return result;
};
async function chunk(id) { quota = null; return syncChunk(id, jobs.get(id).version); }
async function finish(id) {
  for (let i = 0; i < 10; i++) if ((await chunk(id)).done) return;
  assert.fail("Targeted work did not finish in ten chunks");
}
try {
  reset();
  const handshake = new URL("https://run-week.invalid/api/strava/webhook?hub.mode=subscribe&hub.challenge=abc123");
  handshake.searchParams.set("hub.verify_token", process.env.STRAVA_WEBHOOK_VERIFY_TOKEN);
  delete process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
  assert.deepEqual(subscriptionHandshake(handshake), { "hub.challenge": "abc123" });
  handshake.searchParams.set("hub.verify_token", "forged");
  assert.throws(() => subscriptionHandshake(handshake), (error) => error.status === 403);
  await assert.rejects(persistWebhook(event()), (error) => error.status === 503);
  process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = "12345";
  const read = (body) => readWebhook(new Request("https://run-week.invalid", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  assert.deepEqual(await read(event()), event());
  for (const value of ["{", event({ owner_id: 1.1 }), event({ object_id: Number.MAX_SAFE_INTEGER + 1 }),
    event({ event_time: now + 1000 }), event({ updates: { title: "x".repeat(1001) } }), event({ extra: true })])
    await assert.rejects(read(value));
  await assert.rejects(read("x".repeat(8193)), (error) => error.status === 413);
  await assert.rejects(readWebhook(new Request("https://run-week.invalid", { method: "POST",
    headers: { "Content-Type": "application/jsonp" }, body: JSON.stringify(event()) })), (error) => error.status === 415);
  await assert.rejects(persistWebhook(event({ subscription_id: 1 })), (error) => error.status === 403);
  assert.equal(await persistWebhook(event({ owner_id: 77 })), null);
  assert.equal(await persistWebhook(event({ event_time: now - 101 })), null);
  assert.equal(await persistWebhook(event({ object_type: "athlete", object_id: 88, updates: { authorized: "true" } })), null);
  failPersistence = true;
  await assert.rejects(persistWebhook(event()), /storage outage/);
  failPersistence = false;
  const id = await persistWebhook(event());
  assert.equal(calls.length, 0, "Ingress never contacts Strava");
  assert.equal(jobs.size, 1);
  const firstVersion = jobs.get(id).version;
  await persistWebhook(event());
  assert.equal(jobs.get(id).version, firstVersion);
  await finish(id);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].streamState, "ready");
  assert.equal(invalidations > 0, true);
  assert.deepEqual(calls, ["/api/v3/activities/901", "/api/v3/activities/901/streams"]);
  activities[0].maximalEffort = true;
  provider.detail.name = "Edited authoritative title";
  await persistWebhook(event({ aspect_type: "update", event_time: now + 1, updates: { title: "Untrusted title" } }));
  await finish(id);
  assert.equal(activities[0].name, "Edited authoritative title");
  assert.equal(activities[0].maximalEffort, true);
  assert.equal(calls.filter((call) => call.endsWith("/streams")).length, 2, "Edits refresh recordings");
  await persistWebhook(event()); // older create cannot replace newer work
  assert.equal(jobs.get(id).webhookEventTime, now + 1);
  await persistWebhook(event({ aspect_type: "delete", event_time: now + 2 }));
  await finish(id);
  assert.equal(activities.length, 1, "Forged delete hint cannot delete an existing authoritative run");
  provider.detail = null;
  await persistWebhook(event({ aspect_type: "delete", event_time: now + 3 }));
  await finish(id);
  assert.equal(activities.length, 0);
  assert.equal(jobs.get(id).webhookDeleted, true);
  await saveSummary(database, connection.userId, summary);
  assert.equal(activities.length, 0, "Stale list imports cannot resurrect removed data");
  provider.detail = { ...summary, sport_type: "Ride" };
  await persistWebhook(event({ aspect_type: "update", event_time: now + 4 }));
  await finish(id);
  assert.equal(activities.length, 0, "Non-running changes are not retained");
  provider.detail = structuredClone(summary);
  await persistWebhook(event({ aspect_type: "create", event_time: now + 5 }));
  await finish(id);
  assert.equal(activities.length, 1, "Only authoritative run restoration clears the tombstone");
  assert.equal(jobs.get(id).webhookDeleted, false);

  reset();
  const wrongOwner = await persistWebhook(event());
  provider.detail.athlete.id = 99;
  await assert.rejects(chunk(wrongOwner), /background chunk unavailable/);
  assert.equal(activities.length, 0);
  provider.detail.athlete.id = 88;
  provider.status = 500;
  await assert.rejects(chunk(wrongOwner));
  provider.status = 403;
  await chunk(wrongOwner);
  assert.ok(connection, "Scope/403 failures do not remove accounts");
  reset();
  const rateId = await persistWebhook(event());
  provider.status = 429;
  assert.ok((await chunk(rateId)).waitUntil);
  assert.equal(jobs.get(rateId).status, "paused");
  assert.ok(quota.nextCallAt > new Date());
  reset();
  const absentId = await persistWebhook(event());
  provider.detail = null; provider.delay = true;
  await chunk(absentId);
  assert.ok(quota.nextCallAt.getTime() > Date.now() + 1100, "Completed deletes preserve global quota feedback");

  reset();
  const staleId = await persistWebhook(event());
  provider.gate = async () => {
    await persistWebhook(event({ aspect_type: "update", event_time: now + 1 }));
  };
  await chunk(staleId);
  assert.equal(activities.length, 0, "Superseded in-flight responses cannot commit");
  await finish(staleId);
  assert.equal(activities.length, 1);
  reset();
  const refreshId = await persistWebhook(event());
  connection.tokens = seal({ access_token: "old", refresh_token: "old-refresh", expires_at: 1 }, config.encryptionKey);
  provider.gate = async () => { await persistWebhook(event({ aspect_type: "update", event_time: now + 1 })); };
  await chunk(refreshId);
  assert.equal(unseal(connection.tokens, config.encryptionKey).refresh_token, "rotated-refresh",
    "Event version fencing must not discard a rotated refresh token");
  reset();
  const disconnectedId = await persistWebhook(event());
  provider.gate = async () => { connection = null; jobs.clear(); };
  await syncChunk(disconnectedId, 1);
  assert.equal(activities.length, 0, "Disconnect prevents in-flight resurrection");
  reset();
  const generationId = await persistWebhook(event());
  provider.gate = async () => { connection.generation = "reconnected"; connection.leaseId = null; };
  await chunk(generationId);
  assert.equal(activities.length, 0, "Reconnect generation fences stale writes");

  reset();
  const revokeId = await persistWebhook(revocation());
  await finish(revokeId);
  assert.ok(connection, "Forged revocation cannot disconnect working access");
  reset();
  const actualRevokeId = await persistWebhook(revocation());
  activities.push({ userId: connection.userId });
  provider.revoked = true;
  await finish(actualRevokeId);
  assert.equal(connection, null);
  assert.equal(activities.length, 0);
  assert.equal(jobs.size, 0);
  assert.deepEqual(calls, ["/api/v3/athlete", "/oauth/token"]);
  assert.equal(await persistWebhook(event()), null, "Late events cannot resurrect disconnected accounts");
  reset();
  const uncertainId = await persistWebhook(revocation());
  provider.access401 = true; provider.refresh401 = true;
  await finish(uncertainId);
  assert.ok(connection, "Client credential/token endpoint 401 is not authoritative revocation evidence");
  assert.equal(jobs.get(uncertainId).status, "failed");
  reset();
  const outboxId = await persistWebhook(event());
  deliveryFails = true;
  await assert.rejects(publishJob(outboxId));
  assert.equal(jobs.get(outboxId).publishedAt, null);
  deliveryFails = false;
  await publishJob(outboxId);
  assert.ok(jobs.get(outboxId).publishedAt);
  assert.deepEqual(Object.keys(deliveries.at(-1).data).sort(), ["jobId", "version"]);
  update(jobs.get(outboxId), { status: "failed", errorCode: "unavailable" });
  jobs.get(outboxId).updatedAt = new Date(Date.now() - 700_000);
  assert.equal(await retryWebhookJobs(), 1);
  assert.equal(jobs.get(outboxId).status, "queued");
  assert.equal(jobs.get(outboxId).version, 2);
  assert.equal(jobs.get(outboxId).publishedAt, null);
  update(jobs.get(outboxId), { status: "failed", errorCode: "unauthorized" });
  jobs.get(outboxId).updatedAt = new Date(Date.now() - 700_000);
  assert.equal(await retryWebhookJobs(), 0, "Uncertain authorization must not be retried forever");
  reset();
  for (let i = 0; i < 1000; i++) jobs.set(`backlog-${i}`, {
    id: `backlog-${i}`, userId: connection.userId, kind: "webhook-activity", status: "queued",
  });
  await assert.rejects(persistWebhook(event()), (error) => error.status === 503 && error.retrySeconds === 60);
  assert.ok(await persistWebhook(revocation()), "Activity backlog must not block a revocation check");
  assert.equal(Object.keys(WEBHOOK_DISCLOSURE).length, 10);
  for (const text of Object.values(WEBHOOK_DISCLOSURE)) assert.ok(text.length > 100);
  console.log("Strava webhook mock checks passed: bounded ingress/handshake, durable deduplication, targeted updates/streams, ownership, authoritative deletion/revocation, quotas, token rotation, generation and disconnect fencing.");
} finally {
  globalThis.fetch = originalFetch;
  delete process.env.STRAVA_WEBHOOK_VERIFY_TOKEN;
  delete process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID;
}
