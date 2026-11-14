import { recordedPace } from "./analytics";
import { smoothSeries } from "./chart-smoothing";
import type { ActivityStreams } from "./types";

export type ChartPoint = {
  time: number; distance: number | null; hr: number | null;
  pace: number | null; altitude: number | null; gap: boolean;
};
export type ChartRow = ChartPoint & { separator?: true };
export type ChartMetric = "pace" | "hr" | "altitude";
export type ChartAxis = "time" | "distance";

/** Use whole-minute ticks, with the exact elapsed endpoint as the final tick. */
export function timeAxisTicks(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return [];
  if (durationSeconds === 0) return [0];
  const spanMinutes = durationSeconds / 60;
  const targetMinutes = Math.max(1, Math.ceil(spanMinutes / 8));
  const magnitude = 10 ** Math.floor(Math.log10(targetMinutes));
  const normalized = targetMinutes / magnitude;
  const stepMinutes = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const stepSeconds = stepMinutes * 60;
  const ticks: number[] = [];
  for (let tick = 0; tick < durationSeconds; tick += stepSeconds) ticks.push(tick);
  if (ticks.at(-1) !== durationSeconds) ticks.push(durationSeconds);
  return ticks;
}

/** Use readable whole-kilometre ticks, with roughly fifteen intervals at most. */
export function distanceAxisStepMeters(spanMeters: number) {
  const spanKm = Math.max(0, spanMeters) / 1000;
  if (spanKm <= 15) return 1000;
  const targetKm = Math.max(2, Math.ceil(spanKm / 15));
  const magnitude = 10 ** Math.floor(Math.log10(targetKm));
  const normalized = targetKm / magnitude;
  const niceStepKm = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceStepKm * magnitude * 1000;
}

/** Tick coordinates are integer-kilometre multiples in the recorded-distance domain. */
export function distanceAxisTicks(minMeters: number, maxMeters: number) {
  if (!Number.isFinite(minMeters) || !Number.isFinite(maxMeters) || maxMeters < minMeters) return [];
  const step = distanceAxisStepMeters(maxMeters - minMeters);
  const firstIndex = Math.ceil(minMeters / step);
  const lastIndex = Math.floor(maxMeters / step);
  return Array.from({ length: Math.max(0, lastIndex - firstIndex + 1) }, (_, index) =>
    (firstIndex + index) * step);
}

/** Development-only marks let browser regressions count actual expensive work. */
export function markChartWork(work: string) {
  if (process.env.NODE_ENV === "development" && typeof performance !== "undefined") {
    performance.mark(`activity-chart:${work}`);
  }
}

export function chartExtent(points: readonly ChartPoint[], metric: ChartMetric) {
  let min = Infinity, max = -Infinity;
  for (const point of points) {
    const value = point[metric];
    if (value !== null) { min = Math.min(min, value); max = Math.max(max, value); }
  }
  return min === Infinity ? null : { min, max };
}

/** Validate recorded distance for the readout, including samples omitted for display. */
export function hasRecordedDistance(stream: Pick<ActivityStreams, "time" | "distance">) {
  const { time, distance } = stream;
  const first = distance?.[0], last = distance?.at(-1);
  return time.length > 1 && distance?.length === time.length
    && time.every((t, i) => Number.isFinite(t) && t >= 0 && (i === 0 || t > time[i - 1]))
    && distance.every((d, i) => {
      const previous = distance[i - 1];
      return d !== null && Number.isFinite(d) && d >= 0
        && (i === 0 || (previous !== null && d >= previous));
    })
    && first != null && last != null && last > first;
}

/** Display-only smoothing/downsampling. Raw streams still feed all computed metrics. */
export function activityChartPoints(stream: ActivityStreams): ChartPoint[] {
  const points: ChartPoint[] = [];
  const distanceAvailable = hasRecordedDistance(stream);
  const hrs = smoothSeries(stream.time, stream.time.map((_, i) => stream.heartrate?.[i] ?? null));
  const speeds = smoothSeries(stream.time, stream.time.map((_, i) =>
    recordedPace(stream.velocity_smooth?.[i]) === null ? null : stream.velocity_smooth?.[i] ?? null));
  const stride = Math.max(1, Math.ceil(stream.time.length / 600));
  let gap = false, hrMissing = false, speedMissing = false, altitudeMissing = false;
  for (let i = 0; i < stream.time.length; i++) {
    gap ||= i > 0 && stream.time[i] - stream.time[i - 1] > 15;
    hrMissing ||= stream.heartrate?.[i] == null;
    speedMissing ||= recordedPace(stream.velocity_smooth?.[i]) === null;
    altitudeMissing ||= stream.altitude?.[i] == null;
    if (i % stride === 0 || i === stream.time.length - 1) {
      points.push({
        time: stream.time[i], distance: distanceAvailable ? stream.distance?.[i] ?? null : null,
        hr: hrMissing ? null : hrs[i], pace: speedMissing ? null : recordedPace(speeds[i]),
        altitude: altitudeMissing ? null : stream.altitude?.[i] ?? null, gap,
      });
      gap = false; hrMissing = false; speedMissing = false; altitudeMissing = false;
    }
  }
  return points;
}

/** Explicit null separators prevent both lines and fills from bridging recording gaps. */
export function chartRows(points: readonly ChartPoint[]): ChartRow[] {
  return points.flatMap((point, index) => {
    const previous = points[index - 1];
    return point.gap && previous ? [{
      time: (previous.time + point.time) / 2,
      distance: previous.distance !== null && point.distance !== null
        ? (previous.distance + point.distance) / 2 : null,
      hr: null, pace: null, altitude: null, gap: true, separator: true,
    }, point] : [point];
  });
}
