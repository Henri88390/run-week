import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const external = createRequire(import.meta.url);
const modules = new Map();
const logs = [];
const deliveries = [];
let deliveryFails = false;
const api = { summaries: null, streams: null, exchange: null };
let connection;
let job;
let quota;
let activities;
let invalidations = 0;

function update(row, data) {
  for (const [key, value] of Object.entries(data)) {
    row[key] = value && typeof value === "object" && "increment" in value ? row[key] + value.increment : value;
  }
  return row;
}
const database = {
  async $executeRaw() { return 1; },
  async $transaction(work) { return work(database); },
  stravaConnection: {
    async findMany({ where }) {
      if (!connection || connection.consentVersion !== where.consentVersion
        || (connection.lastSyncedAt && connection.lastSyncedAt >= where.OR[1].lastSyncedAt.lt)) return [];
      const blocked = job && where.jobs.none.OR.some((condition) =>
        (typeof condition.status === "string" ? job.status === condition.status : condition.status.in.includes(job.status))
        && (!condition.errorCode || condition.errorCode.in.includes(job.errorCode)));
      return blocked ? [] : [{ userId: connection.userId }];
    },
    async findUnique() { return connection ? { ...connection } : null; },
    async findUniqueOrThrow() { assert.ok(connection); return { ...connection }; },
    async update({ data }) { return update(connection, data); },
    async updateMany({ where, data }) {
      if (!connection || (where.generation && where.generation !== connection.generation)
        || (where.leaseId && where.leaseId !== connection.leaseId)) return { count: 0 };
      update(connection, data);
      return { count: 1 };
    },
  },
  stravaSyncJob: {
    async findFirst({ where }) {
      if (!job || job.userId !== where.userId || (where.generation && job.generation !== where.generation)
        || (where.status && !where.status.in.includes(job.status))
        || (where.OR && !where.OR.some((condition) => job.status === condition.status
          && (!condition.errorCode || job.errorCode === condition.errorCode)))) return null;
      return { ...job };
    },
    async findUnique() { return job ? { ...job } : null; },
    async update({ data }) { return update(job, data); },
    async create({ data }) {
      job = { page: 1, phase: "summaries", status: "queued", version: 1, publishedAt: null,
        retryAt: null, errorCode: null, summaries: 0, recordings: 0, ...data };
      return { ...job };
    },
    async updateMany({ where, data }) {
      if (!job || job.id !== where.id || (where.version && job.version !== where.version)) return { count: 0 };
      update(job, data);
      return { count: 1 };
    },
  },
  stravaSyncQuota: {
    async findUnique() { return quota; },
    async upsert({ create, update: data }) { quota = quota ? update(quota, data) : create; },
  },
  stravaActivity: {
    async findFirst({ where }) { return activities.find((activity) => activity.streamState === where.streamState) ?? null; },
    async updateMany({ where, data }) {
      const activity = activities.find((activity) => activity.id === where.id && activity.streamState === where.streamState);
      if (!activity) return { count: 0 };
      update(activity, data);
      return { count: 1 };
    },
  },
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
    if (name === "@/features/garmin/server/session") return {
      seal: (value) => JSON.stringify(value), unseal: (value) => JSON.parse(value),
    };
    if (file.endsWith("background-worker.ts") && name === "./api") {
      const original = load("src/features/strava/server/api.ts");
      return { ...original, summaries: (...args) => api.summaries(...args),
        streams: (...args) => api.streams(...args), exchange: (...args) => api.exchange(...args) };
    }
    if (file.endsWith("background-worker.ts") && name === "./config") return { stravaConfig: () => ({ encryptionKey: "mock" }) };
    if (name === "./cache") return { clearActivityCache: async () => { invalidations++; } };
    if (name === "./diagnostics") return { logStravaFailure: (error) => logs.push(error.constructor.name) };
    if (name === "./inngest") return {
      requireBackgroundSync() {},
      inngest: { async send(event) {
        if (deliveryFails) throw new Error("Synthetic delivery outage");
        deliveries.push(event);
      } },
    };
    if (name === "./save-summary") return { saveSummary: async (_, userId, summary) => {
      if (!["Run", "TrailRun", "VirtualRun"].includes(summary.type)) return;
      if (!activities.some((activity) => activity.id === String(summary.id))) {
        activities.push({ id: String(summary.id), sourceId: String(summary.id), userId, streamState: "pending" });
      }
    } };
    if (name.startsWith(".") || name.startsWith("@/")) {
      const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(absolute), name);
      return load(`${base}.ts`);
    }
    return external(name);
  };
  new Function("require", "module", "exports", code)(require, compiled, compiled.exports);
  return compiled.exports;
}
const { STRAVA_CONSENT_VERSION } = load("src/features/strava/types.ts");
const { syncChunk } = load("src/features/strava/server/background-worker.ts");
const { StravaError } = load("src/features/strava/server/api.ts");

function reset() {
  connection = { userId: "local-test", generation: "generation-1", consentVersion: STRAVA_CONSENT_VERSION,
    tokens: JSON.stringify({ access_token: "synthetic", refresh_token: "synthetic", expires_at: 4102444800 }),
    leaseId: null, leaseUntil: null, syncHistory: [], syncActive: true };
  job = { id: "job", userId: connection.userId, generation: connection.generation, version: 1,
    status: "queued", phase: "summaries", page: 1, start: "2024-01-01", end: "2025-01-01",
    remaining: [], before: Date.parse("2025-01-01T00:00:00Z") / 1000, summaries: 0, recordings: 0, retryAt: null };
  quota = null;
  activities = [];
  api.summaries = async () => ({ activities: [] });
  api.streams = async () => ({ data: null });
}
async function chunk() { quota = null; return syncChunk("job", 1); }
const summary = { id: 1, type: "Run", start_date_local: "2024-06-01T10:00:00Z" };
reset();
api.summaries = async (_, page) => ({ activities: page === 1
  ? Array.from({ length: 200 }, (_, index) => ({ ...summary, id: index + 1 }))
  : [{ ...summary, id: 201 }, { ...summary, id: 202, type: "Ride" }] });
await chunk();
assert.equal(job.page, 2);
assert.equal(job.phase, "summaries");
assert.equal(activities.length, 200);
await chunk();
assert.equal(job.phase, "streams");
assert.equal(activities.length, 201);
assert.equal(job.summaries, 201);
api.streams = async () => ({ data: { time: [0, 5], heartrate: null, distance: null, velocity_smooth: null } });
await chunk();
assert.equal(job.recordings, 1);
assert.equal(activities[0].streamState, "ready");
activities.forEach((activity) => { activity.streamState = "ready"; });
await chunk();
assert.equal(job.status, "completed");
assert.equal(connection.syncActive, false);
assert.deepEqual(connection.syncHistory.map(({ start, end }) => ({ start, end })), [{ start: "2024-01-01", end: "2025-01-01" }]);
assert.ok(invalidations > 0);
assert.deepEqual(await chunk(), { done: true });

reset();
job.phase = "streams";
job.remaining = [{ start: "2023-01-01", end: "2024-01-01" }];
assert.equal((await chunk()).done, false);
assert.equal(job.start, "2023-01-01");
assert.equal(job.phase, "summaries");
assert.equal(job.page, 1);
assert.equal(connection.syncHistory.length, 1);

reset();
api.summaries = async () => { throw new StravaError("rateLimited", 429, 900); };
const limited = await chunk();
assert.ok(Date.parse(limited.waitUntil) > Date.now());
assert.equal(job.status, "paused");
assert.equal(job.page, 1);
assert.ok(quota.nextCallAt > new Date());
assert.equal(connection.leaseId, null);
assert.equal((await syncChunk("job", 1)).done, false);
job.retryAt = null;
api.summaries = async () => ({ activities: [] });
await chunk();
assert.equal(job.page, 2);

reset();
api.summaries = async () => { throw new Error("SENSITIVE simulated upstream value"); };
await assert.rejects(chunk(), /Strava background chunk unavailable/);
assert.equal(job.page, 1);
assert.equal(connection.leaseId, null);
api.summaries = async () => ({ activities: [summary] });
await chunk();
assert.equal(activities.length, 1);

for (const mutation of [
  () => { job.status = "cancelled"; },
  () => { connection.generation = "reconnected"; connection.leaseId = null; },
  () => { connection = null; job = null; },
]) {
  reset();
  api.summaries = async () => { mutation(); return { activities: [summary] }; };
  await chunk();
  assert.equal(activities.length, 0, "Cancellation/deletion/reconnect fences stale commits");
}
reset();
api.summaries = async () => { throw new StravaError("unauthorized", 401); };
assert.equal((await chunk()).done, true);
assert.equal(job.status, "failed");
assert.equal(job.errorCode, "unauthorized");
reset();
connection.tokens = JSON.stringify({ access_token: "synthetic", refresh_token: "synthetic", expires_at: 1 });
api.exchange = async () => ({ access_token: "refreshed", refresh_token: "refreshed", expires_at: 4102444800 });
await chunk();
assert.equal(JSON.parse(connection.tokens).access_token, "refreshed");
assert.equal(job.page, 1);
const { createSyncJob, publishJob, scheduleDueSyncAccounts } = load("src/features/strava/server/background-jobs.ts");
reset();
job = null;
connection.lastSyncedAt = null;
const queued = await createSyncJob(database, connection.userId);
await publishJob(queued.id);
assert.equal(queued.status, "queued");
assert.equal(job.start, "1970-01-01");
assert.equal((await createSyncJob(database, connection.userId)).id, queued.id);
await publishJob(queued.id);
assert.equal(deliveries.length, 1, "Scheduled active jobs are deduplicated");
assert.deepEqual(Object.keys(deliveries[0].data).sort(), ["jobId", "version"]);
assert.ok(!JSON.stringify(deliveries).includes(connection.userId));
job.status = "completed";
connection.syncHistory = [{ start: "1970-01-01", end: "2025-01-01", syncedAt: "2025-01-02T00:00:00Z" }];
const uncovered = await createSyncJob(database, connection.userId);
assert.equal(uncovered.start, "2025-01-01", "Automatic history imports skip completed ranges");
job.status = "failed";
job.errorCode = "unavailable";
job.page = 3;
const resumed = await createSyncJob(database, connection.userId);
assert.equal(resumed.id, uncovered.id);
assert.equal(resumed.page, 3, "Scheduled retries preserve checkpoints");
assert.equal(resumed.status, "queued");
assert.equal(resumed.errorCode, null);
job = null;
deliveryFails = true;
const undelivered = await createSyncJob(database, connection.userId);
await assert.rejects(publishJob(undelivered.id), (error) => error.code === "unavailable");
assert.equal(job.status, "queued");
assert.equal(job.publishedAt, null);
deliveryFails = false;
await publishJob(job.id);
assert.ok(job.publishedAt instanceof Date, "Outbox remains deliverable after a send failure");
reset();
connection.lastSyncedAt = null;
job.status = "failed";
job.errorCode = "unavailable";
job.page = 4;
const failedId = job.id;
assert.equal(await scheduleDueSyncAccounts(), 1);
assert.equal(job.id, failedId);
assert.equal(job.page, 4);
assert.equal(job.status, "queued");
assert.equal(await scheduleDueSyncAccounts(), 0, "An active import is not scheduled again");
job.status = "failed";
job.errorCode = "unauthorized";
assert.equal(await scheduleDueSyncAccounts(), 0, "Revoked access requires reconnection");
job.status = "completed";
connection.lastSyncedAt = new Date();
assert.equal(await scheduleDueSyncAccounts(), 0, "Recently synchronized accounts are not due");
console.log("Background checks passed: checkpoints, pagination, run filtering, streams, quota pauses, resumability and stale-write fencing.");
