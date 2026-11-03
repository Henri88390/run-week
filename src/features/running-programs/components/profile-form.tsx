"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { weekdayName } from "@/features/i18n/locales";
import { useI18n } from "@/features/i18n/use-i18n";
import {
  activePreferredDays, calculateVdot, DEFAULT_WORKOUT_CHOICES, distanceLabel, DISTANCES, equivalentRaceSeconds,
  isSupportedPerformance, KEY_WORKOUT_TYPES, NO_PREFERRED_DAYS,
} from "../domain";
import type { PreferredDays, Profile, Schedule } from "../types";
import { createProfileFormSchema, preferredDaysFromForm, type ProfileFormValues } from "./profile-form.schema";
import { SelectField } from "./select-field";

type PreferredDayField = "preferredVo2maxDay" | "preferredThresholdDay" | "preferredLongRunDay";
type WorkoutChoiceField = "intervalWorkout" | "thresholdWorkout" | "longWorkout";
const PREFERRED_DAY_FIELDS: PreferredDayField[] = ["preferredVo2maxDay", "preferredThresholdDay", "preferredLongRunDay"];

function scheduledPreferredDays(preferredDays: PreferredDays, runCount: number): PreferredDays {
  const scheduled = { ...NO_PREFERRED_DAYS };
  for (const { type, day } of activePreferredDays(preferredDays, runCount)) scheduled[type] = day;
  return scheduled;
}

/** A different distance with the time derived from the saved performance is the same performance. */
function samePerformance(saved: Profile, entered: Pick<Profile, "distanceMeters" | "raceSeconds">): boolean {
  return saved.distanceMeters === entered.distanceMeters
    ? saved.raceSeconds === entered.raceSeconds
    : entered.raceSeconds === equivalentRaceSeconds(saved.vdot, entered.distanceMeters);
}

function profilesMatch(a: Profile, b: Profile): boolean {
  const schedulesMatch = a.schedule.mode === b.schedule.mode && (
    a.schedule.mode === "count" && b.schedule.mode === "count"
      ? a.schedule.count === b.schedule.count
      : a.schedule.mode === "days" && b.schedule.mode === "days"
        && [...a.schedule.days].sort().join(",") === [...b.schedule.days].sort().join(",")
  );
  return samePerformance(a, b)
    && a.recentWeeklyVolumeKm === b.recentWeeklyVolumeKm
    && a.desiredWeeklyDurationMinutes === b.desiredWeeklyDurationMinutes
    && a.goal === b.goal
    && a.goalDistanceMeters === b.goalDistanceMeters
    && a.preferredDays.vo2max === b.preferredDays.vo2max
    && a.preferredDays.threshold === b.preferredDays.threshold
    && a.preferredDays.long === b.preferredDays.long
    && (["vo2max", "threshold", "long"] as const).every((slot) =>
      (a.workoutChoices ?? DEFAULT_WORKOUT_CHOICES)[slot] === (b.workoutChoices ?? DEFAULT_WORKOUT_CHOICES)[slot])
    && schedulesMatch;
}

type Performance = { distanceMeters: number; raceSeconds: number };

function wholeNumber(value: string, max: number): number | null {
  return /^\d+$/.test(value.trim()) && Number(value) <= max ? Number(value) : null;
}

/** Returns the entered performance when it is complete and within the supported range. */
function enteredPerformance(distanceValue: string, hours: string, minutes: string, seconds: string): Performance | null {
  const distanceMeters = Number(distanceValue);
  if (!Number.isFinite(distanceMeters) || distanceMeters < 1500 || distanceMeters > 42195) return null;
  const parts = [distanceMeters > 5000 ? (hours.trim() === "" ? 0 : wholeNumber(hours, 8)) : 0,
    wholeNumber(minutes, 59), wholeNumber(seconds, 59)];
  const [h, m, sec] = parts;
  if (h === null || m === null || sec === null) return null;
  const raceSeconds = h * 3600 + m * 60 + sec;
  return raceSeconds >= 180 && raceSeconds <= 28800 && isSupportedPerformance(distanceMeters, raceSeconds)
    ? { distanceMeters, raceSeconds } : null;
}

function ErrorMessage({ children }: { children?: string }) {
  return children ? <p className="mt-2 text-sm text-red-700" role="alert">{children}</p> : null;
}

function WorkoutTypeHelp({ name, definition }: { name: string; definition: string }) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  return <span className="relative shrink-0" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
    <button type="button" aria-label={name} aria-describedby={open ? tooltipId : undefined}
      className="flex size-8 items-center justify-center rounded text-stone-500 hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)}
      onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); event.stopPropagation(); } }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4M12 16.5h.01" />
      </svg>
    </button>
    {open && <span id={tooltipId} role="tooltip"
      className="absolute right-0 top-full z-50 block w-72 max-w-[calc(100vw-4rem)] rounded-lg border border-stone-200 bg-white p-3 text-sm leading-6 text-stone-700 shadow-lg">
      <span className="mb-1 block font-medium">{name}</span>
      {definition}
    </span>}
  </span>;
}

export function ProfileForm({ profile, onSave }: {
  profile?: Profile;
  onSave: (profile: Profile) => void;
}) {
  const { locale, t } = useI18n();
  const schema = useMemo(() => createProfileFormSchema(t.validation, locale), [t, locale]);
  const defaultSchedule: Schedule = profile?.schedule ?? { mode: "count", count: 3 };
  const { control, register, setValue, getValues, handleSubmit, trigger, formState: { errors, isSubmitted } } = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      distanceMeters: String(profile?.distanceMeters ?? 5000),
      customDistance: !DISTANCES.some((distance) => distance.meters === (profile?.distanceMeters ?? 5000)),
      hours: profile && profile.distanceMeters > 5000 ? String(Math.floor(profile.raceSeconds / 3600)) : "",
      minutes: profile ? String(Math.floor(profile.raceSeconds % 3600 / 60)) : "25",
      seconds: profile ? String(profile.raceSeconds % 60) : "0",
      weeklyTargetMode: profile?.desiredWeeklyDurationMinutes != null ? "time"
        : profile?.recentWeeklyVolumeKm != null ? "distance" : "unspecified",
      recentWeeklyVolume: profile?.recentWeeklyVolumeKm?.toString() ?? "",
      weeklyHours: profile?.desiredWeeklyDurationMinutes != null
        ? String(Math.floor(profile.desiredWeeklyDurationMinutes / 60)) : "",
      weeklyMinutes: profile?.desiredWeeklyDurationMinutes != null
        ? String(profile.desiredWeeklyDurationMinutes % 60) : "",
      scheduleMode: defaultSchedule.mode,
      scheduleDays: defaultSchedule.mode === "days" ? [...defaultSchedule.days] : [1, 3, 5],
      scheduleCount: defaultSchedule.mode === "count" ? String(defaultSchedule.count) : "3",
      preferredVo2maxDay: String(profile?.preferredDays.vo2max ?? ""),
      preferredThresholdDay: String(profile?.preferredDays.threshold ?? ""),
      preferredLongRunDay: String(profile?.preferredDays.long ?? ""),
      intervalWorkout: profile?.workoutChoices?.vo2max ?? "vo2max",
      thresholdWorkout: profile?.workoutChoices?.threshold ?? "threshold",
      longWorkout: profile?.workoutChoices?.long ?? "long",
    },
  });

  const [
    distanceValue,
    customDistance,
    hours,
    minutes,
    seconds,
    weeklyTargetMode,
    recentWeeklyVolume,
    weeklyHours,
    weeklyMinutes,
    scheduleMode,
    scheduleDays,
    scheduleCount,
    preferredVo2maxDay,
    preferredThresholdDay,
    preferredLongRunDay,
    intervalWorkout,
    thresholdWorkout,
    longWorkout,
  ] = useWatch({
    control,
    name: [
      "distanceMeters",
      "customDistance",
      "hours",
      "minutes",
      "seconds",
      "weeklyTargetMode",
      "recentWeeklyVolume",
      "weeklyHours",
      "weeklyMinutes",
      "scheduleMode",
      "scheduleDays",
      "scheduleCount",
      "preferredVo2maxDay",
      "preferredThresholdDay",
      "preferredLongRunDay",
      "intervalWorkout",
      "thresholdWorkout",
      "longWorkout",
    ],
  });

  const distance = Number(distanceValue);
  const usesHours = distance > 5000;
  const raceSeconds = (usesHours ? Number(hours) * 3600 : 0) + Number(minutes) * 60 + Number(seconds);
  const schedule: Schedule = scheduleMode === "days"
    ? { mode: "days", days: scheduleDays }
    : { mode: "count", count: Number(scheduleCount) };
  const runCount = schedule.mode === "days" ? schedule.days.length : schedule.count;
  const preferredDayOptions = schedule.mode === "days"
    ? [...schedule.days].sort((a, b) => a - b)
    : [0, 1, 2, 3, 4, 5, 6];
  const preferredDayInputs: { field: PreferredDayField; workoutField: WorkoutChoiceField; visible: boolean }[] = [
    {
      field: "preferredVo2maxDay",
      workoutField: "intervalWorkout",
      visible: runCount >= 1,
    },
    { field: "preferredThresholdDay", workoutField: "thresholdWorkout", visible: runCount >= 5 },
    { field: "preferredLongRunDay", workoutField: "longWorkout", visible: runCount >= 3 },
  ];
  const [advancedOpen, setAdvancedOpen] = useState(
    () => Boolean(profile && (Object.values(profile.preferredDays).some((day) => day !== null)
      || (["vo2max", "threshold", "long"] as const).some((slot) =>
        (profile.workoutChoices ?? DEFAULT_WORKOUT_CHOICES)[slot] !== DEFAULT_WORKOUT_CHOICES[slot]))));
  const hasPreferredDayErrors = Boolean(
    errors.preferredVo2maxDay || errors.preferredThresholdDay || errors.preferredLongRunDay);
  const hasWorkoutErrors = Boolean(errors.intervalWorkout || errors.thresholdWorkout || errors.longWorkout);
  const hasCustomWorkouts = intervalWorkout !== DEFAULT_WORKOUT_CHOICES.vo2max
    || thresholdWorkout !== DEFAULT_WORKOUT_CHOICES.threshold
    || longWorkout !== DEFAULT_WORKOUT_CHOICES.long
    || [preferredVo2maxDay, preferredThresholdDay, preferredLongRunDay].some((day) => day !== "");
  const clearPreferredDaysOutside = (days: number[]) => {
    for (const field of PREFERRED_DAY_FIELDS) {
      const value = { preferredVo2maxDay, preferredThresholdDay, preferredLongRunDay }[field];
      if (value !== "" && !days.includes(Number(value))) setValue(field, "", { shouldDirty: true });
    }
  };
  const restoreDefaultWorkouts = () => {
    setValue("intervalWorkout", DEFAULT_WORKOUT_CHOICES.vo2max, { shouldDirty: true });
    setValue("thresholdWorkout", DEFAULT_WORKOUT_CHOICES.threshold, { shouldDirty: true });
    setValue("longWorkout", DEFAULT_WORKOUT_CHOICES.long, { shouldDirty: true });
    for (const field of PREFERRED_DAY_FIELDS) setValue(field, "", { shouldDirty: true });
    if (isSubmitted) void trigger([...PREFERRED_DAY_FIELDS, "intervalWorkout", "thresholdWorkout", "longWorkout"]);
  };
  const draft: Profile = {
    distanceMeters: distance,
    raceSeconds,
    vdot: calculateVdot(distance, raceSeconds),
    goal: profile?.goal ?? "none",
    goalDistanceMeters: profile?.goalDistanceMeters ?? 5000,
    schedule,
    recentWeeklyVolumeKm: weeklyTargetMode === "distance" ? Number(recentWeeklyVolume) : null,
    desiredWeeklyDurationMinutes: weeklyTargetMode === "time"
      ? Number(weeklyHours) * 60 + Number(weeklyMinutes) : null,
    preferredDays: scheduledPreferredDays(
      preferredDaysFromForm({ preferredVo2maxDay, preferredThresholdDay, preferredLongRunDay }), runCount),
    workoutChoices: { vo2max: intervalWorkout, threshold: thresholdWorkout, long: longWorkout },
  };
  const hasChanges = !profile || !profilesMatch(profile, draft);

  // Last performance entered by the user; equivalent times are derived from it so they don't drift.
  const [performanceAnchor, setPerformanceAnchor] = useState(() => {
    const values = getValues();
    return enteredPerformance(values.distanceMeters, values.hours, values.minutes, values.seconds);
  });
  const updatePerformanceAnchor = () => {
    const values = getValues();
    const entered = enteredPerformance(values.distanceMeters, values.hours, values.minutes, values.seconds);
    if (entered) setPerformanceAnchor(entered);
  };
  const setRaceTime = (newDistance: number, totalSeconds: number | null) => {
    const usesHourField = newDistance > 5000;
    setValue("hours", totalSeconds !== null && usesHourField ? String(Math.floor(totalSeconds / 3600)) : "", { shouldDirty: true });
    setValue("minutes", totalSeconds !== null ? String(Math.floor((usesHourField ? totalSeconds % 3600 : totalSeconds) / 60)) : "", { shouldDirty: true });
    setValue("seconds", totalSeconds !== null ? String(totalSeconds % 60) : "", { shouldDirty: true });
  };

  const updateDistance = (value: string) => {
    setValue("distanceMeters", value, { shouldDirty: true });
    const newDistance = Number(value);
    if (!Number.isFinite(newDistance) || newDistance < 1500 || newDistance > 42195) {
      void trigger("distanceMeters");
      return;
    }
    const anchor = performanceAnchor;
    const anchorVdot = !anchor ? 0 : profile && profile.distanceMeters === anchor.distanceMeters
      && profile.raceSeconds === anchor.raceSeconds ? profile.vdot : calculateVdot(anchor.distanceMeters, anchor.raceSeconds);
    let totalSeconds = !anchor ? null : anchor.distanceMeters === newDistance ? anchor.raceSeconds
      : equivalentRaceSeconds(anchorVdot, newDistance);
    if (totalSeconds !== null && (totalSeconds < 180 || totalSeconds > 28800
      || (newDistance <= 5000 && totalSeconds >= 3600) || !isSupportedPerformance(newDistance, totalSeconds))) {
      totalSeconds = null;
    }
    setRaceTime(newDistance, totalSeconds);
    void trigger(["distanceMeters", "hours", "minutes", "seconds"]);
  };

  const onSubmit = (values: ProfileFormValues) => {
    const distanceMeters = Number(values.distanceMeters);
    const raceTimeSeconds = (distanceMeters > 5000 ? Number(values.hours) * 3600 : 0)
      + Number(values.minutes) * 60 + Number(values.seconds);
    const submittedSchedule: Schedule = values.scheduleMode === "days"
      ? { mode: "days", days: values.scheduleDays }
      : { mode: "count", count: Number(values.scheduleCount) };
    onSave({
      distanceMeters,
      raceSeconds: raceTimeSeconds,
      // An equivalent performance keeps the saved VDOT so rounded times don't shift paces.
      vdot: profile && samePerformance(profile, { distanceMeters, raceSeconds: raceTimeSeconds })
        ? profile.vdot : calculateVdot(distanceMeters, raceTimeSeconds),
      goal: profile?.goal ?? "none",
      goalDistanceMeters: profile?.goalDistanceMeters ?? 5000,
      schedule: submittedSchedule,
      recentWeeklyVolumeKm: values.weeklyTargetMode === "distance" ? Number(values.recentWeeklyVolume) : null,
      desiredWeeklyDurationMinutes: values.weeklyTargetMode === "time"
        ? Number(values.weeklyHours) * 60 + Number(values.weeklyMinutes) : null,
      preferredDays: scheduledPreferredDays(preferredDaysFromForm(values),
        submittedSchedule.mode === "days" ? submittedSchedule.days.length : submittedSchedule.count),
      workoutChoices: { vo2max: values.intervalWorkout, threshold: values.thresholdWorkout, long: values.longWorkout },
    });
  };

  useEffect(() => {
    if (isSubmitted) void trigger();
    // Re-translate shown errors only when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const errorMessages = [
    errors.distanceMeters?.message,
    errors.hours?.message,
    errors.minutes?.message,
    errors.seconds?.message,
    errors.recentWeeklyVolume?.message,
    errors.weeklyHours?.message,
    errors.weeklyMinutes?.message,
    errors.scheduleDays?.message,
    errors.scheduleCount?.message,
    errors.preferredVo2maxDay?.message,
    errors.preferredThresholdDay?.message,
    errors.preferredLongRunDay?.message,
    errors.intervalWorkout?.message,
    errors.thresholdWorkout?.message,
    errors.longWorkout?.message,
  ].filter((message): message is string => Boolean(message));

  return <form noValidate className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)}>
    <div className="grid items-start gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
        <h3 className="mb-1 min-h-5 text-sm font-medium">{t.form.performanceDistance}</h3>
        <label className="block">
          <span className="sr-only">{t.form.performanceDistance}</span>
          <SelectField
            aria-label={t.form.performanceDistance}
            value={customDistance ? "custom" : distanceValue}
            onValueChange={(value) => {
              const isCustom = value === "custom";
              setValue("customDistance", isCustom, { shouldDirty: true });
              if (!isCustom) updateDistance(value);
            }}
            className="field"
          >
            {DISTANCES.map((item) => <option key={item.meters} value={item.meters}>{distanceLabel(item.meters, t.distances)}</option>)}
            <option value="custom">{t.form.customDistance}</option>
          </SelectField>
        </label>
        {customDistance && <label className="mt-2 block">
          <span className="field-label">{t.form.distanceInMetres}</span>
          <input
            {...register("distanceMeters", { onChange: (event) => updateDistance(event.target.value) })}
            className="field"
            type="number"
            min="1500"
            max="42195"
            step="1"
            aria-invalid={Boolean(errors.distanceMeters)}
          />
        </label>}
        <ErrorMessage>{errors.distanceMeters?.message}</ErrorMessage>
      </div>

      <div className="min-w-0 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
        <h3 className="mb-1 min-h-5 text-sm font-medium">{usesHours ? t.form.raceTimeWithHours : t.form.raceTimeWithoutHours}</h3>
        <fieldset>
          <legend className="sr-only">{t.form.raceTime}</legend>
          <div className={`grid ${usesHours ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
            {usesHours && <input
              {...register("hours", { onChange: updatePerformanceAnchor })}
              className="field"
              aria-label={t.form.hours}
              type="number"
              min="0"
              max="8"
              step="1"
              placeholder={t.form.hoursPlaceholder}
              aria-invalid={Boolean(errors.hours)}
            />}
            <input {...register("minutes", { onChange: updatePerformanceAnchor })} className="field" aria-label={t.form.minutes} type="number" min="0" max="59" step="1" placeholder={t.form.minutesPlaceholder} aria-invalid={Boolean(errors.minutes)} />
            <input {...register("seconds", { onChange: updatePerformanceAnchor })} className="field" aria-label={t.form.seconds} type="number" min="0" max="59" step="1" placeholder={t.form.secondsPlaceholder} aria-invalid={Boolean(errors.seconds)} />
          </div>
          <ErrorMessage>{errors.hours?.message}</ErrorMessage>
          <ErrorMessage>{errors.minutes?.message ?? errors.seconds?.message}</ErrorMessage>
        </fieldset>
      </div>

      <div className="min-w-0 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
        <h3 className="mb-1 min-h-5 text-sm font-medium">{t.form.schedule}</h3>
        <fieldset>
          <legend className="sr-only">{t.form.schedule}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" value="days" {...register("scheduleMode", { onChange: () => clearPreferredDaysOutside(scheduleDays) })} />{t.form.chooseWeekdays}</label>
            <label className="flex items-center gap-2"><input type="radio" value="count" {...register("scheduleMode")} />{t.form.chooseRunCount}</label>
          </div>
          {scheduleMode === "days" ? <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {Array.from({ length: 7 }, (_, index) => <label key={index} className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2 text-sm ${scheduleDays.includes(index) ? "border-emerald-700 bg-emerald-50" : "border-stone-300"}`}>
              <span aria-hidden="true">{weekdayName(locale, index, "short")}</span>
              <input
                type="checkbox"
                aria-label={weekdayName(locale, index)}
                checked={scheduleDays.includes(index)}
                onChange={(event) => {
                  const days = event.target.checked
                    ? [...scheduleDays, index]
                    : scheduleDays.filter((entry) => entry !== index);
                  clearPreferredDaysOutside(days);
                  setValue("scheduleDays", days, { shouldDirty: true, shouldValidate: true });
                }}
              />
            </label>)}
          </div> : <label className="mt-2 block max-w-xs">
            <span className="field-label">{t.form.runsPerWeek}</span>
            <SelectField {...register("scheduleCount")} value={scheduleCount} aria-label={t.form.runsPerWeek} className="field">
              {[1, 2, 3, 4, 5, 6, 7].map((count) => <option key={count} value={count}>{count}</option>)}
            </SelectField>
          </label>}
          <ErrorMessage>{errors.scheduleDays?.message ?? errors.scheduleCount?.message}</ErrorMessage>
          {runCount >= 1 && <details
            className="group/advanced mt-3"
            open={advancedOpen || hasPreferredDayErrors || hasWorkoutErrors}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          >
            <summary className="flex w-fit cursor-pointer list-none flex-wrap items-center gap-1.5 rounded text-sm font-medium text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 transition-transform group-open/advanced:rotate-180">
                <path fillRule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
              {t.form.advancedOptions}
              {hasCustomWorkouts && (advancedOpen || hasPreferredDayErrors || hasWorkoutErrors) && <button
                type="button"
                className="ml-2 rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  restoreDefaultWorkouts();
                }}
              >
                {t.form.backToDefault}
              </button>}
            </summary>
            <div className="mt-2 grid gap-2">
              {preferredDayInputs.filter(({ visible }) => visible).map(({ field, workoutField }, index) => <fieldset key={field} className="grid gap-2 rounded-lg border border-stone-200 p-2">
                <legend className="px-1 text-sm font-medium">{t.form.workout} {index + 1}</legend>
                <div className="flex items-center gap-1">
                  <label className="block min-w-0 flex-1">
                    <span className="sr-only">{t.form.workout} {index + 1}</span>
                    <SelectField {...register(workoutField)} value={{ intervalWorkout, thresholdWorkout, longWorkout }[workoutField]}
                      onValueChange={() => { if (isSubmitted) void trigger(PREFERRED_DAY_FIELDS); }}
                      highlightedValue="easy" className="field" aria-label={`${t.form.workout} ${index + 1}`} aria-invalid={Boolean(errors[workoutField])}>
                      {KEY_WORKOUT_TYPES.map((type) => <option key={type} value={type}>{type === "easy" ? t.form.skipWorkout : t.workouts[type]}</option>)}
                    </SelectField>
                  </label>
                  <WorkoutTypeHelp name={t.workouts[{ intervalWorkout, thresholdWorkout, longWorkout }[workoutField]]}
                    definition={t.workoutDefinitions[{ intervalWorkout, thresholdWorkout, longWorkout }[workoutField]]} />
                </div>
                <label className="block">
                  <span className="field-label">{t.form.preferredWorkoutDay}</span>
                  <SelectField {...register(field)} value={{ preferredVo2maxDay, preferredThresholdDay, preferredLongRunDay }[field]}
                    onValueChange={() => { if (isSubmitted) void trigger(PREFERRED_DAY_FIELDS); }}
                    className="field" aria-label={t.form.preferredWorkoutDay} aria-invalid={Boolean(errors[field])}>
                    <option value="">{t.form.noPreference}</option>
                    {preferredDayOptions.map((day) => <option key={day} value={day}>{weekdayName(locale, day)}</option>)}
                  </SelectField>
                </label>
                <ErrorMessage>{errors[workoutField]?.message ?? errors[field]?.message}</ErrorMessage>
              </fieldset>)}
            </div>
          </details>}
        </fieldset>
      </div>

      <div className="min-w-0 p-3">
        <h3 className="mb-1 min-h-5 text-sm font-medium">{t.form.weeklyTarget}</h3>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t.form.weeklyTarget}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" value="distance" {...register("weeklyTargetMode")} />{t.form.distance}</label>
            <label className="flex items-center gap-2"><input type="radio" value="time" {...register("weeklyTargetMode")} />{t.form.time}</label>
            <label className="flex items-center gap-2"><input type="radio" value="unspecified" {...register("weeklyTargetMode")} />{t.form.unspecified}</label>
          </div>
          {weeklyTargetMode === "distance" && <label className="block max-w-sm">
            <span className="field-label">{t.form.weeklyDistance}</span>
            <input {...register("recentWeeklyVolume")} className="field" type="number" min="1" step="1" aria-invalid={Boolean(errors.recentWeeklyVolume)} />
          </label>}
          {weeklyTargetMode === "time" && <fieldset>
            <legend className="field-label">{t.form.weeklyTime}</legend>
            <div className="grid max-w-sm grid-cols-2 gap-2">
              <input {...register("weeklyHours")} className="field" aria-label={t.form.weeklyHours} type="number" min="0" max="168" step="1" placeholder={t.form.hoursPlaceholder} aria-invalid={Boolean(errors.weeklyHours)} />
              <input {...register("weeklyMinutes")} className="field" aria-label={t.form.weeklyMinutes} type="number" min="0" max="59" step="1" placeholder={t.form.minutesPlaceholder} aria-invalid={Boolean(errors.weeklyMinutes)} />
            </div>
          </fieldset>}
          <ErrorMessage>{errors.recentWeeklyVolume?.message ?? errors.weeklyHours?.message ?? errors.weeklyMinutes?.message}</ErrorMessage>
        </fieldset>
      </div>
    </div>

    {errorMessages.length > 0 && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      <ul className="list-inside list-disc">{errorMessages.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}</ul>
    </div>}
    <div className="flex flex-wrap gap-3">
      <button className="button-primary" type="submit" disabled={Boolean(profile && !hasChanges)}>
        {profile ? t.form.save : t.form.create}
      </button>
    </div>
  </form>;
}
