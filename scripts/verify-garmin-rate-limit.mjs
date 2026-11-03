import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

// Optional real, local Redis execution; never connects to Upstash or Garmin.
function redisCommand(port, args) {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let data = Buffer.alloc(0);
    function parse(offset = 0) {
      const end = data.indexOf("\r\n", offset);
      if (end < 0) return null;
      const kind = String.fromCharCode(data[offset]);
      const text = data.toString("utf8", offset + 1, end);
      let next = end + 2;
      if (kind === "-") throw new Error(text);
      if (kind === ":") return [Number(text), next];
      if (kind === "+") return [text, next];
      if (kind === "$") {
        const length = Number(text);
        if (length === -1) return [null, next];
        if (data.length < next + length + 2) return null;
        return [data.toString("utf8", next, next + length), next + length + 2];
      }
      if (kind === "*") {
        const items = [];
        for (let i = 0; i < Number(text); i++) {
          const item = parse(next);
          if (!item) return null;
          items.push(item[0]);
          next = item[1];
        }
        return [items, next];
      }
      throw new Error("Unexpected local Redis response");
    }
    socket.setTimeout(5000, () => socket.destroy(new Error("Local Redis verification timed out")));
    socket.on("error", reject);
    socket.on("connect", () => {
      socket.write(`*${args.length}\r\n${args.map((arg) => {
        const text = String(arg);
        return `$${Buffer.byteLength(text)}\r\n${text}\r\n`;
      }).join("")}`);
    });
    socket.on("data", (chunk) => {
      data = Buffer.concat([data, chunk]);
      try {
        const result = parse();
        if (result) { socket.end(); resolve(result[0]); }
      } catch (error) { socket.destroy(); reject(error); }
    });
  });
}

export async function verifyRateLimit({ loader, config, tokens, input, request, records, nextServer, original }) {
  const saved = Object.fromEntries(["NODE_ENV", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]
    .map((key) => [key, process.env[key]]));
  const load = loader({
    "@/features/garmin/server/config": { garminConfig: () => config },
    "next/server": { ...nextServer, connection: async () => {} },
  });
  const session = load("src\\features\\garmin\\server\\session.ts");
  const { reserveUpload, RESERVE_UPLOAD_LUA } = load("src\\features\\garmin\\server\\upload-rate-limit.ts");
  const uploads = load("src\\app\\api\\garmin\\workouts\\route.ts");
  const sentinel = "PRIVATE_REDIS_CREDENTIAL_URL_KEY_BODY";
  let fetchCalls = [];
  function mockFetch(result = [1, 0]) {
    fetchCalls = [];
    global.fetch = async (url, init) => {
      fetchCalls.push({ url, init, command: JSON.parse(init.body) });
      if (result instanceof Error) throw result;
      if (result instanceof Response) return result;
      return Response.json({ result });
    };
  }
  function configure(environment = "production") {
    process.env.NODE_ENV = environment;
    process.env.UPSTASH_REDIS_REST_URL = "https://verification.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = sentinel;
  }
  try {
    configure();
    mockFetch();
    assert.deepEqual(await reserveUpload(config, tokens), { allowed: true });
    const command = fetchCalls[0].command;
    assert.deepEqual(command.slice(0, 3), ["EVAL", RESERVE_UPLOAD_LUA, "1"]);
    assert.match(command[3], /^run-week:garmin:upload:v1:production:[a-f0-9]{64}$/);
    assert.equal(command[4], "1");
    assert.ok(!JSON.stringify(command).includes(tokens.refreshToken));
    assert.ok(!JSON.stringify(command).includes(tokens.accessToken));
    assert.equal(fetchCalls[0].init.redirect, "error");
    assert.equal(fetchCalls[0].init.cache, "no-store");
    assert.ok(fetchCalls[0].init.signal instanceof AbortSignal);

    for (const [url, token] of [
      [undefined, sentinel], ["https://verification.upstash.io", undefined],
      ["http://verification.upstash.io", sentinel], ["https://example.test", sentinel],
      ["https://user:password@verification.upstash.io", sentinel],
      ["https://verification.upstash.io?token=secret", sentinel],
      ["https://verification.upstash.io/path", sentinel], ["bad", sentinel],
      ["https://verification.upstash.io", "bad\r\ntoken"],
    ]) {
      if (url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = url;
      if (token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = token;
      mockFetch();
      await assert.rejects(reserveUpload(config, tokens), (error) => error.category === "configuration");
      assert.equal(fetchCalls.length, 0);
    }
    delete process.env.UPSTASH_REDIS_REST_URL;
    mockFetch();
    const unconfigured = await uploads.POST(request("workouts", { cookie: { ...tokens, expiresAt: 0 } }));
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).error, "unavailable");
    assert.equal(fetchCalls.length, 0);
    assert.equal(records.at(-1).operation, "rateLimit");
    assert.equal(records.at(-1).category, "configuration");
    configure();
    for (const failure of [
      new TypeError(sentinel), new DOMException(sentinel, "TimeoutError"),
      new Response(sentinel, { status: 401 }), new Response(sentinel, { status: 503 }),
      new Response(sentinel, { status: 429 }), new Response(sentinel, { status: 302 }),
      new Response(sentinel), Response.json({ error: sentinel }),
      Response.json({ result: [1, 0], error: sentinel }),
      [0, 0], [0, 86401], [0, 1.1], [1, 10], ["1", 0], null, [1],
    ]) {
      mockFetch(failure);
      const response = await uploads.POST(request("workouts", { cookie: { ...tokens, expiresAt: 0 } }));
      assert.equal(response.status, 503);
      assert.equal((await response.json()).error, "unavailable");
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.has("Set-Cookie"), false);
      assert.equal(fetchCalls.length, 1, "Redis failure must not refresh or mutate Garmin, or retry Redis");
      assert.equal(records.at(-1).operation, "rateLimit");
      assert.ok(["configuration", "unavailable"].includes(records.at(-1).category));
    }
    mockFetch([0, 17]);
    const blocked = await uploads.POST(request("workouts", {
      cookie: { ...tokens, expiresAt: 0 },
      body: { ...input, workouts: [{ ...input.workouts[0], previousWorkoutId: 321 }] },
    }));
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get("Retry-After"), "17");
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.retryAfterSeconds, 17);
    assert.equal(blockedBody.error, "rateLimited");
    assert.deepEqual(blockedBody.results, []);
    assert.equal(blocked.headers.get("X-Request-ID"), blockedBody.requestId);
    assert.equal(fetchCalls.length, 1, "Reservation must precede refresh and replacement");
    assert.equal(blocked.headers.has("Set-Cookie"), false);

    for (const options of [{ cookie: null }, { origin: "https://other.test" }, { body: { ...input, workouts: [] } }]) {
      mockFetch();
      assert.ok((await uploads.POST(request("workouts", options))).status >= 400);
      assert.equal(fetchCalls.length, 0, "Invalid requests must not reserve quota");
    }
    for (const environment of ["production", "test", "development"]) {
      configure(environment);
      mockFetch([0, 10]);
      await uploads.POST(new nextServer.NextRequest("http://localhost:3000/api/garmin/workouts", {
        method: "POST",
        headers: {
          Origin: "http://localhost:3000", "Content-Type": "application/json",
          Cookie: `${session.SESSION_COOKIE}=${session.seal(tokens, config.sessionSecret)}`,
          "X-Forwarded-Host": "localhost", "X-Development": "true",
        },
        body: JSON.stringify({ ...input, development: true }),
      }));
      assert.equal(fetchCalls[0].command[4], environment === "development" ? "0" : "1");
    }
    configure();

    const identity = session.uploadIdentity(tokens, config);
    const a = request("workouts");
    const b = request("workouts");
    assert.notEqual(a.cookies.get(session.SESSION_COOKIE).value, b.cookies.get(session.SESSION_COOKIE).value);
    assert.equal(session.uploadIdentity(session.readSession(a, config), config), identity);
    assert.equal(session.uploadIdentity(session.readSession(b, config), config), identity);
    assert.equal(session.uploadIdentity({ ...tokens, accessToken: "another-access-token" }, config), identity);
    assert.notEqual(session.uploadIdentity({ ...tokens, refreshToken: "different-authorization" }, config), identity);
    assert.notEqual(session.uploadIdentity(tokens, { ...config, sessionSecret: "y".repeat(32) }), identity);
    let rotated = { ...tokens, expiresAt: 0 };
    for (let i = 0; i < 3; i++) {
      global.fetch = async () => Response.json({ access_token: `access-${i}`, refresh_token: `refresh-${i}` });
      const refreshed = await session.freshTokens(config, rotated);
      assert.equal(refreshed.refreshed, true);
      assert.equal(refreshed.tokens.uploadIdentity, identity);
      const response = nextServer.NextResponse.json({});
      session.writeSession(response, a, config, refreshed.tokens);
      const stored = session.unseal(response.cookies.get(session.SESSION_COOKIE).value, config.sessionSecret);
      assert.equal(stored.uploadIdentity, identity);
      rotated = { ...stored, expiresAt: 0 };
      mockFetch([0, 10]);
      await reserveUpload(config, rotated);
      assert.equal(fetchCalls[0].command[3], command[3], "Refresh must not change Redis identity");
    }
    for (const cookie of [
      { ...tokens, uploadIdentity: "invalid" }, { ...tokens, consentVersion: "2026-11-03" },
    ]) assert.equal(session.readSession(request("workouts", { cookie }), config), null);
    const tampered = `${session.seal(tokens, config.sessionSecret)}tampered`;
    assert.equal(session.readSession(new nextServer.NextRequest("https://example.test", {
      headers: { Cookie: `${session.SESSION_COOKIE}=${tampered}` },
    }), config), null);

    const client = loader({
      react: { useCallback: (callback) => callback, useEffect: () => {}, useState: (initial) => [initial, () => {}] },
    })("src\\features\\garmin\\use-garmin.ts").useGarmin();
    global.fetch = async () => Response.json(blockedBody, { status: 429, headers: { "Retry-After": "17" } });
    assert.deepEqual(await client.send({ profile: { vdot: 40 }, startDate: input.weekStart }, input.workouts, "en"),
      { count: 0, error: "rateLimited", requestId: blockedBody.requestId, retryAfterSeconds: 17 });
    const { MESSAGES } = load("src\\features\\i18n\\messages\\index.ts");
    for (const messages of Object.values(MESSAGES)) assert.ok(messages.garmin.retryAfter(17).includes("17"));

    if (process.env.GARMIN_VERIFY_REDIS_PORT) {
      const port = Number(process.env.GARMIN_VERIFY_REDIS_PORT);
      assert.ok(Number.isInteger(port) && port > 0 && port <= 65535);
      const redis = (...args) => redisCommand(port, args);
      assert.equal(await redis("PING"), "PONG");
      const keys = new Set();
      // Only replace the time source for deterministic boundary checks; the policy itself is unchanged.
      function evalAt(script, key, now, daily) {
        keys.add(key);
        const withClock = script.replace("local time = redis.call('TIME')",
          `local time = {${Math.floor(now / 1000)}, ${(now % 1000) * 1000}}`);
        assert.notEqual(withClock, script);
        return redis("EVAL", withClock, "1", key, daily ? "1" : "0");
      }
      const prefix = `run-week:verification:${randomUUID()}`;
      const base = Date.UTC(2026, 10, 3, 12);
      try {
        // Exercise the exact production script and real Redis TIME as well as deterministic clocks.
        const liveKey = `${prefix}:live`;
        keys.add(liveKey);
        assert.deepEqual(await redis("EVAL", RESERVE_UPLOAD_LUA, "1", liveKey, "1"), [1, 0]);
        const liveBlocked = await redis("EVAL", RESERVE_UPLOAD_LUA, "1", liveKey, "1");
        assert.equal(liveBlocked[0], 0);
        assert.ok(liveBlocked[1] >= 1 && liveBlocked[1] <= 10);

        const key = `${prefix}:concurrent`;
        const parallel = await Promise.all(Array.from({ length: 30 }, () => evalAt(RESERVE_UPLOAD_LUA, key, base, true)));
        assert.equal(parallel.filter(([allowed]) => allowed === 1).length, 1);
        assert.equal(parallel.filter(([allowed, wait]) => allowed === 0 && wait === 10).length, 29);
        assert.equal(await redis("HGET", key, "count"), "1");
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, key, base + 9999, true), [0, 1]);
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, key, base + 10000, true), [1, 0]);
        for (let i = 2; i < 10; i++) {
          assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, key, base + i * 10000, true), [1, 0]);
        }
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, key, base + 100000, true), [0, 43100]);
        assert.equal(await redis("HGET", key, "count"), "10");
        const ttlBefore = await redis("PTTL", key);
        await evalAt(RESERVE_UPLOAD_LUA, key, base + 110000, true);
        const ttlAfter = await redis("PTTL", key);
        assert.ok(ttlBefore > 0 && ttlBefore <= 43110000);
        assert.ok(ttlAfter <= ttlBefore, "Blocked attempts must not extend retention");

        const midnight = Date.UTC(2026, 10, 4);
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, key, midnight, true), [1, 0]);
        assert.equal(await redis("HGET", key, "count"), "1");
        const edge = `${prefix}:midnight`;
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, edge, midnight - 1, true), [1, 0]);
        assert.ok(await redis("PTTL", edge) <= 10000);
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, edge, midnight, true), [0, 10]);
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, edge, midnight + 9998, true), [0, 1]);
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, edge, midnight + 9999, true), [1, 0]);

        const dev = `${prefix}:development`;
        for (let i = 0; i < 15; i++) {
          assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, dev, base + i * 10000, false), [1, 0]);
        }
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, dev, base + 140001, false), [0, 10]);
        assert.ok(await redis("PTTL", dev) <= 10000);
        await redis("PEXPIRE", dev, "1");
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(await redis("EXISTS", dev), 0);
        assert.deepEqual(await evalAt(RESERVE_UPLOAD_LUA, dev, base + 150000, false), [1, 0]);

        // Two separate module/route instances share only Redis; a week batch is one reservation.
        const instance = () => loader({
          "@/features/garmin/server/config": { garminConfig: () => config },
          "next/server": { ...nextServer, connection: async () => {} },
        })("src\\app\\api\\garmin\\workouts\\route.ts");
        const one = instance();
        const two = instance();
        let mutations = 0;
        let reservations = 0;
        let routeTime = base;
        let garminFailure = false;
        global.fetch = async (url, init) => {
          if (url === process.env.UPSTASH_REDIS_REST_URL) {
            reservations++;
            const args = JSON.parse(init.body);
            const testKey = `${prefix}:routes`;
            assert.equal(args[3], command[3]);
            return Response.json({ result: await evalAt(args[1], testKey, routeTime, args[4] === "1") });
          }
          mutations++;
          if (garminFailure) throw new TypeError(sentinel);
          return url.endsWith("/workout") ? Response.json({ workoutId: 123 }) : new Response(null, { status: 204 });
        };
        const routeResponses = await Promise.all(Array.from({ length: 16 },
          (_, i) => (i % 2 ? one : two).POST(request("workouts"))));
        assert.equal(routeResponses.filter((response) => response.status === 200).length, 1);
        assert.equal(routeResponses.filter((response) => response.status === 429).length, 15);
        assert.equal(reservations, 16);
        assert.equal(mutations, input.workouts.length * 2);
        assert.equal(await redis("HGET", `${prefix}:routes`, "count"), "1");
        routeTime += 20000;
        garminFailure = true;
        const failed = await one.POST(request("workouts"));
        assert.equal((await failed.json()).error, "network");
        assert.equal(await redis("HGET", `${prefix}:routes`, "count"), "2", "Failed Garmin uploads still consume quota");
        assert.equal((await two.POST(request("workouts"))).status, 429);
        assert.equal(await redis("HGET", `${prefix}:routes`, "count"), "2", "Blocked requests must not consume quota");
        original.warn("Real local Redis Lua checks passed: atomic concurrency, 10-second boundary, UTC quota/reset, development exemption, TTL and shared route instances.");
      } finally {
        if (keys.size) await redis("DEL", ...keys);
      }
    } else {
      original.warn("Real Lua checks not run: set GARMIN_VERIFY_REDIS_PORT to an isolated local Redis port to exercise concurrency, UTC boundaries and TTL.");
    }
    assert.ok(!JSON.stringify(records).includes(sentinel), "Redis diagnostics leaked sensitive details");
    original.warn("Rate-limit verification passed: REST validation, fail-closed routing, trusted environment, identity/refresh stability, consent migration and localized retry feedback.");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
