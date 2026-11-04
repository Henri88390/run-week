/* Dependency-free upload rate-limit verifier. Redis is mocked; no external services are contacted. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const requireFromProject = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function makeLoader(overrides = {}) {
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

export async function verifyRateLimit({ loader, config, tokens, original = console }) {
  const saved = Object.fromEntries(["NODE_ENV", "REDIS_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]
    .map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const realNow = Date.now;
  const quotas = globalThis.garminUploadQuotas;
  const sentinel = "PRIVATE_REDIS_CREDENTIAL_URL_KEY_BODY";
  const testConfig = config ?? { clientId: "test", clientSecret: "unused", sessionSecret: "s".repeat(32), redirectUri: null };
  try {
    delete process.env.REDIS_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const commands = [];
    const connections = [];
    let reply = [1, 0];
    let connectionFailure = false;
    const redisMock = {
      createClient(options) {
        connections.push(options);
        const client = {
          isReady: false,
          on(event, handler) {
            assert.equal(event, "error");
            assert.equal(typeof handler, "function");
            return client;
          },
          async connect() {
            if (connectionFailure) throw new Error(sentinel);
            client.isReady = true;
          },
          withAbortSignal(signal) {
            assert.ok(signal instanceof AbortSignal);
            return client;
          },
          async eval(script, options) {
            commands.push({ script, ...options });
            if (reply instanceof Error) throw reply;
            return reply;
          },
        };
        return client;
      },
    };
    const load = () => loader({ redis: redisMock })("src\\features\\garmin\\server\\upload-rate-limit.ts");
    const { uploadIdentity, reserveUpload, RESERVE_UPLOAD_LUA } = load();
    global.fetch = () => { throw new Error("Rate limiting must not use HTTP"); };
    const quotasMap = globalThis.garminUploadQuotas;
    quotasMap?.clear();
    let now = Date.UTC(2026, 10, 3, 12);
    Date.now = () => now;
    process.env.NODE_ENV = "production";

    const concurrent = await Promise.all(Array.from({ length: 20 }, () => reserveUpload(testConfig, "user-a")));
    assert.equal(concurrent.filter((result) => result.allowed).length, 1, "Concurrent same-user reservations are atomic in memory");
    assert.deepEqual(concurrent.find((result) => !result.allowed), { allowed: false, retryAfterSeconds: 10 });
    assert.deepEqual(await reserveUpload(testConfig, "user-b"), { allowed: true }, "A different account has an independent quota");
    assert.deepEqual(await reserveUpload(testConfig, "user-b"), { allowed: false, retryAfterSeconds: 10 });
    assert.notEqual(uploadIdentity("user-a", testConfig), uploadIdentity("user-b", testConfig));

    for (let count = 1; count < 10; count++) {
      now += 10_000;
      assert.deepEqual(await reserveUpload(testConfig, "user-a"), { allowed: true });
    }
    now += 10_000;
    assert.equal((await reserveUpload(testConfig, "user-a")).allowed, false, "Production permits ten reservations per UTC day");
    assert.deepEqual(await reserveUpload(testConfig, "user-b"), { allowed: true }, "User B is not blocked by user A's daily quota");
    now = Date.UTC(2026, 10, 4);
    assert.deepEqual(await reserveUpload(testConfig, "user-a"), { allowed: true }, "Daily quota resets at UTC midnight");
    process.env.NODE_ENV = "development";
    for (let index = 0; index < 12; index++) {
      assert.deepEqual(await reserveUpload(testConfig, "dev-user"), { allowed: true });
      assert.deepEqual(await reserveUpload(testConfig, "dev-user"), { allowed: false, retryAfterSeconds: 10 });
      now += 10_000;
    }

    process.env.NODE_ENV = "test";
    process.env.REDIS_URL = `redis://default:${sentinel}@127.0.0.1:6379/1`;
    assert.deepEqual(await reserveUpload(testConfig, "user-a"), { allowed: true });
    assert.deepEqual(await reserveUpload(testConfig, "user-b"), { allowed: true });
    assert.equal(commands.length, 2);
    assert.equal(connections.length, 1, "The connection is reused");
    assert.deepEqual(connections[0], {
      url: process.env.REDIS_URL,
      socket: { connectTimeout: 2000, reconnectStrategy: false },
      disableOfflineQueue: true,
    });
    for (const command of commands) {
      assert.equal(command.script, RESERVE_UPLOAD_LUA);
      assert.equal(command.keys.length, 1);
      assert.match(command.keys[0], /^run-week:garmin:upload:v2:production:[a-f0-9]{64}$/);
      assert.deepEqual(command.arguments, ["1"]);
      assert.ok(!JSON.stringify(command).includes("user-a") && !JSON.stringify(command).includes("user-b"));
      assert.ok(!JSON.stringify(command).includes(tokens?.accessToken ?? "unused"));
      assert.ok(!JSON.stringify(command).includes(sentinel));
    }
    assert.notEqual(commands[0].keys[0], commands[1].keys[0], "Redis buckets are per-user HMACs");
    reply = [0, 10];
    assert.deepEqual(await reserveUpload(testConfig, "user-a"), { allowed: false, retryAfterSeconds: 10 });
    process.env.NODE_ENV = "development";
    reply = [1, 0];
    await reserveUpload(testConfig, "dev-user");
    assert.deepEqual(commands.at(-1).arguments, ["0"]);
    assert.match(commands.at(-1).keys[0], /:development:/);
    process.env.NODE_ENV = "test";

    for (const url of [
      "http://127.0.0.1:6379", "https://example.test", "bad",
      "redis://", "redis://127.0.0.1:6379#secret",
    ]) {
      process.env.REDIS_URL = url;
      commands.length = 0;
      await assert.rejects(reserveUpload(testConfig, "user-a"), (error) => error.category === "configuration");
      assert.equal(commands.length, 0, "Invalid Redis configuration must not send a request");
    }

    process.env.REDIS_URL = `rediss://default:${sentinel}@redis.example.test:6380`;
    assert.deepEqual(await load().reserveUpload(testConfig, "tls-user"), { allowed: true });
    assert.equal(connections.at(-1).url, process.env.REDIS_URL);
    connectionFailure = true;
    await assert.rejects(load().reserveUpload(testConfig, "connection-failure"),
      (error) => error.category === "unavailable" && !error.message.includes(sentinel));
    connectionFailure = false;
    for (const failure of [
      new TypeError(sentinel), [0, 86401], [1, 10], [0, 0], [0, 1.5], ["1", 0], null, { error: sentinel },
    ]) {
      reply = failure;
      await assert.rejects(reserveUpload(testConfig, "user-a"),
        (error) => error.category === "unavailable" && !error.message.includes(sentinel));
    }
    process.env.NODE_ENV = "production";
    process.env.REDIS_URL = "invalid-local-url-ignored-in-production";
    process.env.UPSTASH_REDIS_REST_URL = "https://verification.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = sentinel;
    const restCalls = [];
    global.fetch = async (url, init) => {
      restCalls.push({ url, init, command: JSON.parse(init.body) });
      return Response.json({ result: [1, 0] });
    };
    const connectionCount = connections.length;
    assert.deepEqual(await reserveUpload(testConfig, "user-a"), { allowed: true });
    assert.equal(connections.length, connectionCount, "Production must not use the local Redis socket");
    const rest = restCalls[0];
    assert.equal(rest.url, "https://verification.upstash.io");
    assert.deepEqual(rest.command.slice(0, 3), ["EVAL", RESERVE_UPLOAD_LUA, "1"]);
    assert.equal(rest.command[3], `run-week:garmin:upload:v2:production:${uploadIdentity("user-a", testConfig)}`);
    assert.equal(rest.command[4], "1");
    assert.equal(rest.init.headers.Authorization, `Bearer ${sentinel}`);
    assert.equal(rest.init.cache, "no-store");
    assert.equal(rest.init.redirect, "error");
    assert.ok(rest.init.signal instanceof AbortSignal);
    for (const [url, token] of [
      [undefined, sentinel], ["https://verification.upstash.io", undefined],
      ["http://verification.upstash.io", sentinel], ["https://example.test", sentinel],
      ["https://verification.upstash.io?token=secret", sentinel],
      ["https://verification.upstash.io/path", sentinel], ["bad", sentinel],
      ["https://verification.upstash.io", "bad\r\ntoken"],
    ]) {
      if (url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = url;
      if (token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = token;
      await assert.rejects(reserveUpload(testConfig, "user-a"), (error) => error.category === "configuration");
    }
    process.env.UPSTASH_REDIS_REST_URL = "https://verification.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = sentinel;
    for (const failure of [
      new TypeError(sentinel), new Response(sentinel, { status: 401 }), new Response(sentinel, { status: 503 }),
      Response.json({ result: [0, 86401] }), Response.json({ result: [1, 0], error: sentinel }), Response.json({}),
    ]) {
      global.fetch = async () => failure instanceof Error ? Promise.reject(failure) : failure;
      await assert.rejects(reserveUpload(testConfig, "user-a"),
        (error) => error.category === "unavailable" && !error.message.includes(sentinel));
    }
    const stored = new Map();
    const indexes = new Map();
    let cacheWrites = 0;
    global.fetch = async (_url, init) => {
      const command = JSON.parse(init.body);
      if (command[0] === "GET") return Response.json({ result: stored.get(command[1]) ?? null });
      if (command[0] === "SMEMBERS") return Response.json({ result: [...(indexes.get(command[1]) ?? [])] });
      assert.equal(command[0], "EVAL");
      const count = Number(command[2]);
      const keys = command.slice(3, 3 + count);
      const args = command.slice(3 + count);
      if (command[1].includes("redis.call('SET'")) {
        assert.equal(args[1], "300", "Both transports preserve the five-minute TTL");
        assert.ok(!args[0].includes("private-activity"));
        stored.set(keys[0], args[0]);
        const index = indexes.get(keys[1]) ?? new Set();
        index.add(keys[0]); indexes.set(keys[1], index);
        cacheWrites++;
      } else {
        for (const key of keys.slice(1)) { stored.delete(key); indexes.get(keys[0])?.delete(key); }
        if (args[0] === "1") indexes.delete(keys[0]);
      }
      return Response.json({ result: 1 });
    };
    const cacheModule = loader({ "./config": { stravaConfig: () => ({ encryptionKey: "e".repeat(32) }) } })
      ("src\\features\\strava\\server\\cache.ts");
    const { z } = requireFromProject("zod");
    const field = "dashboard:v3:month:2026-11";
    await cacheModule.writeActivityCache("user-a", field, "private-activity");
    await cacheModule.writeActivityCache("user-a", "sync:2026-11", true);
    assert.equal(cacheWrites, 2);
    assert.equal(await cacheModule.readActivityCache("user-a", field, z.string()), "private-activity");
    assert.equal(await cacheModule.readActivityCache("user-b", field, z.string()), null, "Cache reads remain account-scoped");
    await cacheModule.clearActivityCache("user-a", true);
    assert.equal(await cacheModule.readActivityCache("user-a", field, z.string()), null);
    assert.equal(await cacheModule.readActivityCache("user-a", "sync:2026-11", z.boolean()), true, "Dashboard invalidation keeps sync markers");
    await cacheModule.clearActivityCache("user-a");
    assert.equal(stored.size, 0);
    assert.equal(indexes.size, 0);
    assert.ok(!RESERVE_UPLOAD_LUA.includes("user-a"));
    original.warn("Redis verification passed: local sockets, production Upstash REST, per-user quotas, encrypted five-minute cache, invalidation and fail-closed errors.");
  } finally {
    Date.now = realNow;
    global.fetch = originalFetch;
    if (quotas === undefined) delete globalThis.garminUploadQuotas;
    else globalThis.garminUploadQuotas = quotas;
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const config = { clientId: "test", clientSecret: "unused", sessionSecret: "s".repeat(32), redirectUri: null };
  verifyRateLimit({ loader: makeLoader, config }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
