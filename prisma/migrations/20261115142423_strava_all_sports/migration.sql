-- Additive, with a legacy-safe default: old workers cannot falsely complete
-- the new summary import. Preserve all history, jobs, checkpoints and defaults.
ALTER TABLE "StravaConnection" ADD COLUMN "sportsVersion" INTEGER NOT NULL DEFAULT 0;

-- Keep the existing ordinary-import exclusion across old and new deployments.
DROP INDEX "StravaSyncJob_one_active_per_user";
CREATE UNIQUE INDEX "StravaSyncJob_one_active_per_user" ON "StravaSyncJob"("userId")
WHERE "status" IN ('queued', 'running', 'paused')
  AND "kind" IN ('history', 'incremental', 'elevation', 'sports');
