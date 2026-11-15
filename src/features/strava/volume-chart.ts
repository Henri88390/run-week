import { calendarRange } from "./analytics";
import { syncPeriodRange, type SyncPeriod } from "./sync-period";

export function volumeAxisMaximum(values: readonly number[], increment: number) {
  return Math.max(1, Math.ceil(Math.max(0, ...values) / (4 * increment))) * 4 * increment;
}

export type VolumeGranularity = "day" | "week" | "month";

/** Granularity used by default for a period: days in a week, weeks in months, months in a year. */
export function defaultVolumeGranularity(period: SyncPeriod): VolumeGranularity {
  return period.view === "year" ? "month" : period.view === "week" ? "day" : "week";
}

/** Running distance/time plus non-running active time per chart bucket. */
export function volumeBuckets(period: SyncPeriod, days: readonly { localDate: string; distanceMeters: number; movingSeconds: number; crossSeconds?: number }[],
  granularity = defaultVolumeGranularity(period)) {
  const range = syncPeriodRange(period);
  const bucketKey = (date: string) => granularity === "month" ? date.slice(0, 7)
    : granularity === "day" ? date : calendarRange(date.slice(0, 7), date).start;
  const buckets = new Map<string, { start: string; end: string; distanceMeters: number; movingSeconds: number; crossSeconds: number }>();
  const cursor = new Date(`${range.start}T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) < range.end) {
    const date = cursor.toISOString().slice(0, 10);
    const key = bucketKey(date);
    const bucket = buckets.get(key) ?? { start: date, end: date, distanceMeters: 0, movingSeconds: 0, crossSeconds: 0 };
    bucket.end = date;
    buckets.set(key, bucket);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const day of days) {
    if (day.localDate < range.start || day.localDate >= range.end) continue;
    const key = bucketKey(day.localDate);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.distanceMeters += day.distanceMeters;
      bucket.movingSeconds += day.movingSeconds;
      bucket.crossSeconds += day.crossSeconds ?? 0;
    }
  }
  return [...buckets.values()];
}
