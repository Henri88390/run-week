import type { KilometreSplit } from "./stream-metrics";

export type SplitInterval = {
  number: number; startMeters: number; endMeters: number;
  startSeconds: number | null; endSeconds: number | null;
};

export function toggleSplit(selected: readonly number[], number: number): number[] {
  return selected.includes(number) ? selected.filter((value) => value !== number) : [...selected, number];
}

/** Raw split boundaries retain interpolation, internal stops and the final plateau. */
export function selectedSplitIntervals(splits: readonly KilometreSplit[], selected: readonly number[]): SplitInterval[] {
  let meters = 0;
  return splits.flatMap((split) => {
    const startMeters = meters;
    meters += split.meters;
    return selected.includes(split.number) ? [{
      number: split.number, startMeters, endMeters: meters,
      startSeconds: split.startSeconds, endSeconds: split.endSeconds,
    }] : [];
  });
}

/** Unknown elapsed boundaries must never be replaced with proportional chart time. */
export function splitAxisBounds(interval: Omit<SplitInterval, "number" | "startMeters" | "endMeters"> & {
  startMeters: number | null; endMeters: number | null;
}, axis: "time" | "distance"): [number, number] | null {
  const start = axis === "time" ? interval.startSeconds : interval.startMeters;
  const end = axis === "time" ? interval.endSeconds : interval.endMeters;
  return start !== null && end !== null && end > start ? [start, end] : null;
}
