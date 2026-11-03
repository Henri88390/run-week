-- Existing connections have no Garmin user key; they are removed and must reconnect.
-- Sent-workout records are kept so a reconnect can still delete them from Garmin.
DELETE FROM "GarminConnection";

-- AlterTable
ALTER TABLE "GarminConnection" ADD COLUMN "garminUserKey" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "GarminConnection_garminUserKey_key" ON "GarminConnection"("garminUserKey");