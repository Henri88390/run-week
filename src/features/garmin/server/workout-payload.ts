import "server-only";
import type { Locale } from "@/features/i18n/locales";
import { paceAtFraction } from "@/features/running-programs/domain";
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

function speedAtFraction(vdot: number, fraction: number): number {
  return Math.round(1000 / paceAtFraction(vdot, fraction) * 1000) / 1000;
}

/** Garmin Training API V2 running workout; pace targets are speeds in metres per second. */
export function garminWorkoutPayload(workout: Workout, vdot: number, locale: Locale) {
  const steps = workoutExportSteps(workout, vdot).map((step, index) => ({
    type: "WorkoutStep",
    stepOrder: index + 1,
    intensity: INTENSITY[step.intensity],
    description: watchStepName(step, locale),
    durationType: "TIME",
    durationValue: step.durationMinutes * 60,
    durationValueType: null,
    targetType: step.paceFractions ? "PACE" : "OPEN",
    targetValueLow: step.paceFractions ? speedAtFraction(vdot, step.paceFractions[0]) : null,
    targetValueHigh: step.paceFractions ? speedAtFraction(vdot, step.paceFractions[1]) : null,
    targetValueType: null,
  }));
  return {
    workoutName: watchWorkoutName(workout, locale),
    description: "Run Week",
    sport: "RUNNING",
    workoutProvider: "Run Week",
    workoutSourceId: "Run Week",
    isSessionTransitionEnabled: false,
    segments: [{ segmentOrder: 1, sport: "RUNNING", poolLength: null, poolLengthUnit: null, steps }],
  };
}
