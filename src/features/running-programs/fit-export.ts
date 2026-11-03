import { Encoder, Profile } from "@garmin/fitsdk";
import type { Encodable, FileIdMesg, WorkoutMesg, WorkoutStepMesg } from "@garmin/fitsdk";
import type { Locale } from "@/features/i18n/locales";
import { weekdayName } from "@/features/i18n/locales";
import { MESSAGES } from "@/features/i18n/use-i18n";
import { stepPaces, WEEKDAYS, workoutLabelKey, weekWorkoutSessionPlan } from "./domain";
import type { WorkoutSessionStep } from "./domain";
import type { TrainingWeek, Workout, WorkoutType } from "./types";

type FitStep = WorkoutSessionStep;

function getFitSteps(workout: Workout, week: TrainingWeek): FitStep[] {
  const type: WorkoutType = workout.type ?? "easy";
  if (type === "easy") {
    throw new Error("Easy runs cannot be exported as FIT workouts.");
  }
  if (type === "long") {
    return [{
      kind: "longRun",
      durationMinutes: workout.durationMinutes,
      intensity: "active",
      paceFractions: [0.59, 0.74],
    }];
  }
  const plan = weekWorkoutSessionPlan(week, workout);
  return plan?.steps ?? [{ kind: "easyRun", durationMinutes: workout.durationMinutes, intensity: "active" }];
}

// Garmin watch fonts don't render characters such as "₂", so FIT text is limited to ASCII.
const TRANSLITERATIONS: Record<string, string> = { ł: "l", Ł: "L", ß: "ss", œ: "oe", Œ: "OE", æ: "ae", Æ: "AE" };

function fitText(text: string): string {
  return text
    .replace(/[łŁßœŒæÆ]/g, (char) => TRANSLITERATIONS[char])
    .normalize("NFKD")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

// Cyrillic cannot be transliterated reliably for watch fonts, so Cyrillic locales fall back to English.
const CYRILLIC_LOCALES: Locale[] = ["ru", "uk", "be"];

function fitLocale(locale: Locale): Locale {
  return CYRILLIC_LOCALES.includes(locale) ? "en" : locale;
}

function workoutStepMessage(step: FitStep, index: number, vdot: number, locale: Locale): Encodable<WorkoutStepMesg> {
  const message: Encodable<WorkoutStepMesg> = {
    mesgNum: Profile.MesgNum.WORKOUT_STEP,
    messageIndex: index,
    wktStepName: fitText(step.fullRecovery ? MESSAGES[locale].week.fullRecovery : MESSAGES[locale].steps[step.kind]),
    durationType: step.distanceMeters !== undefined ? "distance" : "time",
    durationValue: step.distanceMeters !== undefined ? step.distanceMeters * 100 : Math.round(step.durationMinutes * 60 * 1000),
    targetType: "open",
    targetValue: 0,
    intensity: step.intensity,
  };
  const paces = stepPaces(step, vdot);
  if (paces) {
    const [slow, fast] = paces;
    message.targetType = "speed";
    message.customTargetValueLow = Math.round(1_000_000 / slow);
    message.customTargetValueHigh = Math.round(1_000_000 / fast);
  }
  return message;
}

export function createWorkoutFit(week: TrainingWeek, workout: Workout, displayLocale: Locale): Uint8Array {
  const locale = fitLocale(displayLocale);
  const type = workout.type ?? "easy";
  const steps = getFitSteps(workout, week);
  const weekday = weekdayName(locale, workout.day, "short").replace(/\.$/, "");
  const name = fitText(`${weekday} ${MESSAGES[locale].workoutsShort[workoutLabelKey(type)]}`);
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
