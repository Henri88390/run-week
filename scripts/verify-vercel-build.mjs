import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("./vercel-build.mjs", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace("const require = createRequire(import.meta.url);", "");
const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(config.buildCommand, "npm run build:vercel");
assert.equal(manifest.scripts["build:vercel"], "node scripts/vercel-build.mjs");
assert.equal(manifest.scripts.build, "next build");

function verify(env, results = []) {
  const calls = [];
  const errors = [];
  let exitCode = 0;
  const stopped = new Error("Process exited");
  try {
    vm.runInNewContext(source, {
      require,
      spawnSync(command, args, options) {
        assert.equal(command, process.execPath);
        assert.equal(options.stdio, "inherit");
        calls.push(Array.from(args));
        return results.shift() ?? { status: 0 };
      },
      process: { env, execPath: process.execPath, exit(code) { exitCode = code; throw stopped; } },
      console: { log() {}, error(message) { errors.push(message); } },
    });
  } catch (error) {
    if (error !== stopped) throw error;
  }
  return { calls, errors, exitCode };
}

const production = { VERCEL_ENV: "production", DIRECT_URL: "mock-migration-url" };
const migration = [require.resolve("prisma/build/index.js"), "migrate", "deploy"];
const build = [require.resolve("next/dist/bin/next"), "build"];
assert.deepEqual(verify(production).calls, [migration, build]);
for (const VERCEL_ENV of ["preview", "development", undefined]) {
  assert.deepEqual(verify({ VERCEL_ENV, DIRECT_URL: "mock-migration-url" }).calls, [build]);
}
for (const DIRECT_URL of [undefined, "", "   "]) {
  const result = verify({ VERCEL_ENV: "production", DIRECT_URL, DATABASE_URL: "mock-runtime-url" });
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.calls, []);
  assert.match(result.errors[0], /Set DIRECT_URL/);
}
for (const failure of [{ status: 2 }, { status: null, signal: "SIGTERM" }, { error: { code: "ENOENT" } }]) {
  const result = verify(production, [failure]);
  assert.notEqual(result.exitCode, 0);
  assert.deepEqual(result.calls, [migration]);
  assert.equal(result.errors.length, 1);
}
assert.equal(verify(production, [{ status: 0 }, { status: 3 }]).exitCode, 3);
console.log("Vercel build checks passed: production migration ordering, preview isolation and failure blocking.");
