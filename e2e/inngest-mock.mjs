// Local delivery/worker harness; all Strava calls go to the synthetic mock.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
if (process.env.NODE_ENV !== "development" || process.env.STRAVA_E2E_MOCK_ORIGIN !== "http://127.0.0.1:3102") {
  throw new Error("The worker harness requires development mode and the local synthetic Strava endpoint");
}
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const file = path.join(root, "src", specifier.slice(2));
      return { url: pathToFileURL(`${file}.ts`).href, shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(path.join(root, "src")).href)) {
      const file = fileURLToPath(new URL(specifier, context.parentURL));
      for (const candidate of [file, `${file}.ts`]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".ts") && url.startsWith(pathToFileURL(path.join(root, "src")).href)) {
      return { format: "module", source: ts.transpileModule(fs.readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText, shortCircuit: true };
    }
    return next(url, context);
  },
});
const { syncChunk } = await import("../src/features/strava/server/background-worker.ts");
const { syncEventSchema } = await import("../src/features/strava/background-sync.ts");
const { db } = await import("../src/features/account/server/db.ts");
const { scheduleDueSyncAccounts } = await import("../src/features/strava/server/background-jobs.ts");
const events = [];
const seen = new Set();
const pending = [];
let working = false;
let paused = false;
let failDelivery = false;
let lastError = null;

async function drain() {
  if (working || paused) return;
  working = true;
  try {
    while (pending.length && !paused) {
      const data = pending[0];
      const result = await syncChunk(data.jobId, data.version);
      if (result.done) pending.shift();
      else await new Promise((resolve) => setTimeout(resolve,
        result.waitUntil ? Math.min(1000, Math.max(20, Date.parse(result.waitUntil) - Date.now())) : 1100));
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Worker failure";
    console.error("Inngest mock worker failed", lastError);
  } finally { working = false; }
}
setInterval(() => void drain(), 250).unref();

http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:3103");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/health") return response.end(JSON.stringify({ ok: true }));
  if (url.pathname === "/__control") {
    if (body) { paused = body.paused ?? paused; failDelivery = body.failDelivery ?? failDelivery; }
    return response.end(JSON.stringify({ events, working, pending, paused, lastError }));
  }
  if (url.pathname === "/__dispatch") {
    const jobs = await db().stravaSyncJob.findMany({ where: { status: "queued", publishedAt: null } });
    for (const job of jobs) {
      pending.push({ jobId: job.id, version: job.version });
      await db().stravaSyncJob.update({ where: { id: job.id }, data: { publishedAt: new Date() } });
    }
    return response.end(JSON.stringify({ ok: true }));
  }
  if (url.pathname === "/__schedule") {
    const scheduled = await scheduleDueSyncAccounts();
    return response.end(JSON.stringify({ ok: true, scheduled }));
  }
  if (url.pathname.startsWith("/e/")) {
    if (failDelivery) { response.statusCode = 503; return response.end(JSON.stringify({ error: "Synthetic outage" })); }
    const batch = Array.isArray(body) ? body : [body];
    for (const event of batch) {
      const data = syncEventSchema.parse(event.data);
      events.push(event);
      if (!seen.has(event.id)) { seen.add(event.id); pending.push(data); }
    }
    return response.end(JSON.stringify({ status: 200, ids: batch.map((event) => event.id) }));
  }
  response.statusCode = 404;
  response.end("{}");
}).listen(3103, "127.0.0.1", () => console.log("Local Inngest delivery/worker harness on 3103"));
