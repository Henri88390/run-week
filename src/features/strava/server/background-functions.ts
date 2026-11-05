import "server-only";
import { db } from "@/features/account/server/db";
import { syncEventSchema } from "../background-sync";
import { inngest } from "./inngest";
import { syncChunk } from "./background-worker";
import { publishJob, scheduleDueSyncAccounts } from "./background-jobs";
import { logStravaFailure } from "./diagnostics";

async function safeBackgroundStep<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    logStravaFailure(error, "background-execution");
    throw new Error("Background synchronization unavailable");
  }
}

export const stravaImport = inngest.createFunction(
  {
    id: "strava-background-import",
    triggers: [{ event: "strava/sync.requested" }],
    concurrency: { limit: 1 },
    retries: 5,
    onFailure: async ({ event }) => {
      const data = syncEventSchema.parse(event.data.event.data);
      const job = await db().stravaSyncJob.findUnique({
        where: { id: data.jobId },
      });
      if (!job || job.version !== data.version) return;
      await db().$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${job.userId}`}))`;
        const failed = await tx.stravaSyncJob.updateMany({
          where: {
            id: job.id,
            version: data.version,
            status: { in: ["queued", "running", "paused"] },
          },
          data: { status: "failed", errorCode: "unavailable" },
        });
        if (failed.count)
          await tx.stravaConnection.updateMany({
            where: { userId: job.userId, generation: job.generation },
            data: { syncActive: false },
          });
      });
      logStravaFailure(
        new Error("Background retries exhausted"),
        "background-sync",
      );
    },
  },
  async ({ event, step }) => {
    const data = syncEventSchema.parse(event.data);
    for (let index = 0; index < 100; index++) {
      const result = await step.run(`chunk-${index}`, () =>
        safeBackgroundStep(() => syncChunk(data.jobId, data.version)),
      );
      if (result.done) return { done: true };
      if ("waitUntil" in result && result.waitUntil)
        await step.sleepUntil(`quota-${index}`, result.waitUntil);
      else await step.sleep(`spacing-${index}`, "1s");
    }
    // A fresh event bounds the durable step history. The outbox survives send failures.
    await step.run("continue-import", () =>
      safeBackgroundStep(async () => {
        await db().stravaSyncJob.updateMany({
          where: {
            id: data.jobId,
            version: data.version,
            status: { in: ["running", "paused"] },
          },
          data: {
            status: "queued",
            version: { increment: 1 },
            publishedAt: null,
          },
        });
        await publishJob(data.jobId);
      }),
    );
    return { continued: true };
  },
);

export const stravaDispatcher = inngest.createFunction(
  {
    id: "strava-sync-outbox",
    triggers: [{ cron: "*/10 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const ids = await step.run("queued-jobs", () =>
      safeBackgroundStep(async () =>
        (
          await db().stravaSyncJob.findMany({
            where: { publishedAt: null, status: "queued" },
            orderBy: { createdAt: "asc" },
            take: 100,
            select: { id: true },
          })
        ).map((job) => job.id),
      ),
    );
    for (const id of ids)
      await step.run(`publish-${id}`, () =>
        safeBackgroundStep(() => publishJob(id)),
      );
    return { dispatched: ids.length };
  },
);

export const stravaIncremental = inngest.createFunction(
  {
    id: "strava-incremental-sync",
    triggers: [{ cron: "0 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const scheduled = await step.run("schedule-accounts-due", () =>
      safeBackgroundStep(scheduleDueSyncAccounts),
    );
    return { scheduled };
  },
);
