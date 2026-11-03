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
  const saved = Object.fromEntries(["NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]
    .map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  const realNow = Date.now;
  const quotas = globalThis.garminUploadQuotas;
  const sentinel = "PRIVATE_REDIS_CREDENTIAL_URL_KEY_BODY";
  const testConfig = config ?? { clientId: "test", clientSecret: "unused", sessionSecret: "s".repeat(32), redirectUri: null };
  try {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const { uploadIdentity, reserveUpload, RESERVE_UPLOAD_LUA } = loader()("src\\features\\garmin\\server\\upload-rate-limit.ts");
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

    process.env.NODE_ENV = "production";
    process.env.UPSTASH_REDIS_REST_URL = "https://verification.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = sentinel;
    const commands = [];
    global.fetch = async (url, init) => {
      commands.push({ url, init, command: JSON.parse(init.body) });
      return Response.json({ result: [1, 0] });
    };
    assert.deepEqual(await reserveUpload(testConfig, "user-a"), { allowed: true });
    assert.deepEqual(await reserveUpload(testConfig, "user-b"), { allowed: true });
    assert.equal(commands.length, 2);
    for (const { url, init, command } of commands) {
      assert.equal(url, "https://verification.upstash.io");
      assert.deepEqual(command.slice(0, 3), ["EVAL", RESERVE_UPLOAD_LUA, "1"]);
      assert.match(command[3], /^run-week:garmin:upload:v2:production:[a-f0-9]{64}$/);
      assert.equal(command[4], "1");
      assert.ok(!JSON.stringify(command).includes("user-a") && !JSON.stringify(command).includes("user-b"));
      assert.ok(!JSON.stringify(command).includes(tokens?.accessToken ?? "unused"));
      assert.equal(init.redirect, "error");
      assert.equal(init.cache, "no-store");
      assert.ok(init.signal instanceof AbortSignal);
    }
    assert.notEqual(commands[0].command[3], commands[1].command[3], "Redis buckets are per-user HMACs");

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
      commands.length = 0;
      await assert.rejects(reserveUpload(testConfig, "user-a"), (error) => error.category === "configuration");
      assert.equal(commands.length, 0, "Invalid Redis configuration must not send a request");
    }

    process.env.UPSTASH_REDIS_REST_URL = "https://verification.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = sentinel;
    for (const failure of [
      new TypeError(sentinel), new Response(sentinel, { status: 401 }), new Response(sentinel, { status: 503 }),
      Response.json({ result: [0, 86401] }), Response.json({ result: [1, 0], error: sentinel }),
    ]) {
      global.fetch = async () => failure instanceof Error ? Promise.reject(failure) : failure;
      await assert.rejects(reserveUpload(testConfig, "user-a"), (error) => error.category === "unavailable");
    }
    assert.ok(!RESERVE_UPLOAD_LUA.includes("user-a"));
    original.warn("Rate-limit verification passed: atomic same-user limits, per-user buckets, daily reset, development cooldown, v2 Redis keys and fail-closed Redis validation.");
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
