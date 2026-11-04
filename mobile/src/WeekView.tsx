import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { addDays, estimatedWorkoutDistanceKm, formatPace, paceAtFraction, stepPaces, weekWorkoutSessionPlan, workoutLabelKey } from "@/features/running-programs/domain";
import { createWorkoutFit } from "@/features/running-programs/fit-export";
import type { Locale } from "@/features/i18n/locales";
import { formatDate, formatDecimal, weekdayName } from "@/features/i18n/locales";
import type { Messages } from "@/features/i18n/messages/en";
import type { AdjustmentLevel, TrainingWeek, Workout, WorkoutType } from "@/features/running-programs/types";
import { Button, ButtonRow, Card, ChoiceGroup, Heading, ModalSheet, Notice, SectionTitle, TextField, colors } from "./components";
import { NATIVE_STRINGS } from "./locale";
import type { GarminMutationResult } from "./api";

type Props = {
  week: TrainingWeek;
  locale: Locale;
  t: Messages;
  garmin: {
    configured: boolean;
    connected: boolean;
    sentDates: Set<string>;
    busy: boolean;
    send(workouts: Workout[]): Promise<GarminMutationResult>;
    remove(dates: string[]): Promise<GarminMutationResult>;
  };
  onChange(workout: Workout): void;
};

const WORKOUT_TYPES = ["easy", "long", "vo2max", "threshold", "repetition"] as const;
const ADJUSTMENTS: AdjustmentLevel[] = [-2, -1, 0, 1, 2];
const workoutTypeValues = ["easy", "long", "vo2max", "threshold", "repetition"] as const;

function EditWorkoutForm({
  workout, t, locale, onCancel, onSave,
}: {
  workout: Workout;
  t: Messages;
  locale: Locale;
  onCancel(): void;
  onSave(workout: Workout): void;
}) {
  const schema = z.object({
    duration: z.string()
      .regex(/^\d+$/, t.validation.wholeNumber(t.form.minutes))
      .refine((value) => Number(value) >= 1 && Number(value) <= 600, t.validation.wholeNumberRange(t.form.minutes, "1", "600")),
    type: z.enum(workoutTypeValues),
    adjustment: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]),
  });
  const form = useForm<{ duration: string; type: (typeof workoutTypeValues)[number]; adjustment: AdjustmentLevel }>({
    resolver: zodResolver(schema),
    defaultValues: {
      duration: String(workout.durationMinutes),
      type: workout.type === "workout" ? "vo2max" : workout.type ?? "easy",
      adjustment: workout.intensityAdjustment ?? (workout.intensityIncreased ? 1 : workout.intensityDecreased ? -1 : 0),
    },
    mode: "onSubmit",
  });
  const duration = form.watch("duration");
  const type = form.watch("type");
  const adjustment = form.watch("adjustment");
  const errors = [form.formState.errors.duration?.message, form.formState.errors.type?.message,
    form.formState.errors.adjustment?.message].filter((message): message is string => Boolean(message));

  return <>
    <SectionTitle>{NATIVE_STRINGS[locale].editWorkout}</SectionTitle>
    <TextField label={NATIVE_STRINGS[locale].duration} value={duration}
      onChangeText={(value) => form.setValue("duration", value, { shouldDirty: true, shouldValidate: true })}
      keyboardType="numeric" />
    <ChoiceGroup label={t.form.workout} value={type} onChange={(value) => form.setValue("type", value, { shouldDirty: true })}
      options={WORKOUT_TYPES.map((item) => ({
        value: item, label: t.workouts[workoutLabelKey(item)],
      }))} />
    <ChoiceGroup label={NATIVE_STRINGS[locale].intensity} value={adjustment}
      onChange={(value) => form.setValue("adjustment", value, { shouldDirty: true })}
      options={ADJUSTMENTS.map((value) => ({
        value,
        label: value === 0 ? NATIVE_STRINGS[locale].normal : value < 0
          ? `${NATIVE_STRINGS[locale].decrease} ${Math.abs(value)}` : `${NATIVE_STRINGS[locale].increase} ${value}`,
      }))} />
    {errors.map((error) => <Notice key={error} tone="error">{error}</Notice>)}
    <ButtonRow>
      <Button label={t.confirm.cancel} variant="secondary" onPress={onCancel} />
      <Button label={t.form.save} onPress={() => void form.handleSubmit((value) => onSave({
        ...workout,
        durationMinutes: Number(value.duration),
        type: value.type,
        intensityAdjustment: value.adjustment,
        intensityIncreased: false,
        intensityDecreased: false,
      }))()} />
    </ButtonRow>
  </>;
}

function durationLabel(minutes: number, t: Messages) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours > 0 ? `${hours} ${t.units.h}` : "", rest > 0 ? `${rest} ${t.units.min}` : ""].filter(Boolean).join(" ");
}

function distanceText(locale: Locale, distance: { min: number; max: number }, t: Messages) {
  return `${formatDecimal(locale, distance.min)}–${formatDecimal(locale, distance.max)} ${t.units.km}`;
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekAsText(week: TrainingWeek, locale: Locale, t: Messages) {
  const total = week.workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const vdot = week.profile.vdot;
  const minKm = total * 60 / paceAtFraction(vdot, 0.59);
  const maxKm = total * 60 / paceAtFraction(vdot, 0.74);
  const lines = [
    `${formatDate(locale, week.startDate, false)} – ${formatDate(locale, addDays(week.startDate, 6), false)}`,
    `${durationLabel(total, t)} · ~${distanceText(locale, { min: minKm, max: maxKm }, t)}`,
  ];
  for (let day = 0; day < 7; day++) {
    const workout = week.workouts.find((item) => item.day === day);
    if (!workout) continue;
    const distance = estimatedWorkoutDistanceKm(workout, vdot, week);
    lines.push("", `${weekdayName(locale, day)} ${formatDate(locale, addDays(week.startDate, day), false)}: ${durationLabel(workout.durationMinutes, t)} · ${t.workouts[workoutLabelKey(workout.type ?? "easy")]} · ~${distanceText(locale, distance, t)}`);
    const plan = weekWorkoutSessionPlan(week, workout);
    if (plan) {
      for (const step of plan.steps) {
        const paces = stepPaces(step, vdot);
        const pace = paces ? ` · ${formatPace(paces[1])}–${formatPace(paces[0])} ${t.units.perKm}` : "";
        lines.push(`- ${t.steps[step.kind]} · ${durationLabel(step.durationMinutes, t)}${pace}`);
      }
    }
  }
  return lines.join("\n");
}

function backgroundColor(type: WorkoutType | undefined) {
  if (type === "long") return colors.blueSoft;
  if (type === "vo2max" || type === "threshold") return colors.roseSoft;
  if (type === "repetition") return colors.violetSoft;
  return colors.greenSoft;
}

function errorText(error: string | undefined, t: Messages) {
  if (!error) return "";
  const known = ["reconnect", "permission", "rateLimited", "rejected", "unavailable", "network", "invalidResponse", "failed", "invalid", "alreadyLinked"] as const;
  if (known.some((code) => code === error)) {
    const code = error as (typeof known)[number];
    return t.garmin[code];
  }
  return t.garmin.failed;
}

export function WeekView({ week, locale, t, garmin, onChange }: Props) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState<"workouts" | "all">("workouts");
  const [helpVisible, setHelpVisible] = useState(false);
  const [notice, setNoticeText] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");
  useEffect(() => () => {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
  }, []);

  function setNotice(message: string, autoDismiss = false) {
    if (noticeTimer.current !== null) clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
    setNoticeText(message);
    if (autoDismiss) {
      noticeTimer.current = setTimeout(() => {
        setNoticeText("");
        noticeTimer.current = null;
      }, 3000);
    }
  }
  const totalMinutes = week.workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const estimatedKm = useMemo(() => ({
    min: totalMinutes * 60 / paceAtFraction(week.profile.vdot, 0.59),
    max: totalMinutes * 60 / paceAtFraction(week.profile.vdot, 0.74),
  }), [totalMinutes, week.profile.vdot]);
  const currentSelectedWorkout = selectedDay === null ? undefined : week.workouts.find((item) => item.day === selectedDay);
  const selectedWorkout = currentSelectedWorkout;
  const selectedDate = selectedDay === null ? null : addDays(week.startDate, selectedDay);
  const sentDatesForWeek = Array.from({ length: 7 }, (_, day) => addDays(week.startDate, day))
    .filter((date) => garmin.sentDates.has(date));
  const sentCount = sentDatesForWeek.length;
  const canSend = garmin.configured && garmin.connected && !garmin.busy;
  const pendingWeekWorkouts = week.workouts.filter((workout) =>
    (scope === "all" || (workout.type && workout.type !== "easy"))
    && !garmin.sentDates.has(addDays(week.startDate, workout.day)));

  function showResult(result: GarminMutationResult, operation: "send" | "remove") {
    const pieces = [
      result.count ? operation === "send" ? t.garmin.sent(result.count) : t.garmin.removed(result.count) : "",
      result.existing ? t.garmin.alreadySent(result.existing) : "",
      errorText(result.error, t),
      result.error === "rateLimited" && result.retryAfterSeconds ? t.garmin.retryAfter(result.retryAfterSeconds) : "",
      result.error && result.requestId ? `${t.garmin.reference}: ${result.requestId}` : "",
    ].filter(Boolean);
    setNotice(pieces.join(" ") || t.garmin.nothingToSend, operation === "remove" && !result.error);
    setNoticeTone(result.error ? "error" : "success");
  }

  async function sendWorkouts(target: "week" | number) {
    const workouts = target === "week" ? pendingWeekWorkouts
      : week.workouts.filter((workout) => workout.day === target);
    if (workouts.length === 0) {
      setNotice(t.garmin.nothingToSend);
      setNoticeTone("error");
      return;
    }
    showResult(await garmin.send(workouts), "send");
  }

  function confirmDelete(target: "week" | number) {
    const dates = target === "week" ? sentDatesForWeek
      : [addDays(week.startDate, target)].filter((date) => garmin.sentDates.has(date));
    if (!dates.length) return;
    const isWeek = target === "week";
    Alert.alert(
      isWeek ? t.garmin.confirmRemoveWeekTitle : t.garmin.confirmRemoveDayTitle,
      isWeek ? t.garmin.confirmRemoveWeekBody(dates.length)
        : t.garmin.confirmRemoveDayBody(weekdayName(locale, target)),
      [
        { text: t.confirm.cancel, style: "cancel" },
        { text: t.garmin.confirmRemove, style: "destructive", onPress: () => {
          void garmin.remove(dates).then((result) => showResult(result, "remove"));
        } },
      ],
    );
  }

  function beginEdit() {
    if (!selectedWorkout) return;
    setEditing(true);
  }

  async function copyWeek() {
    try {
      await Clipboard.setStringAsync(weekAsText(week, locale, t));
      setNotice(NATIVE_STRINGS[locale].copyOk);
      setNoticeTone("success");
    } catch {
      setNotice(NATIVE_STRINGS[locale].copyFailed);
      setNoticeTone("error");
    }
  }

  async function exportFit() {
    if (!selectedWorkout || !selectedWorkout.type || selectedWorkout.type === "easy") return;
    try {
      const bytes = createWorkoutFit(week, selectedWorkout, locale);
      let binary = "";
      for (let start = 0; start < bytes.length; start += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(start, Math.min(start + 0x8000, bytes.length)));
      const base64 = btoa(binary);
      const name = `${weekdayName(locale, selectedWorkout.day, "short").toLowerCase()}-run-week-${week.number}-${selectedWorkout.type}.fit`;
      const uri = `${FileSystem.cacheDirectory ?? ""}${name}`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (!(await Sharing.isAvailableAsync())) throw new Error(t.week.copyFailed);
      await Sharing.shareAsync(uri, { mimeType: "application/vnd.ant.fit", dialogTitle: t.week.downloadFit });
    } catch {
      setNotice(NATIVE_STRINGS[locale].fitExportFailed);
      setNoticeTone("error");
    }
  }

  function detailedLines(workout: Workout) {
    const plan = weekWorkoutSessionPlan(week, workout);
    if (!plan) return null;
    return plan.steps.map((step, index) => {
      const paces = stepPaces(step, week.profile.vdot);
      const pace = paces ? ` · ${formatPace(paces[1])}–${formatPace(paces[0])} ${t.units.perKm}` : "";
      const distance = step.distanceMeters ? ` · ${step.distanceMeters} m` : "";
      return <Text key={`${step.kind}-${index}`} style={styles.detailLine}>
        {t.steps[step.kind]} · {durationLabel(step.durationMinutes, t)}{distance}{pace}{step.fullRecovery ? ` · ${t.week.fullRecovery}` : ""}
      </Text>;
    });
  }

  return <>
    <Card>
      <View style={styles.row}>
        <Heading>{t.week.heading}</Heading>
        <Button label={t.week.copyWeek} variant="secondary" onPress={() => void copyWeek()} />
      </View>
      <Text style={styles.meta}>{formatDate(locale, week.startDate)} – {formatDate(locale, addDays(week.startDate, 6))}</Text>
      <View style={styles.metrics}>
        <Text style={styles.metric}>{t.week.weeklyTime}: {durationLabel(totalMinutes, t)}</Text>
        <Text style={styles.metric}>{t.week.estimatedWeeklyDistance}: ~{distanceText(locale, estimatedKm, t)}</Text>
        <Text style={styles.metric}>VDOT {formatDecimal(locale, week.profile.vdot)}</Text>
      </View>
      {garmin.connected && <View style={styles.garminSection}>
        <SectionTitle>{t.garmin.scope}</SectionTitle>
        <ChoiceGroup value={scope} onChange={(value) => {
          if (value === "all" || value === "workouts") setScope(value);
        }} options={[
          { value: "workouts", label: t.garmin.scopeWorkouts },
          { value: "all", label: t.garmin.scopeAll },
        ]} />
        <ButtonRow>
          <Button
            label={garmin.busy ? t.garmin.sending : t.garmin.sendWeek}
            onPress={() => void sendWorkouts("week")}
            disabled={!canSend || pendingWeekWorkouts.length === 0}
          />
          <Button label="?" accessibilityLabel={t.garmin.helpLabel} variant="secondary"
            onPress={() => setHelpVisible(true)} />
          {sentCount > 0 && <Button
            label={garmin.busy ? t.garmin.removing : t.garmin.removeWeek}
            variant="danger"
            onPress={() => confirmDelete("week")}
            disabled={garmin.busy}
          />}
        </ButtonRow>
      </View>}
      {notice ? <Notice tone={noticeTone}>{notice}</Notice> : null}
      <View accessibilityLabel={t.week.calendar} style={styles.calendar}>
        {Array.from({ length: 7 }, (_, day) => {
          const workout = week.workouts.find((item) => item.day === day);
          const date = addDays(week.startDate, day);
          const distance = workout ? estimatedWorkoutDistanceKm(workout, week.profile.vdot, week) : null;
          const isSent = garmin.sentDates.has(date);
          return <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={`${weekdayName(locale, day)} ${workout ? t.workouts[workoutLabelKey(workout.type ?? "easy")] : t.week.rest}`}
            onPress={() => { setSelectedDay(day); setEditing(false); setNotice(""); }}
            style={[styles.dayCard, workout ? { backgroundColor: backgroundColor(workout.type) } : null]}
          >
            <Text style={styles.dayName}>{weekdayName(locale, day)}</Text>
            <Text style={styles.dateText}>{formatDate(locale, date, false)}{date === todayIso() ? ` · ${t.week.today}` : ""}</Text>
            {workout ? <>
              <Text style={styles.workoutLabel}>{t.workouts[workoutLabelKey(workout.type ?? "easy")]}</Text>
              <Text style={styles.dateText}>{durationLabel(workout.durationMinutes, t)}</Text>
              {distance && <Text style={styles.dateText}>~{distanceText(locale, distance, t)}</Text>}
              {isSent && <Text style={styles.sentTag}>✓ Garmin</Text>}
            </> : <Text style={styles.restText}>{t.week.rest}</Text>}
              {!workout && isSent && <Text style={styles.sentTag}>✓ Garmin</Text>}
          </Pressable>;
        })}
      </View>
    </Card>
    <ModalSheet
      visible={selectedDay !== null}
      title={selectedDay === null ? t.week.close : `${weekdayName(locale, selectedDay)} · ${selectedDate ? formatDate(locale, selectedDate) : ""}`}
      closeLabel={t.week.close}
      onClose={() => { setSelectedDay(null); setEditing(false); }}
    >
      {!selectedWorkout ? <Text style={styles.meta}>{t.week.restDay}</Text> : editing
        ? <EditWorkoutForm key={`${week.id}-${selectedWorkout.day}-${locale}`} workout={selectedWorkout} t={t} locale={locale}
            onCancel={() => setEditing(false)}
            onSave={(workout) => { onChange(workout); setEditing(false); }} />
        : <>
        <Heading>{t.workouts[workoutLabelKey(selectedWorkout.type ?? "easy")]}</Heading>
        <Text style={styles.meta}>{durationLabel(selectedWorkout.durationMinutes, t)} · ~{distanceText(locale, estimatedWorkoutDistanceKm(selectedWorkout, week.profile.vdot, week), t)}</Text>
        {selectedWorkout.type === "easy" ? <Text style={styles.meta}>{t.week.easyNote} {t.week.estimatedEasyPace}: {formatPace(paceAtFraction(week.profile.vdot, 0.74))}–{formatPace(paceAtFraction(week.profile.vdot, 0.59))} {t.units.perKm}</Text>
          : selectedWorkout.type === "long" ? <Text style={styles.meta}>{t.week.longRunNote}</Text>
            : <View style={{ gap: 6 }}>{detailedLines(selectedWorkout)}</View>}
        {selectedWorkout.type === "repetition" && <Text style={styles.meta}>{weekWorkoutSessionPlan(week, selectedWorkout)?.steps.some((step) => step.kind === "repetition") ? t.week.repetitionNote : t.week.repetitionEasyNote}</Text>}
        <ButtonRow>
          <Button label={NATIVE_STRINGS[locale].editWorkout} variant="secondary" onPress={beginEdit} />
          {selectedWorkout.type && selectedWorkout.type !== "easy" && <Button label={t.week.downloadFit} variant="secondary" onPress={() => void exportFit()} />}
        </ButtonRow>
        {garmin.configured && garmin.connected && <>
          <Button
            label={garmin.busy ? t.garmin.sending : t.garmin.sendDay}
            onPress={() => void sendWorkouts(selectedWorkout.day)}
            disabled={garmin.busy}
          />
          {garmin.sentDates.has(addDays(week.startDate, selectedWorkout.day)) && <Button
            label={garmin.busy ? t.garmin.removing : t.garmin.removeDay}
            variant="danger"
            onPress={() => confirmDelete(selectedWorkout.day)}
            disabled={garmin.busy}
          />}
        </>}
      </>}
      {selectedDay !== null && selectedDate && garmin.configured && garmin.connected
        && garmin.sentDates.has(selectedDate) && !selectedWorkout && <Button
          label={garmin.busy ? t.garmin.removing : t.garmin.removeDay}
          variant="danger"
          onPress={() => confirmDelete(selectedDay)}
          disabled={garmin.busy}
        />}
    </ModalSheet>
    <ModalSheet visible={helpVisible} title={t.garmin.helpTitle} closeLabel={t.garmin.helpClose} onClose={() => setHelpVisible(false)}>
      {t.garmin.helpItems.map((item) => <Text style={styles.detailLine} key={item}>• {item}</Text>)}
    </ModalSheet>
  </>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { borderWidth: 1, borderColor: colors.line, borderRadius: 9, paddingVertical: 6, paddingHorizontal: 9, color: colors.ink, fontSize: 13 },
  calendar: { gap: 8 },
  dayCard: { padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: "#fff", gap: 3 },
  dayName: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  dateText: { color: colors.muted, fontSize: 12 },
  workoutLabel: { color: colors.ink, fontSize: 14, fontWeight: "600", marginTop: 4 },
  restText: { color: colors.muted, fontSize: 13, marginTop: 4 },
  sentTag: { color: colors.green, fontSize: 12, fontWeight: "700", marginTop: 4 },
  detailLine: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  garminSection: { gap: 8 },
});
