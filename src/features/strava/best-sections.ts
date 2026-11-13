import type { ActivityStreams } from "./types";

export const PERFORMANCE_DISTANCES = [100, 200, 400, 1000, 1500, 3000, 5000, 10000, 21097.5, 42195] as const;
export type SectionEffort = { seconds: number; startSeconds: number; endSeconds: number };
export type RankedSection = SectionEffort & { activityId: string; name: string; localDate: string };
type Sample = { time: number; distance: number };

/**
 * Minimise elapsed duration over the piecewise-linear cumulative distance curve.
 * A minimum has a start OR end on a recorded vertex (including plateau edges).
 * Check both families in linear time; never integrate smoothed speed or use a
 * summary pace. Flat distance intervals retain all their elapsed time.
 */
function fastest(samples: readonly Sample[], meters: number): SectionEffort | null {
  let best: SectionEffort | null = null;
  const consider = (startSeconds: number, endSeconds: number) => {
    const seconds = endSeconds - startSeconds;
    if (seconds > 0 && (!best || seconds < best.seconds || (seconds === best.seconds && startSeconds < best.startSeconds)))
      best = { seconds, startSeconds, endSeconds };
  };
  let end = 0;
  for (const start of samples) {
    const target = start.distance + meters;
    while (end < samples.length && samples[end].distance < target) end++;
    if (end === samples.length) break;
    const right = samples[end];
    const left = samples[end - 1];
    const endTime = right.distance === target ? right.time
      : left.time + (target - left.distance) / (right.distance - left.distance) * (right.time - left.time);
    consider(start.time, endTime);
  }
  let start = 0;
  for (const end of samples) {
    const target = end.distance - meters;
    if (target < samples[0].distance) continue;
    // Latest departure at a plateau; the first pass uses earliest arrival.
    while (start + 1 < samples.length && samples[start + 1].distance <= target) start++;
    const left = samples[start];
    const right = samples[start + 1];
    const startTime = left.distance === target ? left.time
      : left.time + (target - left.distance) / (right.distance - left.distance) * (right.time - left.time);
    consider(startTime, end.time);
  }
  return best;
}

export function bestSections(stream: Pick<ActivityStreams, "time" | "distance"> | null) {
  const empty = () => ({ efforts: PERFORMANCE_DISTANCES.map(() => null as SectionEffort | null), incomplete: true });
  if (!stream?.distance || stream.time.length < 2 || stream.distance.length !== stream.time.length) return empty();
  const runs: Sample[][] = [];
  let run: Sample[] = [];
  let previousDistance: number | null = null;
  let incomplete = false;
  for (let i = 0; i < stream.time.length; i++) {
    const time = stream.time[i];
    const distance = stream.distance[i];
    // Do not repair resets, reversed clocks or impossible instantaneous movement.
    if (!Number.isFinite(time) || time < 0 || (i > 0 && time <= stream.time[i - 1])) return empty();
    if (distance === null || !Number.isFinite(distance) || distance < 0) {
      if (run.length > 1) runs.push(run);
      run = [];
      incomplete = true;
      continue;
    }
    if (previousDistance !== null && distance < previousDistance) return empty();
    previousDistance = distance;
    run.push({ time, distance });
  }
  if (run.length > 1) runs.push(run);
  if (!runs.some((samples) => samples.at(-1)?.distance !== samples[0].distance)) return empty();
  return {
    incomplete,
    efforts: PERFORMANCE_DISTANCES.map((meters) => {
      let best: SectionEffort | null = null;
      for (const samples of runs) {
        const effort = fastest(samples, meters);
        if (effort && (!best || effort.seconds < best.seconds
          || (effort.seconds === best.seconds && effort.startSeconds < best.startSeconds))) best = effort;
      }
      return best;
    }),
  };
}

/** Stable ties: elapsed time, activity date, then opaque internal activity ID. */
export function insertRankedSection(top: RankedSection[], result: RankedSection) {
  const previous = top.findIndex((entry) => entry.activityId === result.activityId);
  if (previous >= 0) {
    if (top[previous].seconds <= result.seconds) return;
    top.splice(previous, 1);
  }
  top.push(result);
  top.sort((a, b) => a.seconds - b.seconds || a.localDate.localeCompare(b.localDate) || a.activityId.localeCompare(b.activityId));
  top.splice(5);
}

/** Rounded to tenths for display only; ranking retains the interpolated duration. */
export function sectionDuration(seconds: number) {
  const tenths = Math.round(seconds * 10);
  const hours = Math.floor(tenths / 36000);
  const minutes = Math.floor(tenths / 600) % 60;
  const remainder = `${Math.floor(tenths / 10) % 60}`.padStart(2, "0");
  return `${hours ? `${hours}:${`${minutes}`.padStart(2, "0")}` : minutes}:${remainder}.${tenths % 10}`;
}
