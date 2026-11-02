"use client";

import { useEffect, useId, useRef, useState } from "react";
import { addDays, easyPace, paceAtFraction, WEEKDAYS, workoutLabel, workoutSessionDetails } from "../domain";
import type { TrainingWeek } from "../types";
import { downloadWorkoutFit } from "../fit-export";

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
  const selectedSessionDetails = selectedWorkout?.type
    ? workoutSessionDetails(selectedWorkout.type, week.profile.vdot, selectedWorkout.durationMinutes,
      selectedWorkout.intensityAdjustment ?? (selectedWorkout.intensityIncreased ? 1 : selectedWorkout.intensityDecreased ? -1 : 0))
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
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
          <span className="sr-only">Weekly time: </span>{formatDuration(total)}
        </p>
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
          <span className="sr-only">Estimated weekly distance: </span>~{distanceEstimate}
          <span className="sr-only"> based on the VDOT easy pace range</span>
        </p>
        <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
          VDOT {week.profile.vdot.toFixed(1)}
          <span className="sr-only"> at generation</span>
        </p>
      </div>
    </div>
    <ol aria-label="Week calendar" className="mt-6 grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {WEEKDAYS.map((day, i) => {
        const workout = week.workouts.find((entry) => entry.day === i);
        const isToday = addDays(week.startDate, i) === today;
        const calendarDate = addDays(week.startDate, i);
        return <li key={day} aria-current={isToday ? "date" : undefined}
          className={`rounded-lg border ${workout ? workoutCardColor(workout.type) : "border-stone-200 bg-stone-50"} ${isToday ? "ring-2 ring-emerald-700 ring-offset-1" : ""}`}>
          {workout ? <button type="button"
            aria-label={`${day}, ${dateLabel(calendarDate)}: ${workout.durationMinutes} minutes, ${workoutLabel(workout.type ?? "easy")}`}
            onClick={() => setSelectedDay(i)}
            className="block min-h-24 w-full rounded-lg p-3 text-left hover:bg-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700">
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>{day.slice(0, 3)}<span className="sr-only">{day.slice(3)}</span></span>
              {isToday && <span className="text-xs font-semibold text-emerald-800">Today</span>}
            </span>
            <span className="mt-2 block text-sm">{workout.durationMinutes} min · {workoutLabel(workout.type ?? "easy")}</span>
          </button> : <div className="min-h-24 rounded-lg p-3">
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>{day.slice(0, 3)}<span className="sr-only">{day.slice(3)}</span></span>
              {isToday && <span className="text-xs font-semibold text-emerald-800">Today</span>}
            </span>
            <span className="mt-2 block text-sm">Rest</span>
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
          <p className="mt-4 text-sm leading-6 text-stone-600">Run at a comfortable, conversational effort.</p> :
          selectedWorkout.type === "long" ?
          <div className="mt-4">
            <p className="text-sm font-medium text-emerald-900">{easyPace(week.profile.vdot)}</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">Estimated pace; adjust or skip if uncomfortable.</p>
          </div> :
          <p className="mt-4 text-sm leading-6 text-stone-600">{selectedSessionDetails ?? "Session details are not defined."}</p>}
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
