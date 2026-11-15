import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Summary } from "./api";
import { isRunning } from "../sports";
import { Prisma as PrismaValues } from "@/generated/prisma/client";

export async function saveSummary(tx: Prisma.TransactionClient, userId: string, activity: Summary, authoritative = false) {
  const sport = activity.sport_type ?? activity.type;
  const data = {
    name: activity.name, sport, startedAt: new Date(activity.start_date), localDate: activity.start_date_local.slice(0, 10),
    distanceMeters: activity.distance, movingSeconds: activity.moving_time ?? activity.elapsed_time, elapsedSeconds: activity.elapsed_time,
    averageHr: activity.average_heartrate ?? null, maxHr: activity.max_heartrate ?? null,
    elevationGainMeters: activity.total_elevation_gain ?? null,
    ...(!isRunning(sport) ? {
      streams: PrismaValues.DbNull, streamState: "unavailable", elevationStreamState: "unavailable", maximalEffort: false,
    } : {}),
  };
  const sourceId = String(activity.id);
  // Targeted webhook work owns this source, including sport changes. A stale
  // historical page must not overwrite it; queued webhook work will fetch it.
  if (!authoritative && await tx.stravaSyncJob.findFirst({ where: {
    userId, sourceId, kind: "webhook-activity",
  }, select: { id: true } })) return;
  await tx.stravaActivity.upsert({
    where: { userId_sourceId: { userId, sourceId } },
    create: { userId, sourceId, ...data }, update: data,
  });
}
