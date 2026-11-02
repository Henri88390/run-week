"use client";

import { useId, useState } from "react";
import { addDays, easyPace, goalLabel, paceAtFraction, WEEKDAYS, workoutLabel, workoutSessionDetails } from "../domain";
import type { Feedback, TrainingWeek } from "../types";
import { ConfirmationDialog } from "./confirmation-dialog";

export function dateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""].filter(Boolean).join(" ");
}

function FeedbackSelect<K extends keyof Feedback>({ label, field, feedback, options, onChange }: {
  label: string;
  field: K;
  feedback: Feedback;
  options: { value: NonNullable<Feedback[K]>; label: string }[];
  onChange: (feedback: Feedback) => void;
}) {
  return <label className="block">
    <span className="field-label">{label}</span>
    <select className="field" value={feedback[field] ?? ""} onChange={(event) => {
      const updated = { ...feedback };
      if (event.target.value === "") delete updated[field];
      else updated[field] = event.target.value as Feedback[K];
      onChange(updated);
    }}>
      <option value="">Not recorded</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

function FeedbackForm({ feedback, onChange }: { feedback: Feedback; onChange: (feedback: Feedback) => void }) {
  return <div className="mt-4 space-y-4">
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-semibold">Before the workout</legend>
      <FeedbackSelect label="Entry readiness" field="readiness" feedback={feedback} onChange={onChange} options={[
        { value: "ready", label: "Ready" }, { value: "tired", label: "Tired" }, { value: "unwell", label: "Unwell" },
      ]} />
      {feedback.readiness === "unwell" && <p className="text-sm text-amber-900">Do not use this generated plan to decide whether it is safe to run while unwell. The app cannot assess your health.</p>}
    </fieldset>
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-semibold">After the workout</legend>
      <FeedbackSelect label="Outcome" field="outcome" feedback={feedback} onChange={onChange} options={[
        { value: "completed", label: "Completed" }, { value: "skipped", label: "Skipped" },
      ]} />
      <FeedbackSelect label="Perceived effort" field="effort" feedback={feedback} onChange={onChange} options={[
        { value: "easy", label: "Easy" }, { value: "moderate", label: "Moderate" }, { value: "hard", label: "Hard" },
      ]} />
      <FeedbackSelect label="How strong did you feel?" field="strength" feedback={feedback} onChange={onChange} options={[
        { value: "strong", label: "Strong" }, { value: "normal", label: "Normal" }, { value: "low", label: "Low strength" },
      ]} />
      <FeedbackSelect label="Pace manageability" field="pace" feedback={feedback} onChange={onChange} options={[
        { value: "manageable", label: "Manageable" }, { value: "too-fast", label: "Too fast" }, { value: "too-slow", label: "Too slow" },
      ]} />
    </fieldset>
    <p className="text-xs text-stone-600">Saved on change. Difficult or skipped responses reduce the next generated budget; positive responses do not raise it.</p>
  </div>;
}

export function WeekView({ week, status, onFeedback }: {
  week: TrainingWeek;
  status: "current" | "next" | "history";
  onFeedback?: (day: number, feedback: Feedback) => void;
}) {
  const headingId = useId();
  const [feedbackDay, setFeedbackDay] = useState<number | null>(null);
  const total = week.workouts.reduce((sum, workout) => sum + workout.durationMinutes, 0);
  const minKm = (total * 60) / paceAtFraction(week.profile.vdot, 0.59);
  const maxKm = (total * 60) / paceAtFraction(week.profile.vdot, 0.74);
  const distanceEstimate = `${minKm.toFixed(1)}–${maxKm.toFixed(1)} km`;
  const feedbackWorkout = week.workouts.find((workout) => workout.day === feedbackDay);
  return <section className="panel" aria-labelledby={headingId}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">{status === "current" ? "Current week" : status === "next" ? "Next week · preview" : "History"}</p>
        <h2 id={headingId} className="mt-2 text-xl font-semibold">Week {week.number} · {dateLabel(week.startDate)}</h2>
        <p className="mt-2 text-sm text-stone-600">{goalLabel(week.profile)} · VDOT {week.profile.vdot.toFixed(1)} at generation</p>
      </div>
      <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm">
        {week.workouts.length} runs / {formatDuration(total)} / ~{distanceEstimate} estimated
        <span className="sr-only"> distance estimate based on the VDOT easy pace range</span>
      </p>
    </div>
    <ol aria-label="Week calendar" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {WEEKDAYS.map((day, i) => {
        const workout = week.workouts.find((entry) => entry.day === i);
        return <li key={day} className={`rounded-lg border p-3 ${workout ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-stone-50"}`}>
          <p className="text-sm font-medium">{day.slice(0, 3)}<span className="sr-only">{day.slice(3)}</span></p>
          <p className="mt-2 text-sm">{workout ? `${workout.durationMinutes} min · ${workoutLabel(workout.type ?? "easy")}` : "Rest"}</p>
        </li>;
      })}
    </ol>
    <div className="mt-6 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
      {week.workouts.map((workout) => {
        const sessionDetails = workout.type
          ? workoutSessionDetails(workout.type, week.profile.vdot, workout.durationMinutes, workout.intensityIncreased)
          : null;
        return <article key={workout.day} className="flex flex-col rounded-xl border border-stone-200 p-4">
          <h3 className="font-semibold">{WEEKDAYS[workout.day]} · {dateLabel(addDays(week.startDate, workout.day))}</h3>
          <p className="mt-2 text-sm">{workout.durationMinutes} minutes · {workoutLabel(workout.type ?? "easy")}</p>
          {(workout.type === undefined || workout.type === "easy" || workout.type === "long") ?
            <><p className="mt-1 text-sm font-medium text-emerald-900">{easyPace(week.profile.vdot)}</p>
              <p className="mt-2 text-xs leading-5 text-stone-600">Estimated pace; adjust or skip if uncomfortable.</p></> :
            sessionDetails
              ? <p className="mt-2 text-xs leading-5 text-stone-600">{sessionDetails}</p>
              : <p className="mt-2 text-xs leading-5 text-stone-600">Session details are not defined.</p>}
          {onFeedback ? <button className="mt-auto border-t border-stone-200 pt-3 text-left text-sm font-semibold"
            onClick={() => setFeedbackDay(workout.day)}>
            Workout feedback {Object.keys(workout.feedback).length ? `(${Object.keys(workout.feedback).length}/5 recorded)` : "(not recorded)"}
          </button> : <div className="mt-auto border-t border-stone-200 pt-3 text-sm text-stone-600">
            {status === "next" ? "Feedback opens when this becomes the current week." :
              <dl className="space-y-1">
                {([
                  ["readiness", "Before: readiness"], ["outcome", "After: outcome"], ["effort", "After: effort"],
                  ["strength", "After: strength"], ["pace", "After: pace"],
                ] as const).map(([field, label]) => <div key={field}><dt className="inline font-medium">{label}: </dt><dd className="inline">{workout.feedback[field]?.replace("-", " ") ?? "Not recorded"}</dd></div>)}
              </dl>}
          </div>}
        </article>;
      })}
    </div>
    {feedbackWorkout && onFeedback && <ConfirmationDialog
      title={`${WEEKDAYS[feedbackWorkout.day]} · Workout feedback`}
      confirmLabel="Done"
      onCancel={() => setFeedbackDay(null)}
      onConfirm={() => setFeedbackDay(null)}>
      <FeedbackForm feedback={feedbackWorkout.feedback}
        onChange={(feedback) => onFeedback(feedbackWorkout.day, feedback)} />
    </ConfirmationDialog>}
    <details className="mt-6 rounded-lg bg-stone-50 p-4 text-sm">
      <summary className="cursor-pointer rounded font-medium">Generation assumptions</summary>
      <p className="mt-3 leading-6 text-stone-600">{week.rationale}</p>
      <p className="mt-2 leading-6 text-stone-600">Schedule changes may create consecutive or short runs to preserve volume. Review before use.</p>
    </details>
  </section>;
}
