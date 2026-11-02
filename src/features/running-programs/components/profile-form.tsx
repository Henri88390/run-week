"use client";

import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { weekdayName } from "@/features/i18n/locales";
import { useI18n } from "@/features/i18n/use-i18n";
import { calculateVdot, distanceLabel, DISTANCES } from "../domain";
import type { Profile, Schedule } from "../types";
import { createProfileFormSchema, type ProfileFormValues } from "./profile-form.schema";

function profilesMatch(a: Profile, b: Profile): boolean {
  const schedulesMatch = a.schedule.mode === b.schedule.mode && (
    a.schedule.mode === "count" && b.schedule.mode === "count"
      ? a.schedule.count === b.schedule.count
      : a.schedule.mode === "days" && b.schedule.mode === "days"
        && [...a.schedule.days].sort().join(",") === [...b.schedule.days].sort().join(",")
  );
  return a.distanceMeters === b.distanceMeters
    && a.raceSeconds === b.raceSeconds
    && a.recentWeeklyVolumeKm === b.recentWeeklyVolumeKm
    && a.desiredWeeklyDurationMinutes === b.desiredWeeklyDurationMinutes
    && a.goal === b.goal
    && a.goalDistanceMeters === b.goalDistanceMeters
    && schedulesMatch;
}

function ErrorMessage({ children }: { children?: string }) {
  return children ? <p className="mt-2 text-sm text-red-700" role="alert">{children}</p> : null;
}

export function ProfileForm({ profile, onSave }: {
  profile?: Profile;
  onSave: (profile: Profile) => void;
}) {
  const { locale, t } = useI18n();
  const schema = useMemo(() => createProfileFormSchema(t.validation, locale), [t, locale]);
  const defaultSchedule: Schedule = profile?.schedule ?? { mode: "count", count: 3 };
  const { control, register, setValue, handleSubmit, trigger, formState: { errors, isSubmitted } } = useForm<ProfileFormValues>({
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
    ],
  });

  const distance = Number(distanceValue);
  const usesHours = distance > 5000;
  const raceSeconds = (usesHours ? Number(hours) * 3600 : 0) + Number(minutes) * 60 + Number(seconds);
  const schedule: Schedule = scheduleMode === "days"
    ? { mode: "days", days: scheduleDays }
    : { mode: "count", count: Number(scheduleCount) };
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
  };
  const hasChanges = !profile || !profilesMatch(profile, draft);

  const updateDistance = (value: string) => {
    setValue("distanceMeters", value, { shouldDirty: true, shouldValidate: true });
    const newDistance = Number(value);
    if (profile && newDistance === profile.distanceMeters) {
      setValue("hours", newDistance > 5000 ? String(Math.floor(profile.raceSeconds / 3600)) : "", { shouldDirty: true });
      setValue("minutes", String(Math.floor(profile.raceSeconds % 3600 / 60)), { shouldDirty: true });
      setValue("seconds", String(profile.raceSeconds % 60), { shouldDirty: true });
    } else {
      setValue("hours", "", { shouldDirty: true });
      setValue("minutes", "", { shouldDirty: true });
      setValue("seconds", "", { shouldDirty: true });
    }
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
      vdot: calculateVdot(distanceMeters, raceTimeSeconds),
      goal: profile?.goal ?? "none",
      goalDistanceMeters: profile?.goalDistanceMeters ?? 5000,
      schedule: submittedSchedule,
      recentWeeklyVolumeKm: values.weeklyTargetMode === "distance" ? Number(values.recentWeeklyVolume) : null,
      desiredWeeklyDurationMinutes: values.weeklyTargetMode === "time"
        ? Number(values.weeklyHours) * 60 + Number(values.weeklyMinutes) : null,
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
  ].filter((message): message is string => Boolean(message));

  return <form noValidate className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)}>
    <div className="grid items-start gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
        <h3 className="mb-1 min-h-5 text-sm font-medium">{t.form.performanceDistance}</h3>
        <label className="block">
          <span className="sr-only">{t.form.performanceDistance}</span>
          <select
            value={customDistance ? "custom" : distanceValue}
            onChange={(event) => {
              const isCustom = event.target.value === "custom";
              setValue("customDistance", isCustom, { shouldDirty: true });
              if (!isCustom) updateDistance(event.target.value);
            }}
            className="field pr-5"
          >
            {DISTANCES.map((item) => <option key={item.meters} value={item.meters}>{distanceLabel(item.meters, t.distances)}</option>)}
            <option value="custom">{t.form.customDistance}</option>
          </select>
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
              {...register("hours")}
              className="field"
              aria-label={t.form.hours}
              type="number"
              min="0"
              max="8"
              step="1"
              placeholder={t.form.hoursPlaceholder}
              aria-invalid={Boolean(errors.hours)}
            />}
            <input {...register("minutes")} className="field" aria-label={t.form.minutes} type="number" min="0" max="59" step="1" placeholder={t.form.minutesPlaceholder} aria-invalid={Boolean(errors.minutes)} />
            <input {...register("seconds")} className="field" aria-label={t.form.seconds} type="number" min="0" max="59" step="1" placeholder={t.form.secondsPlaceholder} aria-invalid={Boolean(errors.seconds)} />
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
            <label className="flex items-center gap-2"><input type="radio" value="days" {...register("scheduleMode")} />{t.form.chooseWeekdays}</label>
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
                  setValue("scheduleDays", days, { shouldDirty: true, shouldValidate: true });
                }}
              />
            </label>)}
          </div> : <label className="mt-2 block max-w-xs">
            <span className="field-label">{t.form.runsPerWeek}</span>
            <select {...register("scheduleCount")} className="field pr-5">
              {[1, 2, 3, 4, 5, 6, 7].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>}
          <ErrorMessage>{errors.scheduleDays?.message ?? errors.scheduleCount?.message}</ErrorMessage>
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
