-- Additive: old deployments continue creating ordinary jobs with null webhook fields.
ALTER TABLE "StravaSyncJob"
ADD COLUMN "sourceId" TEXT,
ADD COLUMN "webhookDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "webhookEventTime" INTEGER,
ADD COLUMN "webhookFingerprint" TEXT,
ADD COLUMN "webhookKey" TEXT;

CREATE UNIQUE INDEX "StravaSyncJob_webhookKey_key" ON "StravaSyncJob"("webhookKey");
CREATE INDEX "StravaSyncJob_userId_sourceId_idx" ON "StravaSyncJob"("userId", "sourceId");

-- Preserve one ordinary import per account while allowing independently coalesced
-- targeted jobs to queue alongside it. Prisma cannot express this partial index.
DROP INDEX "StravaSyncJob_one_active_per_user";
CREATE UNIQUE INDEX "StravaSyncJob_one_active_per_user" ON "StravaSyncJob"("userId")
WHERE "status" IN ('queued', 'running', 'paused')
  AND "kind" IN ('history', 'incremental', 'elevation');
