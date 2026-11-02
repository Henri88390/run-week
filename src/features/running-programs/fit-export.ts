import { Encoder, Profile } from "@garmin/fitsdk";
import type { Encodable, FileIdMesg, WorkoutMesg, WorkoutStepMesg } from "@garmin/fitsdk";
import { paceAtFraction, WEEKDAYS, workoutLabel, workoutSessionPlan } from "./domain";
import type { TrainingWeek, Workout, WorkoutType } from "./types";

type FitStep = {
  name: string;
  durationMinutes: number;
  intensity: "active" | "warmup" | "recovery" | "interval" | "cooldown";
  paceFractions?: [slow: number, fast: number];
};

function getFitSteps(workout: Workout, vdot: number): FitStep[] {
  const type: WorkoutType = workout.type ?? "easy";
  if (type === "easy") {
    throw new Error("Easy runs cannot be exported as FIT workouts.");
  }
  if (type === "long") {
    return [{
      name: "Long run",
      durationMinutes: workout.durationMinutes,
      intensity: "active",
      paceFractions: [0.59, 0.74],
    }];
  }
  const plan = workoutSessionPlan(
    type,
    vdot,
    workout.durationMinutes,
    workout.intensityAdjustment ?? (workout.intensityIncreased ? 1 : workout.intensityDecreased ? -1 : 0),
  );
  return plan?.steps ?? [{ name: "Run", durationMinutes: workout.durationMinutes, intensity: "active" }];
}

// Garmin watch fonts don't render characters such as "₂", so FIT text is limited to ASCII.
function fitText(text: string): string {
  return text.normalize("NFKD").replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, "");
}

function workoutStepMessage(step: FitStep, index: number, vdot: number): Encodable<WorkoutStepMesg> {
  const message: Encodable<WorkoutStepMesg> = {
    mesgNum: Profile.MesgNum.WORKOUT_STEP,
    messageIndex: index,
    wktStepName: fitText(step.name),
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

export function createWorkoutFit(week: TrainingWeek, workout: Workout): Uint8Array {
  const type = workout.type ?? "easy";
  const steps = getFitSteps(workout, week.profile.vdot);
  const weekday = WEEKDAYS[workout.day].slice(0, 3);
  const name = fitText(`${weekday} ${workoutLabel(type).replace(" workout", "")}`);
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
  steps.forEach((step, index) => encoder.writeMesg(workoutStepMessage(step, index, week.profile.vdot)));
  return encoder.close();
}

export function downloadWorkoutFit(week: TrainingWeek, workout: Workout): void {
  const bytes = createWorkoutFit(week, workout);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/vnd.ant.fit" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `run-week-${week.number}-${WEEKDAYS[workout.day].toLowerCase()}-${workout.type ?? "easy"}.fit`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
