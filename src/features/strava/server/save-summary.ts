import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Summary } from "./api";

export async function saveSummary(tx: Prisma.TransactionClient, userId: string, activity: Summary) {
  const sport = activity.sport_type ?? activity.type;
  if (!["Run", "TrailRun", "VirtualRun"].includes(sport)) return;
  const data = {
    name: activity.name, sport, startedAt: new Date(activity.start_date), localDate: activity.start_date_local.slice(0, 10),
    distanceMeters: activity.distance, movingSeconds: activity.moving_time, elapsedSeconds: activity.elapsed_time,
    averageHr: activity.average_heartrate ?? null, maxHr: activity.max_heartrate ?? null,
    elevationGainMeters: activity.total_elevation_gain ?? null,
  };
  const sourceId = String(activity.id);
  await tx.stravaActivity.upsert({
    where: { userId_sourceId: { userId, sourceId } },
    create: { userId, sourceId, ...data }, update: data,
  });
}
