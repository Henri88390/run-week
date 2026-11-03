/* Dependency-free runner using the project's TypeScript compiler and mocked Garmin responses. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import nextServer from "next/server.js";

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
const secret = "PRIVATE_SENTINEL_TOKEN_COOKIE_CODE_BODY_STACK";
const records = [];
const levels = [];
const original = { fetch: global.fetch, error: console.error, warn: console.warn, storage: global.localStorage };
console.error = (line) => { levels.push("error"); records.push(JSON.parse(line)); };
console.warn = (line) => { levels.push("warn"); records.push(JSON.parse(line)); };
const load = loader({
  "@/features/garmin/server/config": { garminConfig: () => config },
  "@/features/garmin/server/privacy": { hostingProvider: () => "Test host" },
  "next/server": { ...nextServer, connection: async () => {} },
});
const diagnostics = load("src\\features\\garmin\\server\\diagnostics.ts");
const api = load("src\\features\\garmin\\server\\garmin-api.ts");
const session = load("src\\features\\garmin\\server\\session.ts");
const { GARMIN_CONSENT_VERSION } = load("src\\features\\garmin\\privacy.ts");
const { GARMIN_ERRORS, garminSyncResponseSchema } = load("src\\features\\garmin\\sync-request.ts");
const tokens = {
  accessToken: secret, refreshToken: secret, expiresAt: Date.now() + 3600000,
  refreshExpiresAt: Date.now() + 86400000, consentVersion: GARMIN_CONSENT_VERSION, consentAt: Date.now(),
};
const input = {
  locale: "en", vdot: 40, weekStart: "2026-11-02",
  workouts: [{ day: 0, durationMinutes: 30, type: "easy" }, { day: 2, durationMinutes: 40, type: "easy" }],
};
function request(route, { method = "POST", body = input, cookie = tokens, origin = "https://example.test" } = {}) {
  return new nextServer.NextRequest(`https://example.test/api/garmin/${route}`, {
    method,
    headers: {
      origin, "Content-Type": "application/json",
      ...(cookie ? { Cookie: `${session.SESSION_COOKIE}=${session.seal(cookie, config.sessionSecret)}` } : {}),
    },
    ...(method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });
}
let calls = 0;
function responses(...queue) {
  calls = 0;
  global.fetch = async () => {
    calls++;
    assert.ok(queue.length, "Unexpected request or unsafe retry");
    const response = queue.shift();
    if (response instanceof Error) throw response;
    return response;
  };
}
const json = (body, status = 200) => Response.json(body, { status });
const rejection = (status) => new Response(secret, { status });
const uploads = load("src\\app\\api\\garmin\\workouts\\route.ts");
async function upload(...queue) {
  responses(...queue);
  const response = await uploads.POST(request("workouts"));
  const body = await response.json();
  assert.ok(garminSyncResponseSchema.safeParse(body).success);
  assert.equal(response.headers.get("X-Request-ID"), body.requestId);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  return { response, body };
}

async function verify() {
  for (const [status, code] of [[400, "rejected"], [401, "reconnect"], [403, "permission"],
    [409, "rejected"], [422, "rejected"], [429, "rateLimited"], [500, "unavailable"], [503, "unavailable"]]) {
    const error = diagnostics.httpFailure(status);
    assert.equal(diagnostics.failureDetails(error).code, code);
    diagnostics.logGarminFailure(diagnostics.newRequestId(), "create", error, 1);
    assert.equal(levels.at(-1), status >= 500 ? "error" : "warn");
    responses(rejection(status));
    await assert.rejects(api.createWorkout(secret, { secret }), (caught) => {
      assert.equal(diagnostics.failureDetails(caught).code, code);
      assert.ok(!caught.message.includes(secret));
      return true;
    });
  }
  assert.equal(diagnostics.failureDetails(diagnostics.httpFailure(400, true)).code, "reconnect");
  for (const [response, code, category] of [
    [new TypeError(secret), "network", "network"],
    [new DOMException(secret, "TimeoutError"), "network", "timeout"],
    [new Response(secret), "invalidResponse", "invalid_response"],
    [json({ workoutId: secret }), "invalidResponse", "invalid_response"],
  ]) {
    responses(response);
    await assert.rejects(api.createWorkout(secret, {}), (caught) => {
      assert.equal(diagnostics.failureDetails(caught).code, code);
      assert.equal(diagnostics.failureDetails(caught).category, category);
      diagnostics.logGarminFailure(diagnostics.newRequestId(), "create", caught);
      return true;
    });
  }
  responses(json({ access_token: secret }));
  await assert.rejects(api.requestTokens(config, { grant_type: "refresh_token", refresh_token: secret }),
    (caught) => diagnostics.failureDetails(caught).code === "invalidResponse");
  diagnostics.logGarminFailure(diagnostics.newRequestId(), "upload",
    Object.assign(new Error(secret), { cookie: secret, payload: { secret }, url: `https://example.test?code=${secret}` }));
  assert.equal(records.at(-1).category, "internal");
  assert.equal(levels.at(-1), "error");

  const partial = await upload(json({ workoutId: 123 }), new Response(null, { status: 204 }), rejection(429));
  assert.equal(partial.body.error, "rateLimited");
  assert.equal(partial.body.results.length, 1);
  assert.equal(partial.body.results[0].workoutId, 123);
  assert.equal(calls, 3);
  assert.equal(records.at(-1).operation, "create");
  assert.equal(records.at(-1).completed, 1);
  assert.equal(records.at(-1).requestId, partial.body.requestId);

  const cleanup = await upload(json({ workoutId: 456 }), rejection(403), rejection(503));
  assert.equal(cleanup.body.error, "permission");
  assert.deepEqual(cleanup.body.results, []);
  assert.deepEqual(records.slice(-2).map((record) => record.operation), ["cleanup", "schedule"]);
  assert.equal(calls, 3);
  const network = await upload(new TypeError(secret));
  assert.equal(network.body.error, "network");
  assert.equal(calls, 1);

  for (const [status, code] of [[503, "unavailable"], [429, "rateLimited"], [400, "reconnect"]]) {
    responses(rejection(status));
    const response = await uploads.POST(request("workouts", { cookie: { ...tokens, expiresAt: 0 } }));
    assert.equal((await response.json()).error, code);
    assert.equal(response.headers.has("Set-Cookie"), code === "reconnect");
    assert.equal(records.at(-1).operation, "refresh");
    assert.equal(calls, 1);
  }
  responses(json({ access_token: "rotated", refresh_token: "rotated" }), rejection(422));
  const refreshed = await uploads.POST(request("workouts", { cookie: { ...tokens, expiresAt: 0 } }));
  assert.equal((await refreshed.json()).error, "rejected");
  assert.ok(refreshed.headers.get("Set-Cookie").includes(session.SESSION_COOKIE));
  assert.equal((await uploads.POST(request("workouts", { origin: "https://other.test" }))).status, 403);
  assert.equal((await uploads.POST(request("workouts", { body: { ...input, workouts: [] } }))).status, 400);
  assert.equal((await uploads.POST(request("workouts", { cookie: null }))).status, 401);

  const callback = load("src\\app\\api\\garmin\\callback\\route.ts");
  const authorization = {
    state: "s".repeat(43), codeVerifier: secret, redirectUri: "https://example.test/api/garmin/callback",
    consentVersion: GARMIN_CONSENT_VERSION, consentAt: Date.now(),
  };
  responses(rejection(429));
  const callbackResponse = await callback.GET(new nextServer.NextRequest(
    `https://example.test/api/garmin/callback?code=${secret}&state=${authorization.state}`,
    { headers: { Cookie: `${session.AUTHORIZATION_COOKIE}=${session.seal(authorization, config.sessionSecret)}` } },
  ));
  assert.ok(callbackResponse.headers.get("Location").endsWith("?garmin=rateLimited"));
  assert.equal(records.at(-1).operation, "callback");
  await callback.GET(new nextServer.NextRequest(`https://example.test/api/garmin/callback?code=${secret}`));
  assert.equal(records.at(-1).category, "invalid_request");
  const connect = load("src\\app\\api\\garmin\\connect\\route.ts");
  assert.ok((await connect.POST(request("connect"))).headers.get("Location").endsWith("?garmin=error"));
  assert.equal(records.at(-1).operation, "connect");
  assert.equal((await connect.POST(request("connect", { origin: "https://other.test" }))).status, 403);
  const status = load("src\\app\\api\\garmin\\status\\route.ts");
  assert.equal((await (await status.GET(request("status", { method: "GET", cookie: { invalid: secret } }))).json()).connected, false);
  assert.equal(records.at(-1).operation, "status");
  const disconnect = load("src\\app\\api\\garmin\\disconnect\\route.ts");
  assert.equal((await disconnect.POST(request("disconnect", { origin: "https://other.test" }))).status, 403);
  assert.equal(records.at(-1).operation, "disconnect");
  assert.equal((await disconnect.POST(request("disconnect"))).status, 204);
  const unavailableLoad = loader({
    "@/features/garmin/server/config": { garminConfig: () => { throw new Error(secret); } },
    "next/server": { ...nextServer, connection: async () => {} },
  });
  const statusFailure = await unavailableLoad("src\\app\\api\\garmin\\status\\route.ts").GET(request("status", { method: "GET" }));
  assert.equal(statusFailure.status, 500);
  assert.deepEqual(await statusFailure.json(), { error: "failed" });
  const uploadFailure = await unavailableLoad("src\\app\\api\\garmin\\workouts\\route.ts").POST(request("workouts"));
  assert.equal(uploadFailure.status, 500);
  assert.equal((await uploadFailure.json()).error, "failed");
  const brokenLoad = loader({
    "@/features/garmin/server/session": { ...session, clearSession: () => { throw new Error(secret); } },
  });
  assert.equal((await brokenLoad("src\\app\\api\\garmin\\disconnect\\route.ts").POST(request("disconnect"))).status, 500);

  const storage = new Map();
  global.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const client = loader({
    react: { useCallback: (callback) => callback, useEffect: () => {}, useState: (initial) => [initial, () => {}] },
  })("src\\features\\garmin\\use-garmin.ts").useGarmin();
  const week = { profile: { vdot: 40 }, startDate: input.weekStart };
  const { MESSAGES } = load("src\\features\\i18n\\messages\\index.ts");
  assert.equal(Object.keys(MESSAGES).length, 10);
  for (const code of GARMIN_ERRORS) {
    for (const messages of Object.values(MESSAGES)) {
      assert.ok(messages.garmin[code]?.length > 0);
      assert.ok(messages.garmin.reference.length > 0);
    }
    responses(json({ results: partial.body.results, error: code, requestId: partial.body.requestId }, 502));
    assert.deepEqual(await client.send(week, input.workouts, "en"),
      { count: 1, error: code, requestId: partial.body.requestId });
    assert.equal(calls, 1);
  }
  assert.ok([...storage.values()].some((value) => value.includes("123")));
  for (const [response, error] of [
    [new TypeError(secret), "network"], [new Response(secret), "invalidResponse"],
    [json({ results: [], error: secret }), "invalidResponse"],
    [json({ results: [], requestId: secret }), "invalidResponse"],
  ]) {
    responses(response);
    assert.deepEqual(await client.send(week, input.workouts, "en"), { count: 0, error });
    assert.equal(calls, 1);
  }
  const allowed = new Set(["event", "requestId", "operation", "category", "code", "upstreamStatus", "completed"]);
  for (const record of records) for (const key of Object.keys(record)) assert.ok(allowed.has(key));
  assert.ok(!JSON.stringify(records).includes(secret), "Sensitive data leaked into diagnostics");
  original.warn("Garmin verification passed: classification, sanitization, route failures, partial uploads, no retries, client parsing and 10 locales.");
}

verify().catch((error) => { original.error(error); process.exitCode = 1; }).finally(() => {
  global.fetch = original.fetch;
  console.error = original.error;
  console.warn = original.warn;
  if (original.storage === undefined) delete global.localStorage;
  else global.localStorage = original.storage;
});
