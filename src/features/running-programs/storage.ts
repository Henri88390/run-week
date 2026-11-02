import { addDays, averageEasyPaceSecondsPerKm, mondayOf, validateProfile } from "./domain";
import type { PlannerState, PreferredDays, Profile, TrainingWeek, Workout } from "./types";

export const STORAGE_KEY = "run-week.planner.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProfile(value: unknown): value is Profile {
  if (!isRecord(value) || !isRecord(value.schedule)) return false;
  const schedule = value.schedule;
  if (schedule.mode === "days") {
    if (!Array.isArray(schedule.days) || !schedule.days.every((day: unknown) => typeof day === "number")) return false;
  } else if (schedule.mode !== "count" || typeof schedule.count !== "number") return false;
  if (typeof value.distanceMeters !== "number" || typeof value.raceSeconds !== "number"
    || typeof value.vdot !== "number" || typeof value.goalDistanceMeters !== "number"
    || (value.recentWeeklyVolumeKm !== undefined && value.recentWeeklyVolumeKm !== null
      && typeof value.recentWeeklyVolumeKm !== "number")
    || (value.desiredWeeklyDurationMinutes !== undefined && value.desiredWeeklyDurationMinutes !== null
      && typeof value.desiredWeeklyDurationMinutes !== "number")
    || !["none", "maintain", "improve"].includes(String(value.goal))) return false;
  if (value.preferredDays !== undefined && (!isRecord(value.preferredDays)
    || !(["vo2max", "threshold", "long"] as const).every((type) => {
      const day = (value.preferredDays as Record<string, unknown>)[type];
      return day === undefined || day === null || typeof day === "number";
    }))) return false;
  const profile = {
    ...value,
    recentWeeklyVolumeKm: value.recentWeeklyVolumeKm ?? null,
    desiredWeeklyDurationMinutes: value.desiredWeeklyDurationMinutes ?? null,
    preferredDays: normalizePreferredDays(value.preferredDays),
  } as unknown as Profile;
  return validateProfile(profile).length === 0;
}

function normalizePreferredDays(value: unknown): PreferredDays {
  const stored = isRecord(value) ? value : {};
  const day = (type: keyof PreferredDays) => typeof stored[type] === "number" ? stored[type] as number : null;
  return { vo2max: day("vo2max"), threshold: day("threshold"), long: day("long") };
}

function isWeek(value: unknown): value is TrainingWeek {
  if (!isRecord(value) || typeof value.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.startDate)
    || value.id !== value.startDate || typeof value.number !== "number" || !Number.isInteger(value.number) || value.number < 1
    || typeof value.rationale !== "string" || !isProfile(value.profile) || !Array.isArray(value.workouts)
    || (value.targetWeeklyVolumeKm !== undefined && value.targetWeeklyVolumeKm !== null && (typeof value.targetWeeklyVolumeKm !== "number"
      || !Number.isFinite(value.targetWeeklyVolumeKm) || value.targetWeeklyVolumeKm <= 0))
    || value.workouts.length < 1 || value.workouts.length > 7) return false;
  const date = new Date(`${value.startDate}T12:00:00`);
  if (!Number.isFinite(date.getTime()) || mondayOf(date) !== value.startDate) return false;
  const days = new Set<number>();
  return value.workouts.every((workout: unknown) => {
    if (!isRecord(workout) || typeof workout.day !== "number" || !Number.isInteger(workout.day)
      || workout.day < 0 || workout.day > 6 || days.has(workout.day)
      || typeof workout.durationMinutes !== "number" || !Number.isInteger(workout.durationMinutes)
      || workout.durationMinutes < 1
      || (workout.intensityAdjustment !== undefined && (typeof workout.intensityAdjustment !== "number"
        || !Number.isInteger(workout.intensityAdjustment)
        || workout.intensityAdjustment < -2 || workout.intensityAdjustment > 2))
      || (workout.intensityIncreased !== undefined && typeof workout.intensityIncreased !== "boolean")
      || (workout.intensityDecreased !== undefined && typeof workout.intensityDecreased !== "boolean")
      || (workout.type !== undefined && !["easy", "long", "workout", "vo2max", "threshold"].includes(String(workout.type)))) return false;
    days.add(workout.day);
    return true;
  });
}

function inferWeeklyVolume(profile: Profile, workouts: TrainingWeek["workouts"]): number {
  const totalMinutes = workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const easyPaceSecondsPerKm = averageEasyPaceSecondsPerKm(profile.vdot);
  return Math.max(1, Math.round(totalMinutes * 60 / easyPaceSecondsPerKm));
}

function normalizeWeek(week: TrainingWeek): TrainingWeek {
  const inferredVolume = inferWeeklyVolume(week.profile, week.workouts);
  const storedProfileVolume = (week.profile as Profile & { recentWeeklyVolumeKm?: number | null }).recentWeeklyVolumeKm;
  const storedTargetVolume = (week as TrainingWeek & { targetWeeklyVolumeKm?: number | null }).targetWeeklyVolumeKm;
  const workouts = week.workouts.map((storedWorkout) => {
    const workout = { ...storedWorkout };
    delete (workout as Workout & { feedback?: unknown }).feedback;
    return workout;
  });
  return {
    ...week,
    workouts,
    profile: normalizeProfile({
      ...week.profile,
      recentWeeklyVolumeKm: storedProfileVolume === undefined ? inferredVolume : storedProfileVolume,
    }, inferredVolume),
    targetWeeklyVolumeKm: storedTargetVolume === undefined ? inferredVolume : storedTargetVolume,
  };
}

function normalizeProfile(profile: Profile, fallbackVolume: number | null): Profile {
  const recentWeeklyVolumeKm = (profile as Profile & { recentWeeklyVolumeKm?: number | null }).recentWeeklyVolumeKm;
  return {
    ...profile,
    recentWeeklyVolumeKm: recentWeeklyVolumeKm === undefined ? fallbackVolume : recentWeeklyVolumeKm,
    desiredWeeklyDurationMinutes: profile.desiredWeeklyDurationMinutes ?? null,
    preferredDays: normalizePreferredDays(profile.preferredDays),
  };
}

/** Validate untrusted browser data before allowing it into the planner. */
export function parsePlanner(raw: string): PlannerState {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || !isProfile(value.profile)) throw new Error("Unrecognized saved planner.");

  if (value.version === 2) {
    if (!isWeek(value.currentWeek)) throw new Error("Unrecognized saved planner.");
    const currentWeek = normalizeWeek(value.currentWeek);
    return {
      version: 2,
      profile: normalizeProfile(value.profile, currentWeek.profile.recentWeeklyVolumeKm),
      currentWeek,
    };
  }

  if (value.version !== 1 || typeof value.currentWeekId !== "string"
    || !Array.isArray(value.weeks) || !value.weeks.length || !value.weeks.every(isWeek))
    throw new Error("Unrecognized saved planner.");
  const savedWeeks = value.weeks as TrainingWeek[];
  const currentIndex = savedWeeks.findIndex((week) => week.id === value.currentWeekId);
  if (currentIndex < 0 || currentIndex < savedWeeks.length - 2 || savedWeeks[0].number !== 1 ||
    savedWeeks.some((week, index) => index > 0 && (week.startDate !== addDays(savedWeeks[index - 1].startDate, 7)
      || week.number !== savedWeeks[index - 1].number + 1))) throw new Error("Invalid saved week history.");

  const currentWeek = normalizeWeek(savedWeeks[currentIndex]);
  return {
    version: 2,
    profile: normalizeProfile(value.profile, currentWeek.profile.recentWeeklyVolumeKm),
    currentWeek,
  };
}
