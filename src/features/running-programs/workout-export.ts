import type { Locale } from "@/features/i18n/locales";
import { weekdayName } from "@/features/i18n/locales";
import { MESSAGES } from "@/features/i18n/messages";
import { workoutLabelKey, workoutSessionPlan, weekWorkoutSessionPlan } from "./domain";
import type { WorkoutSessionStep } from "./domain";
import type { TrainingWeek, Workout } from "./types";

/** Timed steps used when exporting a run to a watch or Garmin Connect. */
export function workoutExportSteps(workout: Workout, vdot: number, week?: TrainingWeek): WorkoutSessionStep[] {
  const type = workout.type ?? "easy";
  if (type === "easy") {
    return [{ kind: "easyRun", durationMinutes: workout.durationMinutes, intensity: "active", paceFractions: [0.59, 0.74] }];
  }
  if (type === "long") {
    return [{ kind: "longRun", durationMinutes: workout.durationMinutes, intensity: "active", paceFractions: [0.59, 0.74] }];
  }
  const plan = week ? weekWorkoutSessionPlan(week, workout) : workoutSessionPlan(
    type,
    vdot,
    workout.durationMinutes,
    workout.intensityAdjustment ?? (workout.intensityIncreased ? 1 : workout.intensityDecreased ? -1 : 0),
  );
  return plan?.steps ?? [{ kind: "easyRun", durationMinutes: workout.durationMinutes, intensity: "active" }];
}

// Garmin watch fonts don't render characters such as "₂", so watch text is limited to ASCII.
const TRANSLITERATIONS: Record<string, string> = { ł: "l", Ł: "L", ß: "ss", œ: "oe", Œ: "OE", æ: "ae", Æ: "AE" };

export function watchText(text: string): string {
  return text
    .replace(/[łŁßœŒæÆ]/g, (char) => TRANSLITERATIONS[char])
    .normalize("NFKD")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

// Cyrillic cannot be transliterated reliably for watch fonts.
export function watchLocale(locale: Locale): Locale {
  return locale === "ru" || locale === "uk" || locale === "be" ? "en" : locale;
}

export function watchStepName(step: WorkoutSessionStep, displayLocale: Locale): string {
  const t = MESSAGES[watchLocale(displayLocale)];
  return watchText(step.fullRecovery ? t.week.fullRecovery : t.steps[step.kind]);
}

export function watchWorkoutName(workout: Workout, displayLocale: Locale): string {
  const locale = watchLocale(displayLocale);
  const weekday = weekdayName(locale, workout.day, "short").replace(/\.$/, "");
  return watchText(`${weekday} ${MESSAGES[locale].workoutsShort[workoutLabelKey(workout.type ?? "easy")]}`);
}
