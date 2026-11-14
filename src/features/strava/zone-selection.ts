import { activityZoneIntervals } from "./analytics";
import { hasRecordedDistance } from "./activity-chart-data";
import type { ActivityStreams } from "./types";

/** Serializable classified spans only; no raw streams cross the server/client boundary. */
export type ZoneInterval = {
  zone: number; startSeconds: number; endSeconds: number;
  startMeters: number | null; endMeters: number | null;
};

export function mergeZoneIntervals(intervals: readonly ZoneInterval[]): ZoneInterval[] {
  const merged: ZoneInterval[] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && previous.zone === interval.zone && previous.endSeconds === interval.startSeconds
      && previous.endMeters === interval.startMeters) {
      previous.endSeconds = interval.endSeconds;
      previous.endMeters = interval.endMeters;
    } else merged.push({ ...interval });
  }
  return merged;
}

/** Interpolate only a clipped endpoint inside its actual raw recorded-distance pair. */
export function activityZoneSelectionIntervals(stream: ActivityStreams | null, elapsedSeconds: number): ZoneInterval[] {
  const distanceAvailable = stream !== null && hasRecordedDistance(stream);
  return mergeZoneIntervals(activityZoneIntervals(stream, elapsedSeconds).map(({ sample, ...interval }) => {
    const start = distanceAvailable ? stream?.distance?.[sample] : null;
    const end = distanceAvailable ? stream?.distance?.[sample + 1] : null;
    const startTime = stream?.time[sample], endTime = stream?.time[sample + 1];
    return { ...interval, startMeters: start ?? null,
      endMeters: start != null && end != null && startTime !== undefined && endTime !== undefined
        ? start + (end - start) * (interval.endSeconds - startTime) / (endTime - startTime) : null };
  }));
}

export function selectedZoneIntervals(intervals: readonly ZoneInterval[], selected: readonly number[]): ZoneInterval[] {
  const zones = new Set(selected);
  return intervals.filter((interval) => zones.has(interval.zone));
}
