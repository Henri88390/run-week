/* Dependency-free Garmin route verifier using the project TypeScript compiler. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import nextServer from "next/server.js";
import { verifyRateLimit } from "./verify-garmin-rate-limit.mjs";

const requireFromProject = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(root, filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiledModule = { exports: {} };
    cache.set(filename, compiledModule);
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const localRequire = (specifier) => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
      if (specifier === "server-only") return {};
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/")
          ? path.join(root, "src", specifier.slice(2))
          : path.resolve(path.dirname(filename), specifier);
        const resolved = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]
          .find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        assert.ok(resolved, `Missing test import: ${specifier}`);
        return load(resolved);
      }
      return requireFromProject(specifier);
    };
    new Function("require", "module", "exports", code)(localRequire, compiledModule, compiledModule.exports);
    return compiledModule.exports;
  }
  return load;
}

const config = { clientId: "test-client", clientSecret: "test-secret", sessionSecret: "x".repeat(32), redirectUri: null };
const sentinel = "PRIVATE_SENTINEL_TOKEN_COOKIE_CODE_BODY";
const logs = [];
const originals = { fetch: global.fetch, info: console.info, warn: console.warn, error: console.error };
let currentUser = "user-a";
const tokenRows = new Map();
const workoutRows = new Map();
let conflictingRecord = null;
let nextWorkoutId = 100;
let scheduleStatus = 204;
let refreshStatus = 200;
const store = {
  async loadTokens(_config, userId) { return tokenRows.get(userId) ?? null; },
  async saveConnection(_config, userId, _garminUserId, tokens) { tokenRows.set(userId, tokens); },
  async updateTokens(_config, userId, tokens) { if (tokenRows.has(userId)) tokenRows.set(userId, tokens); },
  async forgetTokens(userId) { tokenRows.delete(userId); },
  async deleteConnection(userId) {
    tokenRows.delete(userId);
    for (const key of workoutRows.keys()) if (key.startsWith(`${userId}\0`)) workoutRows.delete(key);
  },
  async sentWorkouts(userId, dates) {
    return dates.flatMap((date) => {
      const row = workoutRows.get(`${userId}\0${date}`);
      return row ? [{ ...row }] : [];
    }).sort((a, b) => a.date.localeCompare(b.date));
  },
  async recordWorkout(userId, date, workoutId) {
    if (conflictingRecord) {
      const conflict = conflictingRecord;
      conflictingRecord = null;
      workoutRows.set(`${userId}\0${date}`, conflict);
      return { ...conflict };
    }
    const key = `${userId}\0${date}`;
    const existing = workoutRows.get(key);
    if (existing) return { ...existing };
    workoutRows.set(key, { date, workoutId });
    return null;
  },
  async forgetWorkout(userId, date) { workoutRows.delete(`${userId}\0${date}`); },
};
const load = loader({
  "server-only": {},
  "@/features/account/server/auth": { currentUserId: async () => currentUser },
  "@/features/garmin/server/store": store,
  "@/features/garmin/server/config": { garminConfig: () => config },
  "@/features/garmin/server/upload-rate-limit": { reserveUpload: async () => ({ allowed: true }) },
  "next/server": { ...nextServer, connection: async () => {} },
});
const { GARMIN_ERRORS, garminSyncResponseSchema, garminDeleteResponseSchema } = load("src\\features\\garmin\\sync-request.ts");
const routes = load("src\\app\\api\\garmin\\workouts\\route.ts");
const baseTokens = {
  accessToken: "old-access-token", refreshToken: "old-refresh-token",
  expiresAt: Date.now() + 60 * 60_000, refreshExpiresAt: Date.now() + 24 * 60 * 60_000,
};
const input = {
  locale: "en", vdot: 40, weekStart: "2026-11-02",
  workouts: [{ day: 0, durationMinutes: 30, type: "easy" }, { day: 2, durationMinutes: 40, type: "easy" }],
};
function key(userId, date) { return `${userId}\0${date}`; }
function reset() {
  currentUser = "user-a";
  tokenRows.clear(); workoutRows.clear(); conflictingRecord = null;
  nextWorkoutId = 100; scheduleStatus = 204; refreshStatus = 200;
  tokenRows.set("user-a", { ...baseTokens });
  tokenRows.set("user-b", { ...baseTokens, accessToken: "other-users-access-token" });
  global.fetch = async (url, init) => {
    const target = new URL(url);
    if (target.hostname === "diauth.garmin.com") {
      if (refreshStatus !== 200) return new Response(sentinel, { status: refreshStatus });
      return Response.json({ access_token: "rotated-access-token", refresh_token: "rotated-refresh-token", expires_in: 3600 });
    }
    assert.equal(target.hostname, "apis.garmin.com", "Only mocked Garmin API requests are expected");
    if (target.pathname === "/training-api/workout" && init.method === "POST") {
      return Response.json({ workoutId: nextWorkoutId++ });
    }
    if (target.pathname === "/training-api/schedule") return new Response(null, { status: scheduleStatus });
    if (target.pathname.startsWith("/training-api/workout/") && init.method === "DELETE") return new Response(null, { status: 204 });
    assert.fail(`Unexpected Garmin request: ${init.method} ${target.pathname}`);
  };
}
function request(method, body, url = "https://example.test/api/garmin/workouts", origin = "https://example.test") {
  return new nextServer.NextRequest(url, {
    method, headers: { origin, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function verify() {
  console.info = (line) => logs.push(JSON.parse(line));
  console.warn = (line) => logs.push(JSON.parse(line));
  console.error = (line) => logs.push(JSON.parse(line));
  reset();

  currentUser = null;
  for (const response of [await routes.GET(request("GET", undefined, "https://example.test/api/garmin/workouts?weekStart=2026-11-02")),
    await routes.POST(request("POST", input)), await routes.DELETE(request("DELETE", { dates: ["2026-11-02"] }))]) {
    assert.equal(response.status, 401, "All workout endpoints require a signed-in user");
    assert.equal((await response.json()).error, "reconnect");
  }
  currentUser = "user-a";

  // A sent date is idempotently skipped; only the unsent workout hits Garmin.
  workoutRows.set(key("user-a", "2026-11-02"), { date: "2026-11-02", workoutId: 900 });
  let response = await routes.POST(request("POST", input));
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(garminSyncResponseSchema.safeParse(body).success);
  assert.deepEqual(body.results, [
    { day: 0, date: "2026-11-02", existing: true }, { day: 2, date: "2026-11-04" },
  ]);
  assert.equal(workoutRows.get(key("user-a", "2026-11-04")).workoutId, 100);

  // A race that records another workout first removes this request's just-created duplicate.
  reset();
  conflictingRecord = { date: "2026-11-02", workoutId: 777 };
  response = await routes.POST(request("POST", { ...input, workouts: [input.workouts[0]] }));
  body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.results, [{ day: 0, date: "2026-11-02", existing: true }]);
  assert.deepEqual(logs.filter((entry) => entry.event === "garmin_api_request" && entry.operation === "cleanup")
    .at(-1)?.payload, { workoutId: 100 });
  assert.deepEqual(workoutRows.get(key("user-a", "2026-11-02")), { date: "2026-11-02", workoutId: 777 });

  // Delete resolves IDs only from the authenticated user's records, never request data or another user.
  reset();
  workoutRows.set(key("user-a", "2026-11-02"), { date: "2026-11-02", workoutId: 111 });
  workoutRows.set(key("user-b", "2026-11-03"), { date: "2026-11-03", workoutId: 222 });
  const requestedDates = ["2026-11-02", "2026-11-03"];
  response = await routes.DELETE(request("DELETE", { dates: requestedDates, workoutIds: [999] }));
  body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(garminDeleteResponseSchema.safeParse(body).success);
  assert.deepEqual([...body.deleted].sort(), [...requestedDates].sort());
  assert.equal(workoutRows.has(key("user-a", "2026-11-02")), false);
  assert.deepEqual(workoutRows.get(key("user-b", "2026-11-03")), { date: "2026-11-03", workoutId: 222 });
  assert.ok(logs.some((entry) => entry.event === "garmin_api_request" && entry.operation === "delete"
    && entry.payload?.workoutId === 111));
  assert.ok(!logs.some((entry) => entry.event === "garmin_api_request" && entry.operation === "delete"
    && entry.payload?.workoutId === 222 || entry.payload?.workoutId === 999));

  // The actual session refresh flow runs against mocked fetch and persists rotated tokens to the store.
  reset();
  tokenRows.set("user-a", { ...baseTokens, expiresAt: 0 });
  response = await routes.POST(request("POST", { ...input, workouts: [input.workouts[0]] }));
  assert.equal(response.status, 200);
  assert.equal(tokenRows.get("user-a").accessToken, "rotated-access-token");
  assert.equal(tokenRows.get("user-a").refreshToken, "rotated-refresh-token");

  // Reconnect-class token refresh failures forget the current user's tokens.
  reset();
  tokenRows.set("user-a", { ...baseTokens, expiresAt: 0 });
  refreshStatus = 401;
  response = await routes.POST(request("POST", input));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "reconnect");
  assert.equal(tokenRows.has("user-a"), false);
  assert.equal(tokenRows.has("user-b"), true);

  // A failed schedule triggers best-effort deletion and does not record an unscheduled workout.
  reset();
  scheduleStatus = 403;
  response = await routes.POST(request("POST", { ...input, workouts: [input.workouts[0]] }));
  assert.equal((await response.json()).error, "permission");
  assert.equal(workoutRows.size, 0);
  assert.ok(logs.some((entry) => entry.event === "garmin_api_request" && entry.operation === "cleanup"));

  assert.equal((await routes.POST(request("POST", input, undefined, "https://other.test"))).status, 403);
  assert.equal((await routes.DELETE(request("DELETE", { dates: [] }))).status, 400);
  const statusBody = await (await routes.GET(request("GET", undefined,
    "https://example.test/api/garmin/workouts?weekStart=2026-11-02"))).json();
  assert.deepEqual(statusBody.dates, []);
  assert.ok(statusBody.requestId);
  assert.ok(Object.values(GARMIN_ERRORS).length > 0);
  const serializedLogs = JSON.stringify(logs);
  for (const token of [sentinel, baseTokens.accessToken, baseTokens.refreshToken, "rotated-access-token", "rotated-refresh-token"])
    assert.ok(!serializedLogs.includes(token), "Diagnostics must never contain access/refresh tokens or upstream bodies");

  await verifyRateLimit({ loader, config, tokens: baseTokens, input, request, records: logs, nextServer, original: originals });
  console.log("Garmin verification passed: account auth, per-user storage, IDOR-safe deletion, idempotent sends, conflict cleanup, token rotation/reconnect and sanitized diagnostics.");
}

verify().catch((error) => { originals.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = originals.fetch;
  console.info = originals.info;
  console.warn = originals.warn;
  console.error = originals.error;
});
