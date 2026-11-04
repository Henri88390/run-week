import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { View } from "react-native";
import { weekdayName, type Locale } from "@/features/i18n/locales";
import type { Messages } from "@/features/i18n/messages/en";
import {
  calculateVdot,
  DEFAULT_WORKOUT_CHOICES,
  DISTANCES,
  equivalentRaceSeconds,
  isSupportedPerformance,
  KEY_WORKOUT_TYPES,
} from "@/features/running-programs/domain";
import type { PreferredDays, Profile } from "@/features/running-programs/types";
import { profilesMatch, samePerformance } from "@/features/running-programs/profile-comparison";
import { createProfileFormSchema, preferredDaysFromForm, type ProfileFormValues } from "@/features/running-programs/components/profile-form.schema";
import { Body, Button, Card, ChoiceGroup, Heading, MultiChoiceGroup, Notice, SectionTitle, TextField, colors } from "./components";

type Props = {
  profile: Profile | undefined;
  locale: Locale;
  t: Messages;
  onSave(profile: Profile): void;
};

const DAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];
const slotFields = [
  { slot: "vo2max" as const, form: "intervalWorkout" as const, dayField: "preferredVo2maxDay" as const, label: "preferredVo2maxDay" as const },
  { slot: "threshold" as const, form: "thresholdWorkout" as const, dayField: "preferredThresholdDay" as const, label: "preferredThresholdDay" as const },
  { slot: "long" as const, form: "longWorkout" as const, dayField: "preferredLongRunDay" as const, label: "preferredLongRunDay" as const },
];

function timeParts(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return { hours: String(hours), minutes: String(minutes), seconds: String(remainder) };
}

function defaultForm(profile?: Profile): ProfileFormValues {
  const distance = profile?.distanceMeters ?? 5000;
  const duration = profile?.desiredWeeklyDurationMinutes ?? null;
  return {
    distanceMeters: String(distance),
    customDistance: !DISTANCES.some((entry) => entry.meters === distance),
    ...timeParts(profile?.raceSeconds ?? 1500),
    weeklyTargetMode: duration !== null ? "time" : profile?.recentWeeklyVolumeKm != null ? "distance" : "unspecified",
    recentWeeklyVolume: profile?.recentWeeklyVolumeKm?.toString() ?? "",
    weeklyHours: duration == null ? "" : String(Math.floor(duration / 60)),
    weeklyMinutes: duration == null ? "" : String(duration % 60),
    scheduleMode: profile?.schedule.mode ?? "count",
    scheduleDays: profile?.schedule.mode === "days" ? [...profile.schedule.days] : [1, 3, 5],
    scheduleCount: profile?.schedule.mode === "count" ? String(profile.schedule.count) : "3",
    preferredVo2maxDay: String(profile?.preferredDays.vo2max ?? ""),
    preferredThresholdDay: String(profile?.preferredDays.threshold ?? ""),
    preferredLongRunDay: String(profile?.preferredDays.long ?? ""),
    intervalWorkout: profile?.workoutChoices?.vo2max ?? DEFAULT_WORKOUT_CHOICES.vo2max,
    thresholdWorkout: profile?.workoutChoices?.threshold ?? DEFAULT_WORKOUT_CHOICES.threshold,
    longWorkout: profile?.workoutChoices?.long ?? DEFAULT_WORKOUT_CHOICES.long,
  };
}

export function SetupForm({ profile, locale, t, onSave }: Props) {
  const schema = useMemo(() => createProfileFormSchema(t.validation, locale), [locale, t.validation]);
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: defaultForm(profile),
  });
  const { control, getValues, setValue, handleSubmit, formState: { errors } } = form;
  useWatch({ control });
  const values = form.getValues();
  const [advanced, setAdvanced] = useState(false);

  const selectedDistance = Number(values.distanceMeters);

  function chooseDistance(next: number, custom: boolean) {
    const current = getValues();
    const currentDistance = Number(current.distanceMeters);
    const currentTime = (currentDistance > 5000 ? Number(current.hours || 0) : 0) * 3600
      + Number(current.minutes) * 60 + Number(current.seconds);
    const anchorVdot = Number.isFinite(currentDistance) && isSupportedPerformance(currentDistance, currentTime)
      ? profile && samePerformance(profile, { distanceMeters: currentDistance, raceSeconds: currentTime })
        ? profile.vdot : calculateVdot(currentDistance, currentTime) : profile?.vdot;
    const equivalent = anchorVdot && Number.isFinite(anchorVdot)
      ? timeParts(profile?.distanceMeters === next && anchorVdot === profile.vdot
        ? profile.raceSeconds : equivalentRaceSeconds(anchorVdot, next)) : null;
    setValue("distanceMeters", String(next), { shouldDirty: true, shouldValidate: true });
    setValue("customDistance", custom, { shouldDirty: true });
    if (equivalent) {
      setValue("hours", equivalent.hours, { shouldDirty: true });
      setValue("minutes", equivalent.minutes, { shouldDirty: true });
      setValue("seconds", equivalent.seconds, { shouldDirty: true });
    }
  }

  function editCustomDistance(text: string) {
    const next = Number(text);
    const current = getValues();
    const oldDistance = Number(current.distanceMeters);
    const oldTime = (oldDistance > 5000 ? Number(current.hours || 0) : 0) * 3600
      + Number(current.minutes) * 60 + Number(current.seconds);
    const anchorVdot = Number.isFinite(oldDistance) && isSupportedPerformance(oldDistance, oldTime)
      ? profile && samePerformance(profile, { distanceMeters: oldDistance, raceSeconds: oldTime })
        ? profile.vdot : calculateVdot(oldDistance, oldTime) : profile?.vdot;
    const equivalent = Number.isFinite(next) && next >= 1500 && next <= 42195 && anchorVdot
      ? timeParts(profile?.distanceMeters === next && anchorVdot === profile.vdot
        ? profile.raceSeconds : equivalentRaceSeconds(anchorVdot, next)) : null;
    setValue("distanceMeters", text, { shouldDirty: true, shouldValidate: true });
    if (equivalent) {
      setValue("hours", equivalent.hours, { shouldDirty: true });
      setValue("minutes", equivalent.minutes, { shouldDirty: true });
      setValue("seconds", equivalent.seconds, { shouldDirty: true });
    }
  }

  const errorMessages = Object.values(errors).flatMap((error) =>
    error && typeof error.message === "string" ? [error.message] : []);

  function toProfile(data: ProfileFormValues): Profile {
    const distanceMeters = data.customDistance
      ? Number(data.distanceMeters)
      : DISTANCES.find((entry) => String(entry.meters) === data.distanceMeters)?.meters ?? Number(data.distanceMeters);
    const raceSeconds = (distanceMeters > 5000 ? Number(data.hours || 0) : 0) * 3600
      + Number(data.minutes) * 60 + Number(data.seconds);
    const preferredDays: PreferredDays = preferredDaysFromForm(data);
    const nextProfile: Profile = {
      distanceMeters,
      raceSeconds,
      vdot: profile && samePerformance(profile, { distanceMeters, raceSeconds })
        ? profile.vdot : calculateVdot(distanceMeters, raceSeconds),
      goal: profile?.goal ?? "none",
      goalDistanceMeters: profile?.goalDistanceMeters ?? 5000,
      schedule: data.scheduleMode === "days"
        ? { mode: "days", days: [...data.scheduleDays].sort((a, b) => a - b) }
        : { mode: "count", count: Number(data.scheduleCount) },
      recentWeeklyVolumeKm: data.weeklyTargetMode === "distance" ? Number(data.recentWeeklyVolume) : null,
      desiredWeeklyDurationMinutes: data.weeklyTargetMode === "time"
        ? Number(data.weeklyHours || 0) * 60 + Number(data.weeklyMinutes || 0) : null,
      preferredDays,
      workoutChoices: {
        vo2max: data.intervalWorkout,
        threshold: data.thresholdWorkout,
        long: data.longWorkout,
      },
    };
    return nextProfile;
  }

  const hasChanges = !profile || !profilesMatch(profile, toProfile(values));

  function resetAdvanced() {
    setValue("preferredVo2maxDay", "");
    setValue("preferredThresholdDay", "");
    setValue("preferredLongRunDay", "");
    setValue("intervalWorkout", DEFAULT_WORKOUT_CHOICES.vo2max);
    setValue("thresholdWorkout", DEFAULT_WORKOUT_CHOICES.threshold);
    setValue("longWorkout", DEFAULT_WORKOUT_CHOICES.long);
  }

  return <Card>
    <Heading>{t.form.performanceDistance}</Heading>
    <ChoiceGroup
      label={t.form.performanceDistance}
      value={values.customDistance ? "custom" : String(selectedDistance)}
      onChange={(value) => {
        if (value === "custom") setValue("customDistance", true, { shouldDirty: true });
        else chooseDistance(Number(value), false);
      }}
      options={[
        ...DISTANCES.map((entry) => ({
          value: String(entry.meters),
          label: entry.name ? t.distances[entry.name] : entry.label,
        })),
        { value: "custom", label: t.form.customDistance },
      ]}
    />
    {values.customDistance && <TextField
      label={t.form.distanceInMetres}
      value={values.distanceMeters}
      onChangeText={editCustomDistance}
      keyboardType="numeric"
    />}
    <SectionTitle>{t.form.raceTime}</SectionTitle>
    <View style={{ flexDirection: "row", gap: 8 }}>
      {selectedDistance > 5000 && <View style={{ flex: 1 }}><TextField label={t.form.hours} value={values.hours} onChangeText={(value) => setValue("hours", value, { shouldDirty: true })} keyboardType="numeric" /></View>}
      <View style={{ flex: 1 }}><TextField label={t.form.minutes} value={values.minutes} onChangeText={(value) => setValue("minutes", value, { shouldDirty: true })} keyboardType="numeric" /></View>
      <View style={{ flex: 1 }}><TextField label={t.form.seconds} value={values.seconds} onChangeText={(value) => setValue("seconds", value, { shouldDirty: true })} keyboardType="numeric" /></View>
    </View>

    <SectionTitle>{t.form.weeklyTarget}</SectionTitle>
    <ChoiceGroup
      value={values.weeklyTargetMode}
      onChange={(value) => setValue("weeklyTargetMode", value, { shouldDirty: true })}
      options={[
        { value: "distance", label: t.form.distance },
        { value: "time", label: t.form.time },
        { value: "unspecified", label: t.form.unspecified },
      ]}
    />
    {values.weeklyTargetMode === "distance" && <TextField
      label={t.form.weeklyDistance}
      value={values.recentWeeklyVolume}
      onChangeText={(value) => setValue("recentWeeklyVolume", value, { shouldDirty: true })}
      keyboardType="numeric"
    />}
    {values.weeklyTargetMode === "time" && <View style={{ flexDirection: "row", gap: 8 }}>
      <View style={{ flex: 1 }}><TextField label={t.form.weeklyHours} value={values.weeklyHours} onChangeText={(value) => setValue("weeklyHours", value, { shouldDirty: true })} keyboardType="numeric" /></View>
      <View style={{ flex: 1 }}><TextField label={t.form.weeklyMinutes} value={values.weeklyMinutes} onChangeText={(value) => setValue("weeklyMinutes", value, { shouldDirty: true })} keyboardType="numeric" /></View>
    </View>}

    <SectionTitle>{t.form.schedule}</SectionTitle>
    <ChoiceGroup
      value={values.scheduleMode}
      onChange={(value) => setValue("scheduleMode", value, { shouldDirty: true })}
      options={[
        { value: "count", label: t.form.chooseRunCount },
        { value: "days", label: t.form.chooseWeekdays },
      ]}
    />
    {values.scheduleMode === "count"
      ? <ChoiceGroup label={t.form.runsPerWeek} value={Number(values.scheduleCount)} onChange={(value) => setValue("scheduleCount", String(value), { shouldDirty: true })}
          options={DAY_INDEXES.map((count) => ({ value: count + 1, label: String(count + 1) }))} />
      : <MultiChoiceGroup label={t.form.chooseWeekdays} selected={values.scheduleDays}
          onToggle={(day) => setValue("scheduleDays", values.scheduleDays.includes(day)
            ? values.scheduleDays.length > 1 ? values.scheduleDays.filter((item) => item !== day) : values.scheduleDays
            : [...values.scheduleDays, day], { shouldDirty: true })}
          options={DAY_INDEXES.map((day) => ({ value: day, label: weekdayName(locale, day, "short") }))} />}

    <Button label={t.form.advancedOptions} variant="secondary" expanded={advanced} onPress={() => setAdvanced((shown) => !shown)} />
    {advanced && <View style={{ gap: 12, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12 }}>
      <SectionTitle>{t.form.advancedOptions}</SectionTitle>
      <Body>{t.form.workoutChoiceNote}</Body>
      {slotFields.map(({ slot, form, dayField, label }) => {
        const runCount = values.scheduleMode === "days" ? values.scheduleDays.length : Number(values.scheduleCount);
        const active = slot === "vo2max" || (slot === "threshold" && runCount >= 3)
          || (slot === "long" && runCount >= 3);
        const choice = values[form];
        const workoutTypeOptions = KEY_WORKOUT_TYPES.map((type) => ({
          value: type,
          label: type === "easy" ? t.workouts.easy : type === "vo2max" ? t.workouts.vo2max : t.workouts[type],
        }));
        return <View key={slot} style={{ gap: 8 }}>
          <SectionTitle>{t.form[form === "intervalWorkout" ? "preferredVo2maxDay" : form === "thresholdWorkout" ? "preferredThresholdDay" : "preferredLongRunDay"]}</SectionTitle>
          <Body>{label === "preferredVo2maxDay" ? t.workoutDefinitions.vo2max : label === "preferredThresholdDay" ? t.workoutDefinitions.threshold : t.workoutDefinitions.long}</Body>
          <ChoiceGroup value={choice} onChange={(value) => {
            if (form === "intervalWorkout") setValue("intervalWorkout", value, { shouldDirty: true });
            else if (form === "thresholdWorkout") setValue("thresholdWorkout", value, { shouldDirty: true });
            else setValue("longWorkout", value, { shouldDirty: true });
          }} options={workoutTypeOptions} />
          {active && <ChoiceGroup label={t.form.preferredWorkoutDay} value={values[dayField] === "" ? -1 : Number(values[dayField])}
            onChange={(value) => {
              const day = value < 0 ? "" : String(value);
              if (dayField === "preferredVo2maxDay") setValue("preferredVo2maxDay", day, { shouldDirty: true });
              else if (dayField === "preferredThresholdDay") setValue("preferredThresholdDay", day, { shouldDirty: true });
              else setValue("preferredLongRunDay", day, { shouldDirty: true });
            }}
            options={[
              { value: -1, label: t.form.noPreference },
              ...DAY_INDEXES.map((day) => ({ value: day, label: weekdayName(locale, day, "short") })),
            ]} />}
        </View>;
      })}
      <Button label={t.form.backToDefault} variant="secondary" onPress={resetAdvanced} />
    </View>}

    {errorMessages.map((message, index) => <Notice key={`${index}-${message}`} tone="error">{message}</Notice>)}
    {hasChanges && <Button label={profile ? t.form.save : t.form.create}
      onPress={() => void handleSubmit((data) => onSave(toProfile(data)))()} />}
  </Card>;
}
