ALTER TABLE "StravaConnection" ADD COLUMN "elevationVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StravaActivity"
ADD COLUMN "elevationGainMeters" DOUBLE PRECISION,
ADD COLUMN "elevationStreamState" TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX "StravaActivity_userId_elevationStreamState_idx" ON "StravaActivity"("userId", "elevationStreamState");
