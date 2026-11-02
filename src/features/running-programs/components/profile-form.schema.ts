import { z } from "zod";
import type { Locale } from "@/features/i18n/locales";
import type { Messages } from "@/features/i18n/messages/en";
import { averageEasyPaceSecondsPerKm, calculateVdot, DISTANCES, isSupportedPerformance } from "../domain";

export function createProfileFormSchema(messages: Messages["validation"], locale: Locale) {
  const { fields } = messages;
  return z.object({
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
        context.addIssue({ code: "custom", path: [path], message: messages.wholeNumber(label) });
        return undefined;
      }
      const number = Number(value);
      if (number < minimum || (maximum !== null && number > maximum)) {
        context.addIssue({
          code: "custom",
          path: [path],
          message: maximum === null
            ? messages.wholeNumberMin(label, minimum.toLocaleString(locale))
            : messages.wholeNumberRange(label, minimum.toLocaleString(locale), maximum.toLocaleString(locale)),
        });
        return undefined;
      }
      return number;
    };

    const presetDistance = values.customDistance
      ? undefined
      : DISTANCES.find((item) => String(item.meters) === values.distanceMeters)?.meters;
    const distance = presetDistance
      ?? wholeNumber(values.distanceMeters, "distanceMeters", fields.distance, 1500, 42195, true);
    const hours = distance !== undefined && distance > 5000
      ? wholeNumber(values.hours, "hours", fields.hours, 0, 8, false) ?? 0
      : 0;
    const minutes = wholeNumber(values.minutes, "minutes", fields.minutes, 0, 59, false) ?? 0;
    const seconds = wholeNumber(values.seconds, "seconds", fields.seconds, 0, 59, false) ?? 0;
    const raceSeconds = hours * 3600 + minutes * 60 + seconds;
    const raceTimeValid = raceSeconds >= 180 && raceSeconds <= 28800;
    if (!raceTimeValid) {
      context.addIssue({
        code: "custom",
        path: ["minutes"],
        message: messages.raceTimeRange,
      });
    }

    let vdot: number | undefined;
    if (distance !== undefined && raceTimeValid) {
      if (!isSupportedPerformance(distance, raceSeconds)) {
        context.addIssue({ code: "custom", path: ["distanceMeters"], message: messages.unsupportedPerformance });
      } else {
        vdot = calculateVdot(distance, raceSeconds);
      }
    }

    let weeklyDistance: number | null = null;
    let weeklyDuration: number | null = null;
    if (values.weeklyTargetMode === "distance") {
      weeklyDistance = wholeNumber(values.recentWeeklyVolume, "recentWeeklyVolume", fields.weeklyDistance, 1, null, true) ?? null;
    } else if (values.weeklyTargetMode === "time") {
      const weeklyHours = values.weeklyHours === ""
        ? 0
        : wholeNumber(values.weeklyHours, "weeklyHours", fields.weeklyHours, 0, 168, false);
      const weeklyMinutes = wholeNumber(values.weeklyMinutes, "weeklyMinutes", fields.weeklyMinutes, 0, 59, false) ?? 0;
      if (weeklyHours !== undefined) {
        weeklyDuration = weeklyHours * 60 + weeklyMinutes;
        if (weeklyDuration === 0) {
          context.addIssue({ code: "custom", path: ["weeklyHours"], message: messages.weeklyTimePositive });
        }
      }
    }

    const parsedRunCount = values.scheduleMode === "count"
      ? wholeNumber(values.scheduleCount, "scheduleCount", fields.runsPerWeek, 1, 7, true)
      : values.scheduleDays.length;
    const runCount = parsedRunCount ?? 0;
    const validRunCount = runCount >= 1 && runCount <= 7;
    if (values.scheduleMode === "days" &&
      (!validRunCount || new Set(values.scheduleDays).size !== runCount ||
        values.scheduleDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) {
      context.addIssue({ code: "custom", path: ["scheduleDays"], message: messages.chooseWeekday });
    }

    if (validRunCount && weeklyDistance !== null && vdot !== undefined &&
      Math.round(weeklyDistance * averageEasyPaceSecondsPerKm(vdot) / 600) * 10 < runCount * 10) {
      context.addIssue({
        code: "custom",
        path: ["recentWeeklyVolume"],
        message: messages.weeklyDistanceTooLow,
      });
    }
    if (validRunCount && weeklyDuration !== null && weeklyDuration < runCount * 10) {
      context.addIssue({
        code: "custom",
        path: ["weeklyHours"],
        message: messages.weeklyTimeTooLow,
      });
    }
  });
}

export type ProfileFormValues = z.infer<ReturnType<typeof createProfileFormSchema>>;
