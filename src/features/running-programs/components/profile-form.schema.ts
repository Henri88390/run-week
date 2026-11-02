import { z } from "zod";
import { averageEasyPaceSecondsPerKm, calculateVdot, validatePerformance } from "../domain";

export const profileFormSchema = z.object({
  distanceMeters: z.string(),
  customDistance: z.boolean(),
  hours: z.string(),
  minutes: z.string(),
  seconds: z.string(),
  weeklyTargetMode: z.enum(["distance", "time", "unspecified"]),
  recentWeeklyVolume: z.string(),
  weeklyHours: z.string(),
  weeklyMinutes: z.string(),
  scheduleMode: z.enum(["days", "count"]),
  scheduleDays: z.array(z.number()),
  scheduleCount: z.string(),
}).superRefine((values, context) => {
  const wholeNumber = (
    value: string,
    path: string,
    label: string,
    minimum: number,
    maximum: number | null,
    required: boolean,
  ): number | undefined => {
    if (value === "" && !required) return undefined;
    if (!/^\d+$/.test(value)) {
      context.addIssue({ code: "custom", path: [path], message: `${label}: enter a whole number.` });
      return undefined;
    }
    const number = Number(value);
    if (number < minimum || (maximum !== null && number > maximum)) {
      context.addIssue({
        code: "custom",
        path: [path],
        message: maximum === null
          ? `${label}: enter a whole number of at least ${minimum.toLocaleString("en-GB")}.`
          : `${label}: enter a whole number from ${minimum.toLocaleString("en-GB")} to ${maximum.toLocaleString("en-GB")}.`,
      });
      return undefined;
    }
    return number;
  };

  const distance = wholeNumber(values.distanceMeters, "distanceMeters", "Distance", 1500, 42195, true);
  const hours = distance !== undefined && distance > 5000
    ? wholeNumber(values.hours, "hours", "Hours", 0, 8, false) ?? 0
    : 0;
  const minutes = wholeNumber(values.minutes, "minutes", "Minutes", 0, 59, false) ?? 0;
  const seconds = wholeNumber(values.seconds, "seconds", "Seconds", 0, 59, false) ?? 0;
  const raceSeconds = hours * 3600 + minutes * 60 + seconds;
  const raceTimeValid = raceSeconds >= 180 && raceSeconds <= 28800;
  if (!raceTimeValid) {
    context.addIssue({
      code: "custom",
      path: ["minutes"],
      message: "Race time must be between 3 minutes and 8 hours.",
    });
  }

  let vdot: number | undefined;
  if (distance !== undefined && raceTimeValid) {
    const supportedEstimateError = validatePerformance(distance, raceSeconds)
      .find((error) => error.includes("supported estimate range"));
    if (supportedEstimateError) {
      context.addIssue({ code: "custom", path: ["distanceMeters"], message: supportedEstimateError });
    } else {
      vdot = calculateVdot(distance, raceSeconds);
    }
  }

  let weeklyDistance: number | null = null;
  let weeklyDuration: number | null = null;
  if (values.weeklyTargetMode === "distance") {
    weeklyDistance = wholeNumber(values.recentWeeklyVolume, "recentWeeklyVolume", "Desired weekly distance", 1, null, true) ?? null;
  } else if (values.weeklyTargetMode === "time") {
    const weeklyHours = values.weeklyHours === ""
      ? 0
      : wholeNumber(values.weeklyHours, "weeklyHours", "Weekly hours", 0, 168, false);
    const weeklyMinutes = wholeNumber(values.weeklyMinutes, "weeklyMinutes", "Weekly minutes", 0, 59, false) ?? 0;
    if (weeklyHours !== undefined) {
      weeklyDuration = weeklyHours * 60 + weeklyMinutes;
      if (weeklyDuration === 0) {
        context.addIssue({ code: "custom", path: ["weeklyHours"], message: "Desired weekly time must be greater than 0." });
      }
    }
  }

  const parsedRunCount = values.scheduleMode === "count"
    ? wholeNumber(values.scheduleCount, "scheduleCount", "Runs per week", 1, 7, true)
    : values.scheduleDays.length;
  const runCount = parsedRunCount ?? 0;
  const validRunCount = runCount >= 1 && runCount <= 7;
  if (values.scheduleMode === "days" &&
    (!validRunCount || new Set(values.scheduleDays).size !== runCount ||
      values.scheduleDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) {
    context.addIssue({ code: "custom", path: ["scheduleDays"], message: "Choose at least one valid weekday." });
  }

  if (validRunCount && weeklyDistance !== null && vdot !== undefined &&
    Math.round(weeklyDistance * averageEasyPaceSecondsPerKm(vdot) / 600) * 10 < runCount * 10) {
    context.addIssue({
      code: "custom",
      path: ["recentWeeklyVolume"],
      message: "Desired weekly distance is too low to assign at least 10 minutes to each scheduled run.",
    });
  }
  if (validRunCount && weeklyDuration !== null && weeklyDuration < runCount * 10) {
    context.addIssue({
      code: "custom",
      path: ["weeklyHours"],
      message: "Desired weekly time must allow at least 10 minutes for each scheduled run.",
    });
  }
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
