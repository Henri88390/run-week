"use client";

import { useState } from "react";
import { calculateVdot, DISTANCES, validatePerformance, validateProfile, WEEKDAYS } from "../domain";
import type { Profile, Schedule } from "../types";

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

function DistanceInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [custom, setCustom] = useState(!DISTANCES.some((distance) => distance.meters === value));
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">{label}</span>
        <select value={custom ? "custom" : value} onChange={(event) => {
          setCustom(event.target.value === "custom");
          if (event.target.value !== "custom") onChange(Number(event.target.value));
        }} className="field pr-5">
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

export function ProfileForm({ profile, onSave }: {
  profile?: Profile;
  onSave: (profile: Profile) => void;
}) {
  const [distance, setDistance] = useState(profile?.distanceMeters ?? 5000);
  const [hours, setHours] = useState(profile && profile.distanceMeters > 5000
    ? Math.floor(profile.raceSeconds / 3600).toString() : "");
  const [minutes, setMinutes] = useState(profile ? Math.floor(profile.raceSeconds % 3600 / 60).toString() : "");
  const [seconds, setSeconds] = useState(profile ? (profile.raceSeconds % 60).toString() : "");
  const [weeklyTargetMode, setWeeklyTargetMode] = useState<"distance" | "time" | "unspecified">(
    profile?.desiredWeeklyDurationMinutes != null ? "time" : profile?.recentWeeklyVolumeKm != null ? "distance" : "unspecified",
  );
  const [recentWeeklyVolume, setRecentWeeklyVolume] = useState(profile?.recentWeeklyVolumeKm?.toString() ?? "");
  const [weeklyHours, setWeeklyHours] = useState(profile?.desiredWeeklyDurationMinutes != null
    ? Math.floor(profile.desiredWeeklyDurationMinutes / 60).toString() : "");
  const [weeklyMinutes, setWeeklyMinutes] = useState(profile?.desiredWeeklyDurationMinutes != null
    ? (profile.desiredWeeklyDurationMinutes % 60).toString() : "");
  const [schedule, setSchedule] = useState<Schedule>(profile?.schedule ?? { mode: "count", count: 3 });
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const updateDistance = (value: number) => {
    setDistance(value);
    if (profile && value === profile.distanceMeters) {
      setHours(value > 5000 ? Math.floor(profile.raceSeconds / 3600).toString() : "");
      setMinutes(Math.floor(profile.raceSeconds % 3600 / 60).toString());
      setSeconds((profile.raceSeconds % 60).toString());
    } else {
      setHours("");
      setMinutes("");
      setSeconds("");
    }
  };
  const usesHours = distance > 5000;
  const raceSeconds = (usesHours ? Number(hours) * 3600 : 0) + Number(minutes) * 60 + Number(seconds);
  const draft: Profile = {
    distanceMeters: distance, raceSeconds, vdot: calculateVdot(distance, raceSeconds),
    goal: profile?.goal ?? "none", goalDistanceMeters: profile?.goalDistanceMeters ?? 5000, schedule,
    recentWeeklyVolumeKm: weeklyTargetMode === "distance" ? Number(recentWeeklyVolume) : null,
    desiredWeeklyDurationMinutes: weeklyTargetMode === "time"
      ? Number(weeklyHours) * 60 + Number(weeklyMinutes) : null,
  };
  const hoursValid = !usesHours || !hours || (/^\d+$/.test(hours) && Number(hours) <= 8);
  const minutesValid = !minutes || (/^\d+$/.test(minutes) && Number(minutes) <= 59);
  const secondsValid = !seconds || (/^\d+$/.test(seconds) && Number(seconds) <= 59);
  const timePartsValid = hoursValid && minutesValid && secondsValid;
  const raceTimeError = submitted && timePartsValid && (raceSeconds < 180 || raceSeconds > 28800)
    ? "Race time must be between 3 minutes and 8 hours."
    : "";
  const performanceError = submitted && timePartsValid && !raceTimeError && raceSeconds > 0
    ? validatePerformance(distance, raceSeconds).find((error) => error.includes("supported estimate range")) ?? ""
    : "";
  const weeklyHoursValid = weeklyTargetMode !== "time" || (/^\d+$/.test(weeklyHours) && Number(weeklyHours) <= 168);
  const weeklyMinutesValid = weeklyTargetMode !== "time" || !weeklyMinutes
    || (/^\d+$/.test(weeklyMinutes) && Number(weeklyMinutes) <= 59);
  const weeklyTargetError = submitted
    ? validateProfile(draft).find((error) => error.toLowerCase().includes("desired weekly") || error.toLowerCase().includes("choose either")) ?? ""
    : "";
  const hasChanges = !profile || !profilesMatch(profile, draft);
  return (
    <>
      <form noValidate className="mt-4 space-y-4" onSubmit={(event) => {
        event.preventDefault();
        const issues = validateProfile(draft);
        setSubmitted(true);
        if (!timePartsValid || raceSeconds < 180 || raceSeconds > 28800) issues.unshift("Enter a race time between 3 minutes and 8 hours, using whole hours, minutes, and seconds.");
        setErrors(issues);
        if (!issues.length) onSave(draft);
      }}>
        <div className="grid auto-rows-fr gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
            <h3 className="mb-2 min-h-10 text-sm font-medium">{`Recent performance distance`}</h3>
            <DistanceInput label="Recent performance distance" value={distance} onChange={updateDistance} />
          </div>
          <div className="min-w-0 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
            <h3 className="mb-2 min-h-10 text-sm font-medium">Race time ({usesHours ? "hours : minutes : seconds" : "minutes : seconds"})</h3>
            <fieldset>
              <legend className="sr-only">Race time</legend>
            <div className={`grid ${usesHours ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
              {usesHours && <label><span className="sr-only">Hours</span><input className={`field ${submitted && !hoursValid ? "border-red-600" : ""}`} aria-label="Hours" aria-invalid={submitted && !hoursValid} aria-describedby={submitted && !hoursValid ? "hours-error" : undefined} type="number" min="0" max="8" step="1" placeholder="h" value={hours} onChange={(event) => setHours(event.target.value)} /></label>}
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
          <div className="min-w-0 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
            <h3 className="mb-2 min-h-10 text-sm font-medium">Weekly target</h3>
            <fieldset className="space-y-2">
            <legend className="sr-only">Weekly target</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="weekly-target" checked={weeklyTargetMode === "distance"} onChange={() => setWeeklyTargetMode("distance")} />Distance</label>
              <label className="flex items-center gap-2"><input type="radio" name="weekly-target" checked={weeklyTargetMode === "time"} onChange={() => setWeeklyTargetMode("time")} />Time</label>
              <label className="flex items-center gap-2"><input type="radio" name="weekly-target" checked={weeklyTargetMode === "unspecified"} onChange={() => setWeeklyTargetMode("unspecified")} />Don’t specify</label>
            </div>
            {weeklyTargetMode === "distance" && <label className="block max-w-sm">
              <span className="field-label">Desired weekly distance (km, whole number)</span>
              <input className={`field ${weeklyTargetError ? "border-red-600" : ""}`} type="number" min="1" step="1" required
                value={recentWeeklyVolume} aria-invalid={Boolean(weeklyTargetError)}
                aria-describedby={weeklyTargetError ? "weekly-target-error" : undefined}
                onChange={(event) => setRecentWeeklyVolume(event.target.value)} />
            </label>}
            {weeklyTargetMode === "time" && <fieldset>
              <legend className="field-label">Desired weekly time (hours : minutes)</legend>
              <div className="grid max-w-sm grid-cols-2 gap-2">
                <label><span className="sr-only">Weekly hours</span><input className={`field ${submitted && !weeklyHoursValid ? "border-red-600" : ""}`}
                  aria-label="Weekly hours" type="number" min="0" max="168" step="1" placeholder="h" required
                  value={weeklyHours} aria-invalid={submitted && !weeklyHoursValid} onChange={(event) => setWeeklyHours(event.target.value)} /></label>
                <label><span className="sr-only">Weekly minutes</span><input className={`field ${submitted && !weeklyMinutesValid ? "border-red-600" : ""}`}
                  aria-label="Weekly minutes" type="number" min="0" max="59" step="1" placeholder="m"
                  value={weeklyMinutes} aria-invalid={submitted && !weeklyMinutesValid} onChange={(event) => setWeeklyMinutes(event.target.value)} /></label>
              </div>
              {submitted && (!weeklyHoursValid || !weeklyMinutesValid) && <p className="mt-1 text-sm text-red-700" role="alert">Enter whole hours from 0 to 168 and minutes from 0 to 59.</p>}
            </fieldset>}
            {weeklyTargetError && <span id="weekly-target-error" className="block text-sm text-red-700" role="alert">{weeklyTargetError}</span>}
            </fieldset>
          </div>
          <div className="min-w-0 rounded-xl border border-stone-200 bg-stone-50/70 p-3">
            <h3 className="mb-2 min-h-10 text-sm font-medium">Schedule</h3>
            <fieldset>
            <legend className="sr-only">Schedule</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="schedule" checked={schedule.mode === "days"} onChange={() => setSchedule({ mode: "days", days: [1, 3, 5] })} />Choose exact weekdays</label>
              <label className="flex items-center gap-2"><input type="radio" name="schedule" checked={schedule.mode === "count"} onChange={() => setSchedule({ mode: "count", count: 3 })} />Choose runs per week</label>
            </div>
            {schedule.mode === "days" ? <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-7">
              {WEEKDAYS.map((day, i) => <label key={day} className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2 text-sm ${schedule.days.includes(i) ? "border-emerald-700 bg-emerald-50" : "border-stone-300"}`}>
                <span>{day.slice(0, 3)}<span className="sr-only">{day.slice(3)}</span></span>
                <input aria-label={day} type="checkbox" checked={schedule.days.includes(i)} onChange={(event) => setSchedule({ mode: "days", days: event.target.checked ? [...schedule.days, i] : schedule.days.filter((entry) => entry !== i) })} />
              </label>)}
            </div> : <label className="mt-2 block max-w-xs"><span className="field-label">Runs per week</span>
              <select className="field pr-5" value={schedule.count} onChange={(event) => setSchedule({ mode: "count", count: Number(event.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>}
            </fieldset>
          </div>
        </div>
        {errors.length > 0 && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"><ul className="list-inside list-disc">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        <div className="flex flex-wrap gap-3">
          <button className="button-primary" type="submit" disabled={Boolean(profile && !hasChanges)}>{profile ? "Save and regenerate week" : "Create current week"}</button>
        </div>
      </form>
    </>
  );
}
