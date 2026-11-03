import { z } from "zod";
import { addDays, averageEasyPaceSecondsPerKm, DEFAULT_WORKOUT_CHOICES, KEY_WORKOUT_TYPES, mondayOf, validateProfile } from "./domain";
import type { PlannerState, PreferredDays, Profile, TrainingWeek } from "./types";

export const STORAGE_KEY = "run-week.planner.v1";

const storedProfileSchema = z.object({
  distanceMeters: z.number(),
  raceSeconds: z.number(),
  vdot: z.number(),
  goal: z.enum(["none", "maintain", "improve"]),
  goalDistanceMeters: z.number(),
  schedule: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("days"), days: z.array(z.number()) }),
    z.object({ mode: z.literal("count"), count: z.number() }),
  ]),
  recentWeeklyVolumeKm: z.number().nullable().optional(),
  desiredWeeklyDurationMinutes: z.number().nullable().optional(),
  preferredDays: z.object({
    vo2max: z.number().nullable().optional(),
    threshold: z.number().nullable().optional(),
    long: z.number().nullable().optional(),
  }).optional(),
  workoutChoices: z.object({
    vo2max: z.enum(KEY_WORKOUT_TYPES),
    threshold: z.enum(KEY_WORKOUT_TYPES),
    long: z.enum(KEY_WORKOUT_TYPES),
  }).optional(),
});

type StoredProfile = z.infer<typeof storedProfileSchema>;

const storedWorkoutSchema = z.object({
  day: z.number().int().min(0).max(6),
  durationMinutes: z.number().int().min(1),
  type: z.enum(["easy", "long", "workout", "vo2max", "threshold", "repetition"]).optional(),
  intensityAdjustment: z.union([
    z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2),
  ]).optional(),
  intensityIncreased: z.boolean().optional(),
  intensityDecreased: z.boolean().optional(),
});

const storedWeekSchema = z.object({
  id: z.string(),
  number: z.number().int().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  profile: storedProfileSchema,
  workouts: z.array(storedWorkoutSchema).min(1).max(7),
  targetWeeklyVolumeKm: z.number().finite().positive().nullable().optional(),
  rationale: z.string(),
});

type StoredWeek = Omit<z.infer<typeof storedWeekSchema>, "profile"> & { profile: StoredProfile };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePreferredDays(value: StoredProfile["preferredDays"]): PreferredDays {
  return {
    vo2max: value?.vo2max ?? null,
    threshold: value?.threshold ?? null,
    long: value?.long ?? null,
  };
}

function parseStoredProfile(value: unknown): StoredProfile | null {
  const parsed = storedProfileSchema.safeParse(value);
  if (!parsed.success) return null;

  const profile: Profile = {
    ...parsed.data,
    recentWeeklyVolumeKm: parsed.data.recentWeeklyVolumeKm ?? null,
    desiredWeeklyDurationMinutes: parsed.data.desiredWeeklyDurationMinutes ?? null,
    preferredDays: normalizePreferredDays(parsed.data.preferredDays),
    workoutChoices: { ...DEFAULT_WORKOUT_CHOICES, ...parsed.data.workoutChoices },
  };
  return validateProfile(profile).length === 0 ? parsed.data : null;
}

function parseStoredWeek(value: unknown): StoredWeek | null {
  const parsed = storedWeekSchema.safeParse(value);
  if (!parsed.success) return null;

  const profile = parseStoredProfile(parsed.data.profile);
  if (!profile || parsed.data.id !== parsed.data.startDate) return null;

  const date = new Date(`${parsed.data.startDate}T12:00:00`);
  const days = new Set<number>();
  if (!Number.isFinite(date.getTime()) || mondayOf(date) !== parsed.data.startDate
    || !parsed.data.workouts.every((workout) => {
      if (days.has(workout.day)) return false;
      days.add(workout.day);
      return true;
    })) return null;

  return { ...parsed.data, profile };
}

function inferWeeklyVolume(profile: Profile, workouts: TrainingWeek["workouts"]): number {
  const totalMinutes = workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const easyPaceSecondsPerKm = averageEasyPaceSecondsPerKm(profile.vdot);
  return Math.max(1, Math.round(totalMinutes * 60 / easyPaceSecondsPerKm));
}

function normalizeProfile(profile: StoredProfile, fallbackVolume: number | null): Profile {
  return {
    ...profile,
    recentWeeklyVolumeKm: profile.recentWeeklyVolumeKm === undefined ? fallbackVolume : profile.recentWeeklyVolumeKm,
    desiredWeeklyDurationMinutes: profile.desiredWeeklyDurationMinutes ?? null,
    preferredDays: normalizePreferredDays(profile.preferredDays),
    workoutChoices: { ...DEFAULT_WORKOUT_CHOICES, ...profile.workoutChoices },
  };
}

function normalizeWeek(week: StoredWeek): TrainingWeek {
  const inferredVolume = inferWeeklyVolume(normalizeProfile(week.profile, null), week.workouts);
  const storedProfileVolume = week.profile.recentWeeklyVolumeKm;
  const storedTargetVolume = week.targetWeeklyVolumeKm;
  return {
    ...week,
    profile: normalizeProfile(week.profile, storedProfileVolume === undefined ? inferredVolume : storedProfileVolume),
    targetWeeklyVolumeKm: storedTargetVolume === undefined ? inferredVolume : storedTargetVolume,
  };
}

/** Validate untrusted browser data before allowing it into the planner. */
export function parsePlanner(raw: string): PlannerState {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new Error("Unrecognized saved planner.");

  const profile = parseStoredProfile(value.profile);
  if (!profile) throw new Error("Unrecognized saved planner.");

  if (value.version === 2) {
    const storedWeek = parseStoredWeek(value.currentWeek);
    if (!storedWeek) throw new Error("Unrecognized saved planner.");
    const currentWeek = normalizeWeek(storedWeek);
    return {
      version: 2,
      profile: normalizeProfile(profile, currentWeek.profile.recentWeeklyVolumeKm),
      currentWeek,
    };
  }

  if (value.version !== 1 || typeof value.currentWeekId !== "string"
    || !Array.isArray(value.weeks) || !value.weeks.length)
    throw new Error("Unrecognized saved planner.");

  const parsedWeeks = value.weeks.map(parseStoredWeek);
  if (parsedWeeks.some((week) => week === null)) throw new Error("Unrecognized saved planner.");
  const savedWeeks = parsedWeeks.filter((week): week is StoredWeek => week !== null);
  const currentIndex = savedWeeks.findIndex((week) => week.id === value.currentWeekId);
  if (currentIndex < 0 || currentIndex < savedWeeks.length - 2 || savedWeeks[0]?.number !== 1
    || savedWeeks.some((week, index) => {
      if (index === 0) return false;
      const previous = savedWeeks[index - 1];
      return previous === undefined || week.startDate !== addDays(previous.startDate, 7)
        || week.number !== previous.number + 1;
    })) throw new Error("Invalid saved week history.");

  const currentWeek = savedWeeks[currentIndex];
  if (!currentWeek) throw new Error("Invalid saved week history.");
  return {
    version: 2,
    profile: normalizeProfile(profile, normalizeWeek(currentWeek).profile.recentWeeklyVolumeKm),
    currentWeek: normalizeWeek(currentWeek),
  };
}
