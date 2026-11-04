import { calendarRange } from "./analytics";
import { syncPeriodRange, type SyncPeriod } from "./sync-period";

export function volumeAxisMaximum(values: readonly number[], increment: number) {
  return Math.max(1, Math.ceil(Math.max(0, ...values) / (4 * increment))) * 4 * increment;
}

export function volumeBuckets(period: SyncPeriod, days: readonly { localDate: string; distanceMeters: number; movingSeconds: number }[]) {
  const range = syncPeriodRange(period);
  const buckets = new Map<string, { start: string; end: string; distanceMeters: number; movingSeconds: number }>();
  const cursor = new Date(`${range.start}T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) < range.end) {
    const date = cursor.toISOString().slice(0, 10);
    const key = period.view === "year" ? date.slice(0, 7)
      : period.view === "month" ? calendarRange(date.slice(0, 7), date).start : date;
    const bucket = buckets.get(key) ?? { start: date, end: date, distanceMeters: 0, movingSeconds: 0 };
    bucket.end = date;
    buckets.set(key, bucket);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const day of days) {
    if (day.localDate < range.start || day.localDate >= range.end) continue;
    const key = period.view === "year" ? day.localDate.slice(0, 7)
      : period.view === "month" ? calendarRange(day.localDate.slice(0, 7), day.localDate).start : day.localDate;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.distanceMeters += day.distanceMeters;
      bucket.movingSeconds += day.movingSeconds;
    }
  }
  return [...buckets.values()];
}
