import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function run(moduleName, args) {
  const result = spawnSync(process.execPath, [require.resolve(moduleName), ...args], { stdio: "inherit" });
  if (result.error) {
    console.error(`Unable to start ${moduleName}: ${result.error.code ?? "unknown error"}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${moduleName} failed (${result.signal ?? result.status}).`);
    process.exit(result.status ?? 1);
  }
}

if (process.env.VERCEL_ENV === "production") {
  if (!process.env.DIRECT_URL?.trim()) {
    console.error("Set DIRECT_URL in the Vercel Production environment before deploying.");
    process.exit(1);
  }
  console.log("Applying production database migrations before building.");
  run("prisma/build/index.js", ["migrate", "deploy"]);
} else {
  console.log("Skipping database migrations outside Vercel Production.");
}

run("next/dist/bin/next", ["build"]);
