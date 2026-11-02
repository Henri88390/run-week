"use client";

import { useId } from "react";
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
  const total = week.workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const minKm = (total * 60) / paceAtFraction(week.profile.vdot, 0.59);
  const maxKm = (total * 60) / paceAtFraction(week.profile.vdot, 0.74);
  const distanceEstimate = `${minKm.toFixed(1)}–${maxKm.toFixed(1)} km`;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
        return <li key={day} aria-current={isToday ? "date" : undefined}
          className={`rounded-lg border p-3 ${workout ? workoutCardColor(workout.type) : "border-stone-200 bg-stone-50"} ${isToday ? "ring-2 ring-emerald-700 ring-offset-1" : ""}`}>
          <p className="flex items-center justify-between gap-2 text-sm font-medium">
            <span>{day.slice(0, 3)}<span className="sr-only">{day.slice(3)}</span></span>
            {isToday && <span className="text-xs font-semibold text-emerald-800">Today</span>}
          </p>
          <p className="mt-2 text-sm">{workout ? `${workout.durationMinutes} min · ${workoutLabel(workout.type ?? "easy")}` : "Rest"}</p>
        </li>;
      })}
    </ol>
    <div className="mt-6 grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
      {week.workouts.map((workout) => {
        const isToday = addDays(week.startDate, workout.day) === today;
        const sessionDetails = workout.type
          ? workoutSessionDetails(workout.type, week.profile.vdot, workout.durationMinutes,
            workout.intensityAdjustment ?? (workout.intensityIncreased ? 1 : workout.intensityDecreased ? -1 : 0))
          : null;
        return <article key={workout.day} aria-current={isToday ? "date" : undefined}
          className={`flex flex-col rounded-xl border p-4 ${workoutCardColor(workout.type)} ${isToday ? "ring-4 ring-emerald-700 ring-offset-2 shadow-md" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{WEEKDAYS[workout.day]} · {dateLabel(addDays(week.startDate, workout.day))}</h3>
              {isToday && <p className="mt-1 text-xs font-semibold text-emerald-800">Today</p>}
            </div>
            {workout.type && workout.type !== "easy" && <button
              type="button"
              aria-label="Download FIT workout"
              title="Download FIT workout"
              className="shrink-0 rounded-xl border border-stone-300 bg-white/70 p-2 text-stone-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
              onClick={() => downloadWorkoutFit(week, workout)}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" />
              </svg>
            </button>}
          </div>
          <p className="mt-2 text-sm">{workout.durationMinutes} minutes · {workoutLabel(workout.type ?? "easy")}</p>
          {(workout.type === undefined || workout.type === "easy") ?
            <p className="mt-2 text-xs leading-5 text-stone-600">Run at a comfortable, conversational effort.</p> :
            workout.type === "long" ?
            <><p className="mt-1 text-sm font-medium text-emerald-900">{easyPace(week.profile.vdot)}</p>
              <p className="mt-2 text-xs leading-5 text-stone-600">Estimated pace; adjust or skip if uncomfortable.</p></> :
            sessionDetails
              ? <p className="mt-2 text-xs leading-5 text-stone-600">{sessionDetails}</p>
              : <p className="mt-2 text-xs leading-5 text-stone-600">Session details are not defined.</p>}
        </article>;
      })}
    </div>
  </section>;
}
