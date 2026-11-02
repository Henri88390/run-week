import { addDays, averageEasyPaceSecondsPerKm, mondayOf, validateProfile } from "./domain";
import type { Feedback, PlannerState, Profile, TrainingWeek } from "./types";

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
    || !["none", "maintain", "improve"].includes(String(value.goal))) return false;
  const profile = { ...value, recentWeeklyVolumeKm: value.recentWeeklyVolumeKm ?? null } as unknown as Profile;
  return validateProfile(profile).length === 0;
}

function isFeedback(value: unknown): value is Feedback {
  if (!isRecord(value)) return false;
  const allowed: Record<string, string[]> = {
    readiness: ["ready", "tired", "unwell"],
    effort: ["easy", "moderate", "hard"],
    strength: ["strong", "normal", "low"],
    pace: ["manageable", "too-fast", "too-slow"],
    outcome: ["completed", "skipped"],
  };
  return Object.entries(value).every(([key, entry]) => allowed[key]?.includes(String(entry)));
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
      || (workout.intensityIncreased !== undefined && typeof workout.intensityIncreased !== "boolean")
      || (workout.type !== undefined && !["easy", "long", "workout", "vo2max", "threshold"].includes(String(workout.type)))
      || !isFeedback(workout.feedback)) return false;
    days.add(workout.day);
    return true;
  });
}

function inferWeeklyVolume(profile: Profile, workouts: TrainingWeek["workouts"]): number {
  const totalMinutes = workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const easyPaceSecondsPerKm = averageEasyPaceSecondsPerKm(profile.vdot);
  return Math.max(1, Math.round(totalMinutes * 60 / easyPaceSecondsPerKm));
}

/** Validate untrusted browser data before allowing it into the planner. */
export function parsePlanner(raw: string): PlannerState {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || !isProfile(value.profile)
    || typeof value.currentWeekId !== "string" || !Array.isArray(value.weeks) || !value.weeks.length
    || !value.weeks.every(isWeek)) throw new Error("Unrecognized saved planner.");
  const savedWeeks = value.weeks as TrainingWeek[];
  const current = savedWeeks.findIndex((week) => week.id === value.currentWeekId);
  if (current < 0 || current < savedWeeks.length - 2 || savedWeeks[0].number !== 1 ||
    savedWeeks.some((week, i) => i > 0 && (week.startDate !== addDays(savedWeeks[i - 1].startDate, 7)
      || week.number !== savedWeeks[i - 1].number + 1))) throw new Error("Invalid saved week history.");

  const weeks = savedWeeks.map((week) => {
    const inferredVolume = inferWeeklyVolume(week.profile, week.workouts);
    const profile = {
      ...week.profile,
      recentWeeklyVolumeKm: (week.profile as Profile & { recentWeeklyVolumeKm?: number | null }).recentWeeklyVolumeKm === undefined
        ? inferredVolume : week.profile.recentWeeklyVolumeKm,
    };
    return {
      ...week,
      profile,
      targetWeeklyVolumeKm: (week as TrainingWeek & { targetWeeklyVolumeKm?: number | null }).targetWeeklyVolumeKm === undefined
        ? inferredVolume : week.targetWeeklyVolumeKm,
    };
  });
  const profile = {
    ...value.profile as Profile,
    recentWeeklyVolumeKm: (value.profile as Profile & { recentWeeklyVolumeKm?: number | null }).recentWeeklyVolumeKm === undefined
      ? weeks[current].profile.recentWeeklyVolumeKm : (value.profile as Profile).recentWeeklyVolumeKm,
  };
  return { ...value, profile, weeks } as PlannerState;
}
