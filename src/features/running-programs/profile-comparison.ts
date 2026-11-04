import { DEFAULT_WORKOUT_CHOICES, equivalentRaceSeconds } from "./domain";
import type { Profile } from "./types";

export function samePerformance(saved: Profile, entered: Pick<Profile, "distanceMeters" | "raceSeconds">): boolean {
  return saved.distanceMeters === entered.distanceMeters
    ? saved.raceSeconds === entered.raceSeconds
    : entered.raceSeconds === equivalentRaceSeconds(saved.vdot, entered.distanceMeters);
}

export function profilesMatch(a: Profile, b: Profile): boolean {
  const schedulesMatch = a.schedule.mode === b.schedule.mode && (
    a.schedule.mode === "count" && b.schedule.mode === "count"
      ? a.schedule.count === b.schedule.count
      : a.schedule.mode === "days" && b.schedule.mode === "days"
        && [...a.schedule.days].sort().join(",") === [...b.schedule.days].sort().join(",")
  );
  return samePerformance(a, b)
    && a.recentWeeklyVolumeKm === b.recentWeeklyVolumeKm
    && a.desiredWeeklyDurationMinutes === b.desiredWeeklyDurationMinutes
    && a.goal === b.goal
    && a.goalDistanceMeters === b.goalDistanceMeters
    && a.preferredDays.vo2max === b.preferredDays.vo2max
    && a.preferredDays.threshold === b.preferredDays.threshold
    && a.preferredDays.long === b.preferredDays.long
    && (["vo2max", "threshold", "long"] as const).every((slot) =>
      (a.workoutChoices ?? DEFAULT_WORKOUT_CHOICES)[slot] === (b.workoutChoices ?? DEFAULT_WORKOUT_CHOICES)[slot])
    && schedulesMatch;
}
