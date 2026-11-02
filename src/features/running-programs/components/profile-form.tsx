"use client";

import { useState } from "react";
import { calculateVdot, DISTANCES, validatePerformance, validateProfile, WEEKDAYS } from "../domain";
import type { Goal, Profile, Schedule } from "../types";

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
    && a.goal === b.goal
    && a.goalDistanceMeters === b.goalDistanceMeters
    && schedulesMatch;
}

function DistanceInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [custom, setCustom] = useState(!DISTANCES.some((distance) => distance.meters === value));
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="field-label">{label}</span>
        <select value={custom ? "custom" : value} onChange={(event) => {
          setCustom(event.target.value === "custom");
          if (event.target.value !== "custom") onChange(Number(event.target.value));
        }} className="field">
          {DISTANCES.map((distance) => <option key={distance.meters} value={distance.meters}>{distance.label}</option>)}
          <option value="custom">Custom distance (metres)</option>
        </select>
      </label>
      {custom && <label className="block">
        <span className="field-label">{label}: metres (1500–42,195)</span>
        <input className="field" type="number" min="1500" max="42195" step="1" required value={Number.isNaN(value) ? "" : value}
          onChange={(event) => onChange(event.target.valueAsNumber)} />
      </label>}
    </div>
  );
}

export function ProfileForm({ profile, onSave, onCancel }: {
  profile?: Profile;
  onSave: (profile: Profile) => void;
  onCancel?: () => void;
}) {
  const [distance, setDistance] = useState(profile?.distanceMeters ?? 5000);
  const [hours, setHours] = useState(profile ? Math.floor(profile.raceSeconds / 3600).toString() : "");
  const [minutes, setMinutes] = useState(profile ? Math.floor(profile.raceSeconds % 3600 / 60).toString() : "");
  const [seconds, setSeconds] = useState(profile ? (profile.raceSeconds % 60).toString() : "");
  const [volumeUnspecified, setVolumeUnspecified] = useState(profile?.recentWeeklyVolumeKm == null);
  const [recentWeeklyVolume, setRecentWeeklyVolume] = useState(profile?.recentWeeklyVolumeKm?.toString() ?? "");
  const [goal, setGoal] = useState<Goal>(profile?.goal ?? "none");
  const [goalDistance, setGoalDistance] = useState(profile?.goalDistanceMeters ?? 5000);
  const [schedule, setSchedule] = useState<Schedule>(profile?.schedule ?? { mode: "count", count: 3 });
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const raceSeconds = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  const draft: Profile = {
    distanceMeters: distance, raceSeconds, vdot: calculateVdot(distance, raceSeconds),
    goal, goalDistanceMeters: goalDistance, schedule,
    recentWeeklyVolumeKm: volumeUnspecified ? null : Number(recentWeeklyVolume),
  };
  const hoursValid = !hours || (/^\d+$/.test(hours) && Number(hours) <= 8);
  const minutesValid = !minutes || (/^\d+$/.test(minutes) && Number(minutes) <= 59);
  const secondsValid = !seconds || (/^\d+$/.test(seconds) && Number(seconds) <= 59);
  const timePartsValid = hoursValid && minutesValid && secondsValid;
  const raceTimeError = submitted && timePartsValid && (raceSeconds < 180 || raceSeconds > 28800)
    ? "Race time must be between 3 minutes and 8 hours."
    : "";
  const performanceError = submitted && timePartsValid && !raceTimeError && raceSeconds > 0
    ? validatePerformance(distance, raceSeconds).find((error) => error.includes("supported estimate range")) ?? ""
    : "";
  const volumeError = submitted
    ? validateProfile(draft).find((error) => error.toLowerCase().includes("volume")) ?? ""
    : "";
  const hasChanges = !profile || !profilesMatch(profile, draft);
  return (
    <section className="panel" aria-labelledby="setup-heading">
      <h1 id="setup-heading" className="text-xl font-semibold">{profile ? "Edit setup" : "Set up your week"}</h1>
      <p className="mt-2 text-sm text-stone-600">Enter a recent race or comparable all-out performance.</p>
      <form noValidate className="mt-6 space-y-6" onSubmit={(event) => {
        event.preventDefault();
        const issues = validateProfile(draft);
        setSubmitted(true);
        if (!timePartsValid || raceSeconds < 180 || raceSeconds > 28800) issues.unshift("Enter a race time between 3 minutes and 8 hours, using whole hours, minutes, and seconds.");
        setErrors(issues);
        if (!issues.length) onSave(draft);
      }}>
        <div className="grid items-start gap-6 sm:grid-cols-2">
          <DistanceInput label="Recent performance distance" value={distance} onChange={setDistance} />
          <fieldset>
            <legend className="field-label">Race time (hours : minutes : seconds)</legend>
            <div className="grid grid-cols-3 gap-2">
              <label><span className="sr-only">Hours</span><input className={`field ${submitted && !hoursValid ? "border-red-600" : ""}`} aria-label="Hours" aria-invalid={submitted && !hoursValid} aria-describedby={submitted && !hoursValid ? "hours-error" : undefined} type="number" min="0" max="8" step="1" placeholder="h" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
              <label><span className="sr-only">Minutes</span><input className={`field ${submitted && !minutesValid ? "border-red-600" : ""}`} aria-label="Minutes" aria-invalid={submitted && !minutesValid} aria-describedby={submitted && !minutesValid ? "minutes-error" : undefined} type="number" min="0" max="59" step="1" placeholder="m" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
              <label><span className="sr-only">Seconds</span><input className={`field ${submitted && !secondsValid ? "border-red-600" : ""}`} aria-label="Seconds" aria-invalid={submitted && !secondsValid} aria-describedby={submitted && !secondsValid ? "seconds-error" : undefined} type="number" min="0" max="59" step="1" placeholder="s" value={seconds} onChange={(event) => setSeconds(event.target.value)} /></label>
            </div>
            {submitted && (!hoursValid || !minutesValid || !secondsValid) && <p className="mt-2 text-sm text-red-700" role="alert">
              {!hoursValid && <span id="hours-error" className="mr-3">Hours: enter a whole number from 0 to 8.</span>}
              {!minutesValid && <span id="minutes-error" className="mr-3">Minutes: enter a whole number from 0 to 59.</span>}
              {!secondsValid && <span id="seconds-error">Seconds: enter a whole number from 0 to 59.</span>}
            </p>}
            {raceTimeError && <p className="mt-2 text-sm text-red-700" role="alert">{raceTimeError}</p>}
            {performanceError && <p className="mt-2 text-sm text-red-700" role="alert">{performanceError}</p>}
          </fieldset>
        </div>
        <div className="max-w-2xl">
          <label className="block">
            <span className="field-label">Average weekly distance over the last 4 weeks (km, whole number)</span>
            <div className="flex flex-wrap items-center gap-4">
              <input className={`field max-w-sm ${volumeError ? "border-red-600" : ""}`} type="number" min="1" step="1"
                required={!volumeUnspecified} disabled={volumeUnspecified} value={recentWeeklyVolume} aria-invalid={Boolean(volumeError)}
                aria-describedby={volumeError ? "recent-volume-error" : undefined}
                onChange={(event) => setRecentWeeklyVolume(event.target.value)} />
              <span className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={volumeUnspecified} onChange={(event) => setVolumeUnspecified(event.target.checked)} />
                Don’t specify
              </span>
            </div>
            {volumeError && <span id="recent-volume-error" className="mt-1 block text-sm text-red-700">{volumeError}</span>}
          </label>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <label><span className="field-label">Goal</span>
            <select className="field" value={goal} onChange={(event) => setGoal(event.target.value as Goal)}>
              <option value="none">No specific goal</option><option value="maintain">Maintain current level</option><option value="improve">Improve selected distance</option>
            </select>
          </label>
          {goal === "improve" && <DistanceInput label="Goal distance" value={goalDistance} onChange={setGoalDistance} />}
        </div>
        <fieldset>
          <legend className="field-label">Schedule</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="schedule" checked={schedule.mode === "days"} onChange={() => setSchedule({ mode: "days", days: [1, 3, 5] })} />Choose exact weekdays</label>
            <label className="flex items-center gap-2"><input type="radio" name="schedule" checked={schedule.mode === "count"} onChange={() => setSchedule({ mode: "count", count: 3 })} />Choose runs per week</label>
          </div>
          {schedule.mode === "days" ? <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
            {WEEKDAYS.map((day, i) => <label key={day} className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-3 text-sm ${schedule.days.includes(i) ? "border-emerald-700 bg-emerald-50" : "border-stone-300"}`}>
              <span>{day.slice(0, 3)}<span className="sr-only">{day.slice(3)}</span></span>
              <input aria-label={day} type="checkbox" checked={schedule.days.includes(i)} onChange={(event) => setSchedule({ mode: "days", days: event.target.checked ? [...schedule.days, i] : schedule.days.filter((entry) => entry !== i) })} />
            </label>)}
          </div> : <label className="mt-3 block max-w-xs"><span className="field-label">Runs per week</span>
            <select className="field" value={schedule.count} onChange={(event) => setSchedule({ mode: "count", count: Number(event.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7].map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>}
        </fieldset>
        {profile && <p className="text-sm text-stone-600">Saving changes regenerates the current week after confirmation. Earlier weeks remain unchanged.</p>}
        {errors.length > 0 && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"><ul className="list-inside list-disc">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        <div className="flex flex-wrap gap-3">
          <button className="button-primary" type="submit" disabled={Boolean(profile && !hasChanges)}>{profile ? "Save setup" : "Create current week"}</button>
          {onCancel && <button className="button-secondary" type="button" onClick={onCancel}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}
