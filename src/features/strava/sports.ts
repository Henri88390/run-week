/** Strava's running family; every other sport (including walks/hikes) is cross-training. */
export const RUN_SPORTS = ["Run", "TrailRun", "VirtualRun"];
export const SPORTS_VERSION = 1;
export function isRunning(sport: string) {
  return RUN_SPORTS.includes(sport);
}

export function crossTraining(activities: readonly { sport: string; movingSeconds: number }[]) {
  const sports = new Map<string, number>();
  for (const activity of activities) {
    if (!isRunning(activity.sport))
      sports.set(activity.sport, (sports.get(activity.sport) ?? 0) + activity.movingSeconds);
  }
  return [...sports].sort(([a], [b]) => a.localeCompare(b))
    .map(([sport, seconds]) => ({ sport, seconds }));
}
