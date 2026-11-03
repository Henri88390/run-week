"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  formatDate,
  formatDecimal,
  weekdayName,
  type Locale,
} from "@/features/i18n/locales";
import type { Messages } from "@/features/i18n/messages/en";
import { useI18n } from "@/features/i18n/use-i18n";
import {
  addDays,
  estimatedWorkoutDistanceKm,
  formatPace,
  paceAtFraction,
  stepPaces,
  workoutLabelKey,
  weekWorkoutSessionPlan,
} from "../domain";
import type { TrainingWeek } from "../types";
import type { WorkoutSessionStep } from "../domain";
import { downloadWorkoutFit } from "../fit-export";
import type { GarminConnection, GarminSendResult } from "@/features/garmin/use-garmin";
import { Dropdown } from "@/components/dropdown";

type WorkoutDetailLine = {
  key: string;
  description: string;
};

function paceRange(
  vdot: number,
  slowFraction: number,
  fastFraction: number,
  t: Messages,
): string {
  return `${formatPace(paceAtFraction(vdot, fastFraction))}–${formatPace(paceAtFraction(vdot, slowFraction))} ${t.units.perKm}`;
}

function workoutDetailLines(
  steps: WorkoutSessionStep[],
  vdot: number,
  t: Messages,
): WorkoutDetailLine[] {
  const lines: WorkoutDetailLine[] = [];
  let index = 0;

  while (index < steps.length) {
    const step = steps[index];
    if (step.kind === "repetition") {
      let repeats = 1;
      let next = index + 1;
      while (
        next + 1 < steps.length &&
        steps[next].intensity === "recovery" &&
        steps[next + 1].kind === "repetition" &&
        steps[next + 1].distanceMeters === step.distanceMeters &&
        steps[next + 1].paceSecondsPerKm === step.paceSecondsPerKm
      ) {
        repeats++;
        next += 2;
      }
      const paces = stepPaces(step, vdot);
      const recovery = steps[index + 1]?.fullRecovery
        ? `, ${t.week.fullRecovery} · ${stepDuration(steps[index + 1].durationMinutes, t)}`
        : "";
      lines.push({
        key: `${step.kind}-${index}`,
        description: `${repeats}x ${step.distanceMeters} m (${stepDuration(step.durationMinutes, t)})${paces ? ` ${t.week.atPace(`${formatPace(paces[0])} ${t.units.perKm}`)}` : ""}${recovery}`,
      });
      index = next;
      continue;
    }
    if (
      step.paceFractions &&
      (step.intensity === "interval" || step.intensity === "active")
    ) {
      const durations = [step.durationMinutes];
      const recoveries: number[] = [];
      let next = index + 1;
      while (
        next + 1 < steps.length &&
        steps[next].intensity === "recovery" &&
        steps[next + 1].kind === step.kind &&
        steps[next + 1].paceFractions?.join(",") ===
          step.paceFractions.join(",")
      ) {
        recoveries.push(steps[next].durationMinutes);
        durations.push(steps[next + 1].durationMinutes);
        next += 2;
      }

      const pace = paceRange(
        vdot,
        step.paceFractions[0],
        step.paceFractions[1],
        t,
      );
      const intervals =
        durations.length > 1 &&
        durations.every((duration) => duration === durations[0])
          ? `${durations.length}x ${t.week.compactMinutes(durations[0])}`
          : durations
              .map((duration) => t.week.compactMinutes(duration))
              .join(", ");
      const recovery =
        recoveries.length > 0 &&
        recoveries.every((duration) => duration === recoveries[0])
          ? `, ${t.week.recovery(t.week.compactMinutes(recoveries[0]))}`
          : recoveries.length > 0
            ? `, ${t.week.recoveries(recoveries.map((duration) => t.week.compactMinutes(duration)).join(", "))}`
            : "";

      lines.push({
        key: `${step.kind}-${index}`,
        description: `${intervals} ${t.week.atPace(pace)}${recovery}`,
      });
      index = next;
      continue;
    }

    const pace = step.paceFractions
      ? paceRange(vdot, step.paceFractions[0], step.paceFractions[1], t)
      : null;
    lines.push({
      key: `${step.kind}-${index}`,
      description: `${t.steps[step.kind]} · ${stepDuration(step.durationMinutes, t)}${pace ? ` ${t.week.atPace(pace)}` : step.intensity === "recovery" ? ` · ${t.week.easyEffort}` : ""}`,
    });
    index++;
  }

  function stepDuration(minutes: number, t: Messages): string {
    const seconds = Math.round(minutes * 60);
    return [
      seconds >= 60 ? `${Math.floor(seconds / 60)} ${t.units.min}` : "",
      seconds % 60 ? `${seconds % 60} ${t.units.sec}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return lines;
}

function formatDuration(totalMinutes: number, t: Messages): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [
    hours ? `${hours} ${t.units.h}` : "",
    minutes ? `${minutes} ${t.units.min}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function distanceRange(
  locale: Locale,
  min: number,
  max: number,
  t: Messages,
): string {
  return `${formatDecimal(locale, min)}–${formatDecimal(locale, max)} ${t.units.km}`;
}

function workoutCardColor(type: string | undefined): string {
  if (type === "long") return "border-sky-300 bg-sky-50";
  if (type === "vo2max" || type === "workout")
    return "border-rose-300 bg-rose-50";
  if (type === "threshold") return "border-amber-300 bg-amber-50";
  if (type === "repetition") return "border-violet-300 bg-violet-50";
  return "border-emerald-300 bg-emerald-50";
}

export function WeekView({ week, garmin }: { week: TrainingWeek; garmin: GarminConnection }) {
  const { locale, t } = useI18n();
  const headingId = useId();
  const dialogTitleId = useId();
  const workoutDialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [garminScope, setGarminScope] = useState<"workouts" | "all">(
    "workouts",
  );
  const [garminSending, setGarminSending] = useState<"week" | number | null>(
    null,
  );
  const [garminResult, setGarminResult] = useState<{
    target: "week" | number;
    message: string;
  } | null>(null);
  const vdot = week.profile.vdot;
  const total = week.workouts.reduce(
    (sum, workout) => sum + workout.durationMinutes,
    0,
  );
  const minKm = (total * 60) / paceAtFraction(vdot, 0.59);
  const maxKm = (total * 60) / paceAtFraction(vdot, 0.74);
  const easyPace = paceRange(vdot, 0.59, 0.74, t);
  const selectedWorkout = week.workouts.find(
    (workout) => workout.day === selectedDay,
  );
  const selectedSessionPlan = selectedWorkout?.type
    ? weekWorkoutSessionPlan(week, selectedWorkout)
    : null;
  const sessionDetailLines = selectedSessionPlan
    ? workoutDetailLines(selectedSessionPlan.steps, vdot, t)
    : null;
  const selectedDistance = selectedWorkout
    ? estimatedWorkoutDistanceKm(selectedWorkout, vdot, week)
    : null;
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(
    null,
  );

  useEffect(() => {
    if (!copyStatus) return;
    const timeout = window.setTimeout(() => setCopyStatus(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  function weekAsText(): string {
    const lines = [
      `${formatDate(locale, week.startDate, false)} – ${formatDate(locale, addDays(week.startDate, 6), false)}`,
      `${formatDuration(total, t)} · ~${distanceRange(locale, minKm, maxKm, t)}`,
    ];
    for (let day = 0; day < 7; day++) {
      const workout = week.workouts.find((entry) => entry.day === day);
      const date = `${weekdayName(locale, day)} ${formatDate(locale, addDays(week.startDate, day), false)}`;
      if (!workout) continue;
      lines.push("");
      const distance = estimatedWorkoutDistanceKm(workout, vdot, week);
      lines.push(
        `${date}: ${workout.durationMinutes} ${t.units.min} · ${t.workouts[workoutLabelKey(workout.type ?? "easy")]}${distance ? ` · ~${distanceRange(locale, distance.min, distance.max, t)}` : ""}`,
      );
      const plan =
        workout.type && workout.type !== "easy" && workout.type !== "long"
          ? weekWorkoutSessionPlan(week, workout)
          : null;
      if (plan)
        lines.push(
          ...workoutDetailLines(plan.steps, vdot, t).map(
            (step) => `- ${step.description}`,
          ),
        );
      else lines.push(`- ${easyPace}`);
      if (workout.type === "repetition")
        lines.push(
          `- ${
            plan?.steps.some((step) => step.kind === "repetition")
              ? t.week.repetitionNote
              : t.week.repetitionEasyNote
          }`,
        );
    }
    return lines.join("\n");
  }

  async function copyWeek() {
    try {
      await navigator.clipboard.writeText(weekAsText());
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  function garminMessage({ count, error, requestId, retryAfterSeconds }: GarminSendResult): string {
    const sent = count > 0 ? `${t.garmin.sent}: ${count}.` : "";
    const reference = error && requestId ? `${t.garmin.reference}: ${requestId}` : "";
    const retry = error === "rateLimited" && retryAfterSeconds !== undefined
      ? t.garmin.retryAfter(retryAfterSeconds) : "";
    return [sent, error ? t.garmin[error] : "", retry, reference].filter(Boolean).join(" ");
  }

  async function sendToGarmin(target: "week" | number) {
    const workouts =
      target === "week"
        ? week.workouts.filter(
            (workout) =>
              garminScope === "all" ||
              (workout.type && workout.type !== "easy"),
          )
        : week.workouts.filter((workout) => workout.day === target);
    if (workouts.length === 0) {
      setGarminResult({ target, message: t.garmin.nothingToSend });
      return;
    }
    setGarminSending(target);
    setGarminResult(null);
    const result = await garmin.send(week, workouts, locale);
    setGarminSending(null);
    setGarminResult({ target, message: garminMessage(result) });
  }

  useEffect(() => {
    if (selectedDay === null) return;
    const opener = document.activeElement;
    const dialog = workoutDialog.current;
    dialog?.showModal();
    closeButton.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [selectedDay]);

  return (
    <section className="panel" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 id={headingId} className="sr-only">
          {t.week.heading}
        </h2>
        <div className="flex flex-wrap gap-2">
          <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm">
            <span className="sr-only">{t.week.weeklyTime}: </span>
            {formatDuration(total, t)}
          </p>
          <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm">
            <span className="sr-only">{t.week.estimatedWeeklyDistance}: </span>~
            {distanceRange(locale, minKm, maxKm, t)}
            <span className="sr-only"> {t.week.basedOnEasyPace}</span>
          </p>
          <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm">
            VDOT {formatDecimal(locale, vdot)}
            <span className="sr-only"> {t.week.atGeneration}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p role="status" className="text-sm text-stone-600">
            {copyStatus === "copied"
              ? t.week.copied
              : copyStatus === "failed"
                ? t.week.copyFailed
                : ""}
          </p>
          <button
            type="button"
            aria-label={t.week.copyWeek}
            title={t.week.copyWeek}
            onClick={copyWeek}
            className="rounded-lg border border-stone-200 bg-white p-2 text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-5"
            >
              <rect x="8" y="8" width="12" height="13" rx="2" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2"
              />
            </svg>
          </button>
        </div>
      </div>
      <ol
        aria-label={t.week.calendar}
        className="mt-4 grid auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-4 lg:grid-cols-7"
      >
        {Array.from({ length: 7 }, (_, i) => {
          const workout = week.workouts.find((entry) => entry.day === i);
          const workoutDistance = workout
            ? estimatedWorkoutDistanceKm(workout, vdot, week)
            : null;
          const calendarDate = addDays(week.startDate, i);
          const isToday = calendarDate === today;
          const dayName = weekdayName(locale, i);
          const dayHeader = (
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>
                <span aria-hidden="true">
                  {weekdayName(locale, i, "short")}
                </span>
                <span className="sr-only">{dayName}</span>
              </span>
              {isToday && (
                <span className="text-xs font-semibold text-emerald-800">
                  {t.week.today}
                </span>
              )}
            </span>
          );
          return (
            <li
              key={i}
              aria-current={isToday ? "date" : undefined}
              className={`rounded-lg border ${workout ? workoutCardColor(workout.type) : "border-stone-200 bg-stone-50"} ${isToday ? "ring-2 ring-emerald-700 ring-offset-1" : ""}`}
            >
              {workout ? (
                <button
                  type="button"
                  aria-label={`${dayName}, ${formatDate(locale, calendarDate)}: ${t.week.minutesLong(workout.durationMinutes)}, ${t.workouts[workoutLabelKey(workout.type ?? "easy")]}`}
                  onClick={() => setSelectedDay(i)}
                  className="flex h-full min-h-24 w-full flex-col rounded-lg p-2.5 text-left hover:bg-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
                >
                  {dayHeader}
                  <span className="mt-1.5 block text-sm">
                    {workout.durationMinutes} {t.units.min} ·{" "}
                    {t.workouts[workoutLabelKey(workout.type ?? "easy")]}
                  </span>
                  {workoutDistance && (
                    <span className="mt-auto block pt-1 text-xs text-stone-600">
                      ~
                      {distanceRange(
                        locale,
                        workoutDistance.min,
                        workoutDistance.max,
                        t,
                      )}
                    </span>
                  )}
                </button>
              ) : (
                <div className="min-h-20 rounded-lg p-2.5">
                  {dayHeader}
                  <span className="mt-1.5 block text-sm">{t.week.rest}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {garmin.configured && garmin.connected && (
        <div className="mt-4 border-t border-stone-200 pt-4">
          {garmin.configured &&
            (garmin.connected ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-48 flex-1 sm:flex-none">
                  <span className="field-label">{t.garmin.scope}</span>
                  <Dropdown
                    className="field"
                    aria-label={t.garmin.scope}
                    value={garminScope}
                    onChange={(value) => {
                      if (value === "workouts" || value === "all") setGarminScope(value);
                    }}
                    options={[
                      { value: "workouts", label: t.garmin.scopeWorkouts, text: t.garmin.scopeWorkouts },
                      { value: "all", label: t.garmin.scopeAll, text: t.garmin.scopeAll },
                    ]}
                  />
                </label>
                <button
                  type="button"
                  className="button-primary"
                  disabled={garminSending !== null}
                  onClick={() => sendToGarmin("week")}
                >
                  {garminSending === "week"
                    ? t.garmin.sending
                    : t.garmin.sendWeek}
                </button>
              </div>
            ) : (
              <a href="/api/garmin/connect" className="button-secondary">
                {t.garmin.connect}
              </a>
            ))}
          <p role="status" className="mt-2 break-words text-sm text-stone-600 empty:hidden">
            {garminResult?.target === "week"
              ? garminResult.message
              : ""}
          </p>
        </div>
      )}
      {selectedDay !== null && (
        <dialog
          ref={workoutDialog}
          aria-labelledby={dialogTitleId}
          onCancel={(event) => {
            event.preventDefault();
            setSelectedDay(null);
          }}
          onClick={(event) => {
            if (event.target === workoutDialog.current) setSelectedDay(null);
          }}
          className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-stone-300 bg-white p-6 text-stone-900 shadow-xl backdrop:bg-stone-950/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={dialogTitleId} className="text-xl font-semibold">
                {weekdayName(locale, selectedDay)} ·{" "}
                {formatDate(locale, addDays(week.startDate, selectedDay))}
              </h2>
              {selectedWorkout && (
                <p className="mt-2 text-sm text-stone-600">
                  {t.week.minutesLong(selectedWorkout.durationMinutes)} ·{" "}
                  {t.workouts[workoutLabelKey(selectedWorkout.type ?? "easy")]}
                </p>
              )}
              {selectedDistance && (
                <p className="mt-2 inline-flex rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium">
                  <span className="sr-only">{t.week.estimatedDistance}: </span>~
                  {distanceRange(
                    locale,
                    selectedDistance.min,
                    selectedDistance.max,
                    t,
                  )}
                </p>
              )}
            </div>
            <button
              ref={closeButton}
              type="button"
              aria-label={t.week.close}
              className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
              onClick={() => setSelectedDay(null)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="size-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m6 6 12 12M18 6 6 18"
                />
              </svg>
            </button>
          </div>
          {selectedWorkout ? (
            <>
              {selectedWorkout.type === undefined ||
              selectedWorkout.type === "easy" ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-emerald-900">
                    {t.week.easyNote}
                  </p>
                  <p className="text-sm text-stone-600">
                    {t.week.estimatedEasyPace}: {easyPace}
                  </p>
                </div>
              ) : selectedWorkout.type === "long" ? (
                <div className="mt-4">
                  <p className="text-sm font-medium text-emerald-900">
                    {easyPace}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {t.week.longRunNote}
                  </p>
                </div>
              ) : (
                sessionDetailLines && (
                  <ol aria-label={t.week.steps} className="mt-4 space-y-2">
                    {sessionDetailLines.map((step) => (
                      <li
                        key={step.key}
                        className="border-b border-stone-100 pb-2 text-sm last:border-0"
                      >
                        {step.description}
                      </li>
                    ))}
                  </ol>
                )
              )}
              <div className="mt-6 flex flex-wrap gap-2 empty:hidden">
                {selectedWorkout.type === "repetition" && (
                  <p className="mt-3 text-sm leading-6 text-stone-600">
                    {selectedSessionPlan?.steps.some(
                      (step) => step.kind === "repetition",
                    )
                      ? t.week.repetitionNote
                      : t.week.repetitionEasyNote}
                  </p>
                )}
                {selectedWorkout.type && selectedWorkout.type !== "easy" && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
                    onClick={() =>
                      downloadWorkoutFit(week, selectedWorkout, locale)
                    }
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="size-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3"
                      />
                    </svg>
                    {t.week.downloadFit}
                  </button>
                )}
                {garmin.configured && garmin.connected && (
                  <button
                    type="button"
                    disabled={garminSending !== null}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 disabled:cursor-not-allowed disabled:text-stone-500"
                    onClick={() => sendToGarmin(selectedWorkout.day)}
                  >
                    {garminSending === selectedWorkout.day
                      ? t.garmin.sending
                      : t.garmin.sendDay}
                  </button>
                )}
              </div>
              {garminResult?.target === selectedWorkout.day && (
                <p
                  role="status"
                  className="mt-2 break-words text-sm text-stone-600 empty:hidden"
                >
                  {garminResult?.target === selectedWorkout.day
                    ? garminResult.message
                    : ""}
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-stone-600">{t.week.restDay}</p>
          )}
        </dialog>
      )}
    </section>
  );
}
