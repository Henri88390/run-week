"use client";

import { useEffect, useId, useRef, useState } from "react";
import { addDays, easyPace, estimatedWorkoutDistanceKm, formatPace, paceAtFraction, WEEKDAYS, workoutLabel, workoutSessionPlan } from "../domain";
import type { TrainingWeek } from "../types";
import type { WorkoutSessionStep } from "../domain";
import { downloadWorkoutFit } from "../fit-export";

type WorkoutDetailLine = {
  key: string;
  description: string;
};

function workoutDetailLines(steps: WorkoutSessionStep[], vdot: number): WorkoutDetailLine[] {
  const lines: WorkoutDetailLine[] = [];
  let index = 0;

  while (index < steps.length) {
    const step = steps[index];
    if (step.paceFractions && (step.intensity === "interval" || step.intensity === "active")) {
      const durations = [step.durationMinutes];
      const recoveries: number[] = [];
      let next = index + 1;
      while (
        next + 1 < steps.length
        && steps[next].intensity === "recovery"
        && steps[next + 1].name === step.name
        && steps[next + 1].paceFractions?.join(",") === step.paceFractions.join(",")
      ) {
        recoveries.push(steps[next].durationMinutes);
        durations.push(steps[next + 1].durationMinutes);
        next += 2;
      }

      const pace = `${formatPace(paceAtFraction(vdot, step.paceFractions[1]))}–${formatPace(paceAtFraction(vdot, step.paceFractions[0]))} min/km`;
      const intervals = durations.length > 1 && durations.every((duration) => duration === durations[0])
        ? `${durations.length}x ${durations[0]}min`
        : durations.map((duration) => `${duration}min`).join(", ");
      const recovery = recoveries.length > 0 && recoveries.every((duration) => duration === recoveries[0])
        ? `, ${recoveries[0]}min easy jog recovery`
        : recoveries.length > 0
          ? `, ${recoveries.map((duration) => `${duration}min`).join(", ")} easy jog recoveries`
          : "";

      lines.push({ key: `${step.name}-${index}`, description: `${intervals} at ${pace}${recovery}` });
      index = next;
      continue;
    }

    const pace = step.paceFractions
      ? `${formatPace(paceAtFraction(vdot, step.paceFractions[1]))}–${formatPace(paceAtFraction(vdot, step.paceFractions[0]))} min/km`
      : null;
    lines.push({
      key: `${step.name}-${index}`,
      description: `${step.name} · ${step.durationMinutes} min${pace ? ` at ${pace}` : step.intensity === "recovery" ? " · Easy effort" : ""}`,
    });
    index++;
  }

  return lines;
}

export function dateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""].filter(Boolean).join(" ");
}

function workoutCardColor(type: string | undefined): string {
  if (type === "long") return "border-sky-300 bg-sky-50";
  if (type === "vo2max") return "border-rose-300 bg-rose-50";
  if (type === "threshold") return "border-amber-300 bg-amber-50";
  if (type === "workout") return "border-violet-300 bg-violet-50";
  return "border-emerald-300 bg-emerald-50";
}

export function WeekView({ week }: {
  week: TrainingWeek;
}) {
  const headingId = useId();
  const dialogTitleId = useId();
  const workoutDialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const total = week.workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const minKm = (total * 60) / paceAtFraction(week.profile.vdot, 0.59);
  const maxKm = (total * 60) / paceAtFraction(week.profile.vdot, 0.74);
  const distanceEstimate = `${minKm.toFixed(1)}–${maxKm.toFixed(1)} km`;
  const selectedWorkout = week.workouts.find((workout) => workout.day === selectedDay);
  const selectedSessionPlan = selectedWorkout?.type
    ? workoutSessionPlan(selectedWorkout.type, week.profile.vdot, selectedWorkout.durationMinutes,
      selectedWorkout.intensityAdjustment ?? (selectedWorkout.intensityIncreased ? 1 : selectedWorkout.intensityDecreased ? -1 : 0))
    : null;
  const sessionDetailLines = selectedSessionPlan
    ? workoutDetailLines(selectedSessionPlan.steps, week.profile.vdot)
    : null;
  const selectedDistance = selectedWorkout
    ? estimatedWorkoutDistanceKm(selectedWorkout, week.profile.vdot)
    : null;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

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

  return <section className="panel" aria-labelledby={headingId}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <h2 id={headingId} className="sr-only">Weekly running plan</h2>
      <div className="flex flex-wrap gap-2">
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm">
          <span className="sr-only">Weekly time: </span>{formatDuration(total)}
        </p>
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm">
          <span className="sr-only">Estimated weekly distance: </span>~{distanceEstimate}
          <span className="sr-only"> based on the VDOT easy pace range</span>
        </p>
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm">
          VDOT {week.profile.vdot.toFixed(1)}
          <span className="sr-only"> at generation</span>
        </p>
      </div>
    </div>
    <ol aria-label="Week calendar" className="mt-4 grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {WEEKDAYS.map((day, i) => {
        const workout = week.workouts.find((entry) => entry.day === i);
        const workoutDistance = workout
          ? estimatedWorkoutDistanceKm(workout, week.profile.vdot)
          : null;
        const isToday = addDays(week.startDate, i) === today;
        const calendarDate = addDays(week.startDate, i);
        return <li key={day} aria-current={isToday ? "date" : undefined}
          className={`rounded-lg border ${workout ? workoutCardColor(workout.type) : "border-stone-200 bg-stone-50"} ${isToday ? "ring-2 ring-emerald-700 ring-offset-1" : ""}`}>
          {workout ? <button type="button"
            aria-label={`${day}, ${dateLabel(calendarDate)}: ${workout.durationMinutes} minutes, ${workoutLabel(workout.type ?? "easy")}`}
            onClick={() => setSelectedDay(i)}
            className="flex h-full min-h-24 w-full flex-col rounded-lg p-2.5 text-left hover:bg-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700">
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>{day.slice(0, 3)}<span className="sr-only">{day.slice(3)}</span></span>
              {isToday && <span className="text-xs font-semibold text-emerald-800">Today</span>}
            </span>
            <span className="mt-1.5 block text-sm">{workout.durationMinutes} min · {workoutLabel(workout.type ?? "easy")}</span>
            {workoutDistance && <span className="mt-auto block pt-1 text-xs text-stone-600">~{workoutDistance.min.toFixed(1)}–{workoutDistance.max.toFixed(1)} km</span>}
          </button> : <div className="min-h-20 rounded-lg p-2.5">
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>{day.slice(0, 3)}<span className="sr-only">{day.slice(3)}</span></span>
              {isToday && <span className="text-xs font-semibold text-emerald-800">Today</span>}
            </span>
            <span className="mt-1.5 block text-sm">Rest</span>
          </div>}
        </li>;
      })}
    </ol>
    {selectedDay !== null && <dialog ref={workoutDialog} aria-labelledby={dialogTitleId}
      onCancel={(event) => { event.preventDefault(); setSelectedDay(null); }}
      onClick={(event) => {
        if (event.target === workoutDialog.current) setSelectedDay(null);
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-stone-300 bg-white p-6 text-stone-900 shadow-xl backdrop:bg-stone-950/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id={dialogTitleId} className="text-xl font-semibold">{WEEKDAYS[selectedDay]} · {dateLabel(addDays(week.startDate, selectedDay))}</h2>
          {selectedWorkout && <p className="mt-2 text-sm text-stone-600">
            {selectedWorkout.durationMinutes} minutes · {workoutLabel(selectedWorkout.type ?? "easy")}
          </p>}
          {selectedDistance && <p className="mt-2 inline-flex rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium">
            <span className="sr-only">Estimated distance: </span>~{selectedDistance.min.toFixed(1)}–{selectedDistance.max.toFixed(1)} km
          </p>}
        </div>
        <button ref={closeButton} type="button" aria-label="Close workout details"
          className="rounded-lg p-2 text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
          onClick={() => setSelectedDay(null)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      {selectedWorkout ? <>
        {selectedWorkout.type === undefined || selectedWorkout.type === "easy" ?
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-emerald-900">Keep the effort easy and conversational; effort matters more than pace.</p>
            <p className="text-sm text-stone-600">Estimated easy pace: {easyPace(week.profile.vdot)}</p>
          </div> :
          selectedWorkout.type === "long" ?
          <div className="mt-4">
            <p className="text-sm font-medium text-emerald-900">{easyPace(week.profile.vdot)}</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">Estimated pace; adjust or skip if uncomfortable.</p>
          </div> :
          sessionDetailLines ? <ol aria-label="Workout steps" className="mt-4 space-y-2">
            {sessionDetailLines.map((step) => <li key={step.key} className="border-b border-stone-100 pb-2 text-sm last:border-0">
              {step.description}
            </li>)}
          </ol> : <p className="mt-4 text-sm leading-6 text-stone-600">Session details are not defined.</p>}
        {selectedWorkout.type && selectedWorkout.type !== "easy" && <button type="button"
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
          onClick={() => downloadWorkoutFit(week, selectedWorkout)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
          </svg>
          Download FIT workout
        </button>}
      </> : <p className="mt-4 text-sm text-stone-600">Rest day</p>}
    </dialog>}
  </section>;
}
