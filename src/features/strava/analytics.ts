// Adapted from the user's running-data/src/server/analytics/running.ts.
// Same interval exclusion and distance/time OLS eligibility; no inferred zones.
import type { ActivityStreams, AnalyticsSettings, ActivitySummary, CalendarWeek } from "./types";
import { calculateVdot, paceAtFraction } from "@/features/running-programs/domain";

export const ZONE_FRACTIONS = [0, .7, .8, .85, .9, 1] as const;
export const PRESET_MAX_HR = 190;
export const MIN_RECORDED_SPEED = .5;

export function roundedDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/** Round the duration once before decomposing it, including minute/hour rollover. */
export function durationWithSeconds(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  return { hours: Math.floor(total / 3600), minutes: Math.floor(total % 3600 / 60), seconds: total % 60 };
}

/** Activity zones extend the highest reference band through the valid recorded HR limit. */
export function activityZoneBounds(zone: number): [number, number] {
  return [zone === 1 ? 30 : PRESET_MAX_HR * ZONE_FRACTIONS[zone - 1],
    zone === 5 ? 240 : PRESET_MAX_HR * ZONE_FRACTIONS[zone]];
}

/** Shared raw left-sample holds: neither display smoothing nor missing gaps affect classification. */
export function activityZoneIntervals(stream: ActivityStreams | null, elapsedSeconds: number) {
  const total = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const intervals: { zone: number; startSeconds: number; endSeconds: number; sample: number }[] = [];
  const time = stream?.time;
  if (time && time.every((t, i) => Number.isFinite(t) && t >= 0 && (i === 0 || t > time[i - 1]))) {
    for (let i = 0; i + 1 < time.length; i++) {
      const dt = time[i + 1] - time[i];
      const hr = stream?.heartrate?.[i];
      if (dt > 15 || hr == null || hr > 240) continue;
      const zone = heartRateZone(hr, PRESET_MAX_HR, 240);
      const startSeconds = Math.min(total, time[i]), endSeconds = Math.min(total, time[i + 1]);
      if (zone !== null && endSeconds > startSeconds) intervals.push({ zone, startSeconds, endSeconds, sample: i });
    }
  }
  return intervals;
}

/** Account for the whole elapsed duration using exactly the same holds as activity highlights. */
export function activityZoneTimes(stream: ActivityStreams | null, elapsedSeconds: number) {
  const total = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  const zones = Array<number>(5).fill(0);
  for (const interval of activityZoneIntervals(stream, elapsedSeconds)) {
    zones[interval.zone - 1] += interval.endSeconds - interval.startSeconds;
  }
  return { zones, unclassified: Math.max(0, total - zones.reduce((sum, value) => sum + value, 0)) };
}

export function recentEnduranceRange(today: string) {
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 84);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function speedRetention(critical: number | null, fastest: number | null) {
  return critical !== null && fastest !== null && Number.isFinite(critical) && Number.isFinite(fastest)
    && critical > 0 && fastest >= critical ? critical / fastest * 100 : null;
}

export function danielsEstimates(vdot: number | null) {
  if (vdot === null || !Number.isFinite(vdot) || vdot <= 0) return null;
  const vmaPace = paceAtFraction(vdot, 1);
  const thresholdPace = paceAtFraction(vdot, .88);
  if (!Number.isFinite(vmaPace) || !Number.isFinite(thresholdPace) || vmaPace <= 0 || thresholdPace <= vmaPace) return null;
  return { vmaKmh: 3600 / vmaPace, vmaPace, thresholdPace, ratio: vmaPace / thresholdPace * 100 };
}

export function dominantZone(seconds: readonly number[]): number | null {
  const longest = Math.max(0, ...seconds);
  return longest > 0 ? seconds.indexOf(longest) + 1 : null;
}

export function recordedPace(metersPerSecond: number | null | undefined): number | null {
  return metersPerSecond != null && Number.isFinite(metersPerSecond) && metersPerSecond >= MIN_RECORDED_SPEED
    ? 1000 / metersPerSecond : null;
}

export function activityAverages(activities: readonly Pick<ActivitySummary, "averageHr" | "movingSeconds" | "distanceMeters">[]) {
  const measured = activities.filter((activity) => activity.averageHr !== null && activity.movingSeconds > 0);
  const weight = measured.reduce((sum, activity) => sum + activity.movingSeconds, 0);
  const distance = activities.reduce((sum, activity) => sum + activity.distanceMeters, 0);
  const moving = activities.reduce((sum, activity) => sum + activity.movingSeconds, 0);
  return {
    averageHr: weight > 0 ? measured.reduce((sum, activity) => sum + (activity.averageHr ?? 0) * activity.movingSeconds, 0) / weight : null,
    pace: distance > 0 && moving > 0 ? moving * 1000 / distance : null,
  };
}

export function effortPerformance(activities: readonly ActivitySummary[]) {
  const efforts = validMaximalEfforts(activities);
  const fastest = efforts.reduce<ActivitySummary | null>((best, activity) =>
    !best || activity.distanceMeters / activity.elapsedSeconds > best.distanceMeters / best.elapsedSeconds ? activity : best, null);
  if (!fastest) return null;
  const vdot = calculateVdot(fastest.distanceMeters, fastest.elapsedSeconds);
  return {
    activityId: fastest.id, speed: fastest.distanceMeters / fastest.elapsedSeconds,
    vdot: Number.isFinite(vdot) && vdot > 0 ? vdot : null, count: efforts.length,
  };
}

function* recordedPaces(streams: readonly ActivityStreams[]) {
  for (const stream of streams) {
    for (let i = 0; i < stream.time.length - 1; i++) {
      const seconds = stream.time[i + 1] - stream.time[i];
      const pace = recordedPace(stream.velocity_smooth?.[i]);
      if (pace === null || !Number.isFinite(seconds) || seconds <= 0 || seconds > 15) continue;
      yield { pace, seconds };
    }
  }
}

export function paceHistogram(streams: readonly ActivityStreams[]) {
  const paceSeconds = new Map<number, number>();
  let recordedSeconds = 0;
  for (const { pace, seconds } of recordedPaces(streams)) {
    paceSeconds.set(pace, (paceSeconds.get(pace) ?? 0) + seconds);
    recordedSeconds += seconds;
  }
  const paces = [...paceSeconds].sort(([a], [b]) => a - b);
  const minimum = paces[0]?.[0];
  if (minimum === undefined) return null;
  let cutoff = minimum;
  let cumulativeSeconds = 0;
  for (const [pace, seconds] of paces) {
    cutoff = pace;
    cumulativeSeconds += seconds;
    if (cumulativeSeconds >= recordedSeconds * .99) break;
  }
  const width = Math.max(5, Math.ceil((cutoff - minimum) / 24 / 5) * 5);
  const start = Math.floor(minimum / width) * width;
  const count = Math.max(1, Math.ceil((cutoff - start) / width));
  const bins = Array.from({ length: count }, (_, i) => ({
    start: start + i * width, end: start + (i + 1) * width, seconds: 0,
  }));
  let totalSeconds = 0;
  let totalMeters = 0;
  for (const [pace, seconds] of paces) {
    if (pace > cutoff) break;
    bins[Math.max(0, Math.min(count - 1, Math.floor((pace - start) / width)))].seconds += seconds;
    totalSeconds += seconds;
    totalMeters += seconds * 1000 / pace;
  }
  return { bins, averagePace: Math.min(cutoff, totalSeconds * 1000 / totalMeters) };
}

export function aboveThresholdPercent(aboveSeconds: number | null, movingSeconds: number): number | null {
  return aboveSeconds === null || movingSeconds <= 0 ? null : aboveSeconds / movingSeconds * 100;
}

export function heartRateZone(hr: number | null, maxHr: number | null, validMaxHr = maxHr): number | null {
  if (hr === null || maxHr === null || validMaxHr === null || !Number.isFinite(hr) || hr < 30 || hr > validMaxHr) return null;
  for (let zone = 1; zone < 5; zone++) if (hr < maxHr * ZONE_FRACTIONS[zone]) return zone;
  return 5;
}

export function calendarRange(month: string, weekDate?: string) {
  if (weekDate) {
    const start = new Date(`${weekDate}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  const start = new Date(`${month}-01T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(`${month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(end.getUTCDate() + (7 - (end.getUTCDay() + 6) % 7) % 7);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function heartRateTimes(streams: readonly ActivityStreams[], settings: AnalyticsSettings) {
  const maxHr = settings.maxHr;
  const zones = maxHr === null ? [] : ZONE_FRACTIONS.slice(0, -1).map((fraction, i) => ({
    zone: i + 1, min: fraction * maxHr, max: ZONE_FRACTIONS[i + 1] * maxHr, seconds: 0,
  }));
  const threshold = maxHr === null ? null : { below: 0, above: 0 };
  for (const stream of streams) {
    for (let i = 0; i < stream.time.length - 1; i++) {
      const hr = stream.heartrate?.[i];
      const seconds = stream.time[i + 1] - stream.time[i];
      if (hr == null || !Number.isFinite(hr) || hr < 30 || hr > 240 || seconds <= 0 || seconds > 15) continue;
      const zoneNumber = heartRateZone(hr, maxHr);
      if (zoneNumber === null) continue;
      const zone = zones.find((z) => z.zone === zoneNumber);
      if (zone) zone.seconds += seconds;
      if (threshold && maxHr !== null) {
        if (hr > maxHr * .9) threshold.above += seconds;
        else threshold.below += seconds;
      }
    }
  }
  return { zones, threshold };
}

export function calendarWeeks(month: string, activities: readonly ActivitySummary[],
  measurements: ReadonlyMap<string, { above: number; measured: number; zoneSeconds: number[] }>, maxHr: number | null, weekDate?: string): CalendarWeek[] {
  const range = calendarRange(month, weekDate);
  const weeks: CalendarWeek[] = [];
  const cursor = new Date(`${range.start}T00:00:00Z`);
  while (cursor.toISOString().slice(0, 10) < range.end) {
    const week: CalendarWeek = {
      startDate: cursor.toISOString().slice(0, 10), days: [], distanceMeters: 0,
      movingSeconds: 0, aboveSeconds: maxHr === null ? null : 0, partialHr: false,
    };
    let measured = 0;
    for (let day = 0; day < 7; day++) {
      const date = cursor.toISOString().slice(0, 10);
      const runs = activities.filter((activity) => activity.localDate === date);
      const zoneSeconds = Array.from({ length: 5 }, (_, i) =>
        runs.reduce((sum, activity) => sum + (measurements.get(activity.id)?.zoneSeconds[i] ?? 0), 0));
      week.days.push({ date, activities: runs, zone: dominantZone(zoneSeconds), zoneSeconds });
      for (const activity of runs) {
        week.distanceMeters += activity.distanceMeters;
        week.movingSeconds += activity.movingSeconds;
        const hr = measurements.get(activity.id);
        measured += hr?.measured ?? 0;
        if (week.aboveSeconds !== null) week.aboveSeconds += hr?.above ?? 0;
        if (!hr || hr.measured < activity.elapsedSeconds) week.partialHr = true;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (week.movingSeconds > 0 && measured === 0) week.aboveSeconds = null;
    weeks.push(week);
  }
  return weeks;
}
function validMaximalEfforts<T extends Pick<ActivitySummary, "maximalEffort" | "elapsedSeconds" | "distanceMeters">>(activities: readonly T[]): T[] {
  return activities.filter((a) => a.maximalEffort && Number.isFinite(a.elapsedSeconds)
    && a.elapsedSeconds > 0 && Number.isFinite(a.distanceMeters) && a.distanceMeters > 0);
}

export function criticalSpeed(activities: readonly Pick<ActivitySummary, "maximalEffort" | "elapsedSeconds" | "distanceMeters">[]) {
  const efforts = validMaximalEfforts(activities).filter((effort) => effort.elapsedSeconds >= 120 && effort.elapsedSeconds <= 7200);
  if (efforts.length < 3 || new Set(efforts.map((e) => e.elapsedSeconds)).size < 3) return null;
  const time = efforts.reduce((s, e) => s + e.elapsedSeconds, 0) / efforts.length;
  const distance = efforts.reduce((s, e) => s + e.distanceMeters, 0) / efforts.length;
  const variance = efforts.reduce((s, e) => s + (e.elapsedSeconds - time) ** 2, 0);
  if (!variance) return null;
  const speed = efforts.reduce((s, e) => s + (e.elapsedSeconds - time) * (e.distanceMeters - distance), 0) / variance;
  const dPrime = distance - speed * time;
  const total = efforts.reduce((s, e) => s + (e.distanceMeters - distance) ** 2, 0);
  const residual = efforts.reduce((s, e) => s + (e.distanceMeters - (speed * e.elapsedSeconds + dPrime)) ** 2, 0);
  const rSquared = 1 - residual / total;
  if (!Number.isFinite(speed) || speed <= 0 || dPrime < 0 || !Number.isFinite(rSquared) || rSquared < .9) return null;
  return { speed, dPrime, rSquared, count: efforts.length };
}
