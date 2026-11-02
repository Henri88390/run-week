export type Goal = "none" | "maintain" | "improve";
export type Schedule =
  | { mode: "days"; days: number[] }
  | { mode: "count"; count: number };

export type Profile = {
  distanceMeters: number;
  raceSeconds: number;
  vdot: number;
  goal: Goal;
  goalDistanceMeters: number;
  schedule: Schedule;
  recentWeeklyVolumeKm: number | null;
};

export type Feedback = {
  readiness?: "ready" | "tired" | "unwell";
  effort?: "easy" | "moderate" | "hard";
  strength?: "strong" | "normal" | "low";
  pace?: "manageable" | "too-fast" | "too-slow";
  outcome?: "completed" | "skipped";
};

export type WorkoutType = "easy" | "long" | "workout" | "vo2max" | "threshold";

export type Workout = {
  day: number;
  durationMinutes: number;
  type?: WorkoutType;
  intensityIncreased?: boolean;
  feedback: Feedback;
};

export type GenerationPreferences = {
  increaseVolume: boolean;
  increaseIntensity: boolean;
  runCountAdjustment: -1 | 0 | 1;
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
  version: 1;
  profile: Profile;
  currentWeekId: string;
  weeks: TrainingWeek[];
};
