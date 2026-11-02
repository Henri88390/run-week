export type Goal = "none" | "maintain" | "improve";
export type Schedule =
  | { mode: "days"; days: number[] }
  | { mode: "count"; count: number };

/** Optional weekday (0 = Monday) for each key session; ignored when the session is not scheduled. */
export type PreferredDays = {
  vo2max: number | null;
  threshold: number | null;
  long: number | null;
};

export type Profile = {
  distanceMeters: number;
  raceSeconds: number;
  vdot: number;
  goal: Goal;
  goalDistanceMeters: number;
  schedule: Schedule;
  recentWeeklyVolumeKm: number | null;
  desiredWeeklyDurationMinutes: number | null;
  preferredDays: PreferredDays;
};

export type WorkoutType = "easy" | "long" | "workout" | "vo2max" | "threshold";
export type AdjustmentLevel = -2 | -1 | 0 | 1 | 2;

export type Workout = {
  day: number;
  durationMinutes: number;
  type?: WorkoutType;
  intensityAdjustment?: AdjustmentLevel;
  intensityIncreased?: boolean;
  intensityDecreased?: boolean;
};

export type TrainingWeek = {
  id: string;
  number: number;
  startDate: string;
  profile: Profile;
  workouts: Workout[];
  targetWeeklyVolumeKm: number | null;
  rationale: string;
};

export type PlannerState = {
  version: 2;
  profile: Profile;
  currentWeek: TrainingWeek;
};
