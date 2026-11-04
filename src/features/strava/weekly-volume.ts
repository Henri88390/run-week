import { calendarRange } from "./analytics";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export type WeeklyVolume = { start: string; distanceMeters: number; movingSeconds: number };

export function weeklyVolumes(days: readonly { localDate: string; distanceMeters: number; movingSeconds: number }[]): WeeklyVolume[] {
  const weeks = new Map<string, WeeklyVolume>();
  for (const day of days) {
    const start = calendarRange(day.localDate.slice(0, 7), day.localDate).start;
    const week = weeks.get(start) ?? { start, distanceMeters: 0, movingSeconds: 0 };
    week.distanceMeters += day.distanceMeters;
    week.movingSeconds += day.movingSeconds;
    weeks.set(start, week);
  }
  return [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export function averageWeeklyVolume(volumes: readonly WeeklyVolume[], today: string, period: { month: string } | { weeks: number }) {
  const currentMonday = Date.parse(`${calendarRange(today.slice(0, 7), today).start}T00:00:00Z`);
  let end = currentMonday;
  let start: number;
  if ("month" in period) {
    const first = new Date(`${period.month}-01T00:00:00Z`);
    const nextMonth = new Date(first);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const monday = Date.parse(`${calendarRange(period.month, `${period.month}-01`).start}T00:00:00Z`);
    start = monday < first.getTime() ? monday + WEEK_MS : monday;
    end = Math.min(end, start + Math.floor((nextMonth.getTime() - start) / WEEK_MS) * WEEK_MS);
  } else {
    start = end - period.weeks * WEEK_MS;
  }
  const weeks = "weeks" in period ? period.weeks : Math.max(0, Math.round((end - start) / WEEK_MS));
  let distanceMeters = 0;
  let movingSeconds = 0;
  for (const volume of volumes) {
    const monday = Date.parse(`${volume.start}T00:00:00Z`);
    if (monday >= start && monday < end) {
      distanceMeters += volume.distanceMeters;
      movingSeconds += volume.movingSeconds;
    }
  }
  return { weeks, distanceMeters: weeks > 0 ? distanceMeters / weeks : null,
    movingSeconds: weeks > 0 ? movingSeconds / weeks : null };
}
