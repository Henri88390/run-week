import { Encoder, Profile } from "@garmin/fitsdk";
import type { Encodable, FileIdMesg, WorkoutMesg, WorkoutStepMesg } from "@garmin/fitsdk";
import type { Locale } from "@/features/i18n/locales";
import { paceAtFraction, WEEKDAYS } from "./domain";
import type { WorkoutSessionStep } from "./domain";
import type { TrainingWeek, Workout } from "./types";
import { watchStepName, watchWorkoutName, workoutExportSteps } from "./workout-export";

type FitStep = WorkoutSessionStep;

function workoutStepMessage(step: FitStep, index: number, vdot: number, locale: Locale): Encodable<WorkoutStepMesg> {
  const message: Encodable<WorkoutStepMesg> = {
    mesgNum: Profile.MesgNum.WORKOUT_STEP,
    messageIndex: index,
    wktStepName: watchStepName(step, locale),
    durationType: "time",
    durationValue: step.durationMinutes * 60 * 1000,
    targetType: "open",
    targetValue: 0,
    intensity: step.intensity,
  };
  if (step.paceFractions) {
    const [slowFraction, fastFraction] = step.paceFractions;
    message.targetType = "speed";
    message.customTargetValueLow = Math.round(1_000_000 / paceAtFraction(vdot, slowFraction));
    message.customTargetValueHigh = Math.round(1_000_000 / paceAtFraction(vdot, fastFraction));
  }
  return message;
}

export function createWorkoutFit(week: TrainingWeek, workout: Workout, locale: Locale): Uint8Array {
  if ((workout.type ?? "easy") === "easy") throw new Error("Easy runs cannot be exported as FIT workouts.");
  const steps = workoutExportSteps(workout, week.profile.vdot);
  const name = watchWorkoutName(workout, locale);
  const encoder = new Encoder();
  const fileId: Encodable<FileIdMesg> = {
    mesgNum: Profile.MesgNum.FILE_ID,
    type: "workout",
    manufacturer: 255,
    product: 0,
    timeCreated: new Date(),
    productName: "Run Week",
  };
  const workoutMessage: Encodable<WorkoutMesg> = {
    mesgNum: Profile.MesgNum.WORKOUT,
    messageIndex: 0,
    sport: "running",
    subSport: "generic",
    numValidSteps: steps.length,
    wktName: name,
  };

  encoder.writeMesg(fileId);
  encoder.writeMesg(workoutMessage);
  steps.forEach((step, index) => encoder.writeMesg(workoutStepMessage(step, index, week.profile.vdot, locale)));
  return encoder.close();
}

export function downloadWorkoutFit(week: TrainingWeek, workout: Workout, locale: Locale): void {
  const bytes = createWorkoutFit(week, workout, locale);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/vnd.ant.fit" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `run-week-${week.number}-${WEEKDAYS[workout.day].toLowerCase()}-${workout.type ?? "easy"}.fit`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
