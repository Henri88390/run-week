-- Additive, backward-compatible website-only activity tables. No existing table is changed.
CREATE TABLE "StravaConnection" (
    "userId" TEXT NOT NULL,
    "athleteKey" TEXT NOT NULL,
    "tokens" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncActive" BOOLEAN NOT NULL DEFAULT true,
    "syncPage" INTEGER NOT NULL DEFAULT 1,
    "syncAfter" INTEGER NOT NULL DEFAULT 0,
    "syncBefore" INTEGER NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "retryAt" TIMESTAMP(3),
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    CONSTRAINT "StravaConnection_pkey" PRIMARY KEY ("userId")
);
CREATE TABLE "StravaActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "localDate" TEXT NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "movingSeconds" INTEGER NOT NULL,
    "elapsedSeconds" INTEGER NOT NULL,
    "averageHr" DOUBLE PRECISION,
    "maxHr" DOUBLE PRECISION,
    "streams" JSONB,
    "streamState" TEXT NOT NULL DEFAULT 'pending',
    "maximalEffort" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StravaActivity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RunningAnalyticsSettings" (
    "userId" TEXT NOT NULL,
    "zoneBounds" JSONB NOT NULL,
    "thresholdBpm" INTEGER,
    CONSTRAINT "RunningAnalyticsSettings_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "StravaConnection_athleteKey_key" ON "StravaConnection"("athleteKey");
CREATE UNIQUE INDEX "StravaActivity_userId_sourceId_key" ON "StravaActivity"("userId", "sourceId");
CREATE INDEX "StravaActivity_userId_localDate_idx" ON "StravaActivity"("userId", "localDate");
CREATE INDEX "StravaActivity_userId_streamState_idx" ON "StravaActivity"("userId", "streamState");
ALTER TABLE "StravaConnection" ADD CONSTRAINT "StravaConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StravaActivity" ADD CONSTRAINT "StravaActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RunningAnalyticsSettings" ADD CONSTRAINT "RunningAnalyticsSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
