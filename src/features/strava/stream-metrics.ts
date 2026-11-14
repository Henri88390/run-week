import type { ActivityStreams } from "./types";

export const HR_DURATIONS = [10, 60, 300, 600, 1800, 3600, 5400, 7200] as const;
export type HrEffort = { bpm: number; startSeconds: number; endSeconds: number };
export type RankedHr = HrEffort & { activityId: string; name: string; localDate: string };
export type KilometreSplit = {
  number: number; meters: number; startSeconds: number | null; endSeconds: number | null;
  pace: number | null; averageHr: number | null; maxHr: number | null;
};
type Stream = Pick<ActivityStreams, "time" | "heartrate" | "distance">;

function validClock(time: readonly number[]) {
  return time.every((t, i) => Number.isFinite(t) && t >= 0 && (i === 0 || t > time[i - 1]));
}
function validHr(hr: number | null | undefined): hr is number {
  return hr != null && Number.isFinite(hr) && hr >= 30 && hr <= 240;
}
function lowerBound(time: readonly number[], target: number) {
  let lo = 0, hi = time.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (time[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Same left-sample hold and 15s maximum interval as heartRateTimes.
 * Require valid HR at BOTH ends: a missing endpoint cannot be bridged.
 * Prefix integrals retain stopped time; no smoothing or moving-time filter.
 */
function hrIntegral(stream: Stream) {
  const { time, heartrate } = stream;
  const area = [0], bad = [0];
  for (let i = 0; i + 1 < time.length; i++) {
    const hr = heartrate?.[i];
    const dt = time[i + 1] - time[i];
    const valid = validHr(hr) && validHr(heartrate?.[i + 1]) && dt <= 15;
    area.push(area[i] + (valid ? hr * dt : 0));
    bad.push(bad[i] + (valid ? 0 : 1));
  }
  const average = (start: number, end: number, first: number, last: number) => {
    if (end <= start || first < 0 || last >= time.length - 1 || bad[last + 1] !== bad[first]) return null;
    const leftHr = heartrate?.[first], rightHr = heartrate?.[last];
    if (!validHr(leftHr) || !validHr(rightHr)) return null;
    // Floating subtraction can stray just outside the valid input range.
    return Math.max(30, Math.min(240, (area[last] + rightHr * (end - time[last])
      - area[first] - leftHr * (start - time[first])) / (end - start)));
  };
  return {
    average,
    between(start: number, end: number) {
      if (start < time[0] || end > time[time.length - 1]) return null;
      const startIndex = lowerBound(time, start);
      return average(start, end, time[startIndex] === start ? startIndex : startIndex - 1,
        lowerBound(time, end) - 1);
    },
  };
}

/** Stable ties retain distinct samples/windows, including the same activity. */
export function insertRankedHr<T extends HrEffort & { localDate?: string; activityId?: string }>(top: T[], result: T) {
  const compare = (a: T, b: T) => b.bpm - a.bpm
    || (a.localDate ?? "").localeCompare(b.localDate ?? "")
    || (a.activityId ?? "").localeCompare(b.activityId ?? "")
    || a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds;
  if (top.length === 5 && compare(result, top[4]) >= 0) return;
  if (top.some((r) => r.activityId === result.activityId && r.startSeconds === result.startSeconds
    && r.endSeconds === result.endSeconds)) return;
  top.push(result);
  top.sort(compare);
  top.splice(5);
}

/** Finite candidate rule: start at EACH recorded timestamp, never shifted starts. */
export function heartRateRecords(stream: Stream | null) {
  const peak: HrEffort[] = [];
  const windows = HR_DURATIONS.map((seconds) => ({ seconds, results: [] as HrEffort[] }));
  if (!stream || !validClock(stream.time)) return { peak, windows };
  const { time, heartrate } = stream;
  time.forEach((t, i) => {
    const bpm = heartrate?.[i];
    if (validHr(bpm)) insertRankedHr(peak, { bpm, startSeconds: t, endSeconds: t });
  });
  const integral = hrIntegral(stream);
  for (const window of windows) {
    let end = 0;
    for (let start = 0; start < time.length; start++) {
      const finish = time[start] + window.seconds;
      while (end < time.length && time[end] < finish) end++;
      if (end === time.length) break;
      const bpm = integral.average(time[start], finish, start, end - 1);
      if (bpm !== null) insertRankedHr(window.results, { bpm, startSeconds: time[start], endSeconds: finish });
    }
  }
  return { peak, windows };
}

/** Fixed cumulative kilometres, not fastest sections. Boundary stops belong to the next split. */
export function kilometreSplits(stream: Stream | null): KilometreSplit[] {
  if (!stream?.distance || stream.time.length < 2 || !validClock(stream.time)
    || stream.distance.length !== stream.time.length) return [];
  const { time, distance } = stream;
  let previous = -1;
  for (const d of distance) {
    if (d === null) continue;
    if (!Number.isFinite(d) || d < 0 || d < previous) return [];
    previous = d;
  }
  const total = distance.at(-1);
  // Bound malformed/unreasonable recordings without creating an unbounded table.
  if (total == null || total <= 0 || total > 1_000_000) return [];
  const integral = hrIntegral(stream);
  let cursor = 0;
  const boundary = (meters: number): number | null => {
    // Activity elapsed time establishes the start even if its first distance
    // reading is already positive. A late or missing first sample cannot.
    if (meters === 0 && time[0] === 0 && distance[0] !== null && distance[0] < 1000) return 0;
    while (cursor < distance.length && (distance[cursor] === null || (distance[cursor] ?? 0) < meters)) cursor++;
    const right = distance[cursor];
    if (right == null) return null;
    if (right === meters) return time[cursor];
    const left = distance[cursor - 1];
    if (left == null || cursor === 0) return null;
    return time[cursor - 1] + (meters - left) / (right - left) * (time[cursor] - time[cursor - 1]);
  };
  const splits: KilometreSplit[] = [];
  let startSeconds = boundary(0), sample = 0;
  for (let start = 0; start < total; start += 1000) {
    const end = Math.min(start + 1000, total);
    // Include the complete final plateau, rather than silently dropping a final stop.
    const endSeconds = end === total ? time[time.length - 1] : boundary(end);
    let missingDistance = startSeconds === null || endSeconds === null;
    let maxHr: number | null = null;
    if (startSeconds !== null && endSeconds !== null) {
      while (sample < time.length && time[sample] < startSeconds) sample++;
      let i = sample;
      while (i < time.length && time[i] <= endSeconds) {
        if (distance[i] === null) missingDistance = true;
        const hr = stream.heartrate?.[i];
        if (validHr(hr)) maxHr = Math.max(maxHr ?? hr, hr);
        i++;
      }
      // Check distance intervals intersecting interpolated boundaries too.
      const startIndex = lowerBound(time, startSeconds);
      const first = Math.max(0, time[startIndex] === startSeconds ? startIndex : startIndex - 1);
      const last = lowerBound(time, endSeconds);
      for (let j = first; j <= last; j++) if (distance[j] === null) missingDistance = true;
    }
    const seconds = startSeconds !== null && endSeconds !== null ? endSeconds - startSeconds : 0;
    splits.push({
      number: splits.length + 1, meters: end - start, startSeconds, endSeconds,
      pace: !missingDistance && seconds > 0 ? seconds * 1000 / (end - start) : null,
      averageHr: !missingDistance && startSeconds !== null && endSeconds !== null
        ? integral.between(startSeconds, endSeconds) : null,
      maxHr: missingDistance ? null : maxHr,
    });
    startSeconds = endSeconds;
  }
  return splits;
}
