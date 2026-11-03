import "server-only";
import type { Locale } from "@/features/i18n/locales";
import { stepPaces } from "@/features/running-programs/domain";
import type { WorkoutSessionStep } from "@/features/running-programs/domain";
import type { Workout } from "@/features/running-programs/types";
import { watchStepName, watchWorkoutName, workoutExportSteps } from "@/features/running-programs/workout-export";

const INTENSITY: Record<WorkoutSessionStep["intensity"], string> = {
  warmup: "WARMUP",
  cooldown: "COOLDOWN",
  recovery: "RECOVERY",
  interval: "ACTIVE",
  active: "ACTIVE",
};

function speedAtPace(pace: number): number {
  return Math.round(1_000_000 / pace) / 1000;
}

/** Garmin Training API V1 (`/training-api/workout`) running workout; steps are top-level and pace targets are speeds in metres per second. */
export function garminWorkoutPayload(workout: Workout, vdot: number, locale: Locale) {
  const steps = workoutExportSteps(workout, vdot).map((step, index) => {
    const paces = stepPaces(step, vdot);
    return {
    type: "WorkoutStep",
    stepOrder: index + 1,
    intensity: INTENSITY[step.intensity],
    description: watchStepName(step, locale),
    durationType: step.distanceMeters !== undefined ? "DISTANCE" : "TIME",
    durationValue: step.distanceMeters ?? step.durationMinutes * 60,
    durationValueType: null,
    targetType: paces ? "PACE" : "OPEN",
    targetValueLow: paces ? speedAtPace(paces[0]) : null,
    targetValueHigh: paces ? speedAtPace(paces[1]) : null,
    targetValueType: null,
    };
  });
  return {
    workoutName: watchWorkoutName(workout, locale),
    description: "Run Week",
    sport: "RUNNING",
    workoutProvider: "Run Week",
    workoutSourceId: "Run Week",
    poolLength: null,
    poolLengthUnit: null,
    steps,
  };
}
