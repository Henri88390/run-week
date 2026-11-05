ALTER TABLE "StravaConnection" ADD COLUMN "generation" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE TABLE "StravaSyncJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "generation" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "start" TEXT NOT NULL,
  "end" TEXT NOT NULL,
  "remaining" JSONB NOT NULL DEFAULT '[]',
  "before" INTEGER NOT NULL,
  "page" INTEGER NOT NULL DEFAULT 1,
  "phase" TEXT NOT NULL DEFAULT 'summaries',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "version" INTEGER NOT NULL DEFAULT 1,
  "publishedAt" TIMESTAMP(3),
  "retryAt" TIMESTAMP(3),
  "errorCode" TEXT,
  "summaries" INTEGER NOT NULL DEFAULT 0,
  "recordings" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StravaSyncJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StravaSyncJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StravaConnection"("userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "StravaSyncJob_status_publishedAt_idx" ON "StravaSyncJob"("status", "publishedAt");
CREATE INDEX "StravaSyncJob_userId_createdAt_idx" ON "StravaSyncJob"("userId", "createdAt");
CREATE UNIQUE INDEX "StravaSyncJob_one_active_per_user" ON "StravaSyncJob"("userId")
  WHERE "status" IN ('queued', 'running', 'paused');

CREATE TABLE "StravaSyncQuota" (
  "id" TEXT NOT NULL,
  "nextCallAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StravaSyncQuota_pkey" PRIMARY KEY ("id")
);
