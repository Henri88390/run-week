import { calculateVdot, validatePerformance } from "./domain";

type Effort = { id: string; name: string; localDate: string; maximalEffort: boolean; distanceMeters: number; elapsedSeconds: number };

export function bestMaximalPerformance(activities: readonly Effort[]) {
  let best: { id: string; name: string; localDate: string; distanceMeters: number; raceSeconds: number; vdot: number } | null = null;
  for (const activity of activities) {
    if (!activity.maximalEffort || !Number.isFinite(activity.distanceMeters) || !Number.isFinite(activity.elapsedSeconds)) continue;
    const distanceMeters = Math.round(activity.distanceMeters);
    const raceSeconds = Math.round(activity.elapsedSeconds);
    if (validatePerformance(distanceMeters, raceSeconds).length || (distanceMeters <= 5000 && raceSeconds >= 3600)) continue;
    const vdot = calculateVdot(distanceMeters, raceSeconds);
    if (!best || vdot > best.vdot) best = {
      id: activity.id, name: activity.name, localDate: activity.localDate, distanceMeters, raceSeconds, vdot,
    };
  }
  return best;
}
