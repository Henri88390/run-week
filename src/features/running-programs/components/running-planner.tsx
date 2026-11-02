"use client";

import { useState } from "react";
import { addDays, createPlanner, distanceLabel, feedbackNeedsReduction, generateWeek, goalLabel, updateFeedback, WEEKDAYS } from "../domain";
import { savePlanner, usePlannerStore } from "../use-planner-store";
import { ConfirmationDialog } from "./confirmation-dialog";
import { ProfileForm } from "./profile-form";
import { WeekView } from "./week-view";
import type { AdjustmentLevel, GenerationPreferences, Profile } from "../types";

type Action = "generate" | "update-setup" | "regenerate-current" | "advance" | "reset" | null;
const defaultGenerationPreferences: GenerationPreferences = {
  volumeAdjustment: 0,
  intensityAdjustment: 0,
  runCountAdjustment: 0,
};

function parseAdjustmentLevel(value: string): AdjustmentLevel {
  if (value === "-2") return -2;
  if (value === "-1") return -1;
  if (value === "1") return 1;
  if (value === "2") return 2;
  return 0;
}

export function RunningPlanner() {
  const { loaded, state, warning, unreadable } = usePlannerStore();
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState("current");
  const [action, setAction] = useState<Action>(null);
  const [notice, setNotice] = useState("");
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);
  const [generationPreferences, setGenerationPreferences] = useState(defaultGenerationPreferences);

  if (!loaded) return <section className="panel" role="status" aria-busy="true">Loading this browser’s saved planner…</section>;

  const currentIndex = state?.weeks.findIndex((week) => week.id === state.currentWeekId) ?? -1;
  const current = state?.weeks[currentIndex];
  const next = state?.weeks[currentIndex + 1];
  const shown = view === "current" ? current : next;
  const currentHadDifficulty = current?.workouts.some((workout) => feedbackNeedsReduction(workout.feedback)) ?? false;
  const confirm = () => {
    if (action === "reset") {
      savePlanner(null);
      setEditing(false);
      setView("current");
      setNotice("Local planner cleared.");
    } else if (state && current && pendingProfile && action === "update-setup") {
      const previous = state.weeks[currentIndex - 1];
      const regenerated = generateWeek(pendingProfile, current.startDate, previous);
      savePlanner({
        ...state,
        profile: pendingProfile,
        weeks: [...state.weeks.slice(0, currentIndex), regenerated],
      });
      setEditing(false);
      setView("current");
      setNotice("");
    } else if (state && current && action === "generate") {
      const generated = generateWeek(state.profile, addDays(current.startDate, 7), current, generationPreferences);
      savePlanner({ ...state, weeks: [...state.weeks.slice(0, currentIndex + 1), generated] });
      setNotice("Next week generated. Current week remains active.");
    } else if (state && current && action === "regenerate-current") {
      const previous = state.weeks[currentIndex - 1];
      const regenerated = generateWeek(state.profile, current.startDate, previous);
      savePlanner({
        ...state,
        weeks: [...state.weeks.slice(0, currentIndex), regenerated],
      });
      setView("current");
      setNotice("Current week regenerated. Its feedback and next-week preview were cleared.");
    } else if (state && next && action === "advance") {
      savePlanner({ ...state, currentWeekId: next.id });
      setView("current");
      setNotice("Next week is now current. The previous week is retained in history.");
    }
    setAction(null);
    setPendingProfile(null);
  };

  return <div className="space-y-6">
    {warning && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{warning}</p>}
    <p role="status" className="text-sm text-emerald-900">{notice}</p>

    {unreadable ? <section className="panel">
      <h1 className="text-xl font-semibold">Saved planner unavailable</h1>
      <p className="mt-2 text-sm text-stone-600">Reset only if you are willing to discard the saved data. You can also try another browser without changing this copy.</p>
      <button className="button-secondary mt-4" onClick={() => setAction("reset")}>Reset local data…</button>
    </section> : !state || editing ? <ProfileForm key={state ? "edit" : "new"} profile={state?.profile} onSave={(profile) => {
      if (state) {
        setPendingProfile(profile);
        setAction("update-setup");
      } else {
        savePlanner(createPlanner(profile, new Date()));
        setEditing(false);
        setView("current");
        setNotice("Current week created.");
      }
    }} onCancel={state ? () => setEditing(false) : undefined} /> : <>
      <section className="panel" aria-labelledby="profile-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 id="profile-heading" className="text-2xl font-semibold">Your running week</h1>
            <p className="mt-2 text-sm text-stone-600">{goalLabel(state.profile)}</p>
          </div>
          <button className="button-secondary" onClick={() => setEditing(true)}>Edit setup</button>
        </div>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="inline font-medium">Recent performance: </dt><dd className="inline">{distanceLabel(state.profile.distanceMeters)} in {Math.floor(state.profile.raceSeconds / 3600)}h {Math.floor(state.profile.raceSeconds % 3600 / 60)}m {state.profile.raceSeconds % 60}s</dd></div>
          {state.profile.recentWeeklyVolumeKm !== null && <div><dt className="inline font-medium">Four-week average: </dt><dd className="inline">{state.profile.recentWeeklyVolumeKm} km/week</dd></div>}
          <div><dt className="inline font-medium">Goal: </dt><dd className="inline">{goalLabel(state.profile)}</dd></div>
          <div><dt className="inline font-medium">Schedule: </dt><dd className="inline">{state.profile.schedule.mode === "count"
            ? `${state.profile.schedule.count} runs/week`
            : state.profile.schedule.days.map((day) => WEEKDAYS[day]).join(", ")}</dd></div>
        </dl>
      </section>
      <nav aria-label="Training weeks" className="flex flex-wrap items-end gap-3">
        <button aria-pressed={view === "current"} className={view === "current" ? "button-primary" : "button-secondary"} onClick={() => setView("current")}>Current week</button>
        <button aria-pressed={view === "next"} className={view === "next" ? "button-primary" : "button-secondary"} onClick={() => setView("next")}>Next week</button>
        <button className="button-secondary" onClick={() => setAction("regenerate-current")}>Regenerate current week…</button>
      </nav>
      {shown ? <WeekView key={shown.id} week={shown} status={shown.id === current?.id ? "current" : "next"}
        onFeedback={shown.id === current?.id ? (day, feedback) => {
          savePlanner(updateFeedback(state, shown.id, day, feedback));
          setNotice("Feedback updated. Generate or regenerate next week to apply it.");
        } : undefined} /> : <section className="panel">
          <h2 className="text-xl font-semibold">No next week yet</h2>
          <p className="mt-2 text-sm text-stone-600">Add feedback, then generate a preview. The current week stays active until confirmed.</p>
        </section>}
      <div className="flex flex-wrap gap-3">
        <button className="button-primary" onClick={() => {
          setGenerationPreferences(defaultGenerationPreferences);
          setAction("generate");
        }}>{next ? "Regenerate next week…" : "Generate next week…"}</button>
        <button className="button-secondary" disabled={!next} onClick={() => setAction("advance")}>End current week…</button>
      </div>
      <button className="rounded text-sm text-stone-600 underline underline-offset-4" onClick={() => setAction("reset")}>Reset profile and all local history…</button>
    </>}

    <details className="text-sm text-stone-600">
      <summary className="cursor-pointer rounded font-medium">VDOT method and limits</summary>
      <div className="mt-3 space-y-3 leading-6">
        <p>Daniels–Gilbert race-performance approximation (Jack Daniels’ VDOT): t = race time in minutes; v = metres / t. Oxygen cost = −4.60 + 0.182258v + 0.000104v². Sustainable fraction = 0.8 + 0.1894393e^(−0.012778t) + 0.2989558e^(−0.1932605t). VDOT = oxygen cost / fraction.</p>
        <p>Easy paces invert that same oxygen-cost equation at 59–74% of stored VDOT, a conventional Daniels easy-intensity range. This continuous approximation may differ from printed VDOT tables. Values are rounded only for display. Each week uses its VDOT snapshot; feedback never recalculates VDOT.</p>
        <p>A race-performance estimate is not a measured VO₂max or an assessment of safe training load. Weather, terrain, health and performance recency are not modeled. No target times or medically personalized recommendations are provided. “Improve” records a distance focus, not a promise of improvement.</p>
      </div>
    </details>
    {action && <ConfirmationDialog title={action === "reset" ? "Delete all local planner data?" : action === "advance" ? "End the current week?" : action === "regenerate-current" ? "Regenerate the current week?" : action === "update-setup" ? "Save setup and regenerate this week?" : next ? "Replace next week’s preview?" : "Generate next week?"}
      confirmLabel={action === "reset" ? "Delete local data" : action === "advance" ? "End week and advance" : action === "regenerate-current" ? "Regenerate current week" : action === "update-setup" ? "Save and regenerate" : next ? "Replace preview" : "Generate preview"}
      onCancel={() => { setAction(null); setPendingProfile(null); }} onConfirm={confirm}>
      {action === "reset" ? <p>This removes the profile, preferences, feedback, and every week saved by Run Week in this browser. This cannot be undone.</p> :
        action === "advance" ? <p>The current week and its feedback will become read-only history. The existing next-week preview becomes current, even if its dates are in the future or past. Regenerate first if feedback or setup has changed.</p> :
          action === "regenerate-current" ? <p>This replaces the current week and clears its workout feedback and any next-week preview. Previous weeks remain unchanged.</p> :
            action === "update-setup" ? <p>Saving these changes will regenerate the current week using the updated profile. This clears current-week feedback and any next-week preview. Previous weeks remain unchanged.</p> :
              action === "generate" ? <>
                <fieldset className="space-y-3 rounded-lg border border-stone-200 p-3">
                  <legend className="px-1 font-semibold">Next-week preferences</legend>
                  <label className="block">
                    <span className="text-sm font-semibold">Volume</span>
                    <input className="mt-2 block w-full accent-emerald-800" type="range" min="-2" max={currentHadDifficulty ? 0 : 2} step="1"
                      value={generationPreferences.volumeAdjustment}
                      aria-label="Weekly volume adjustment"
                      onChange={(event) => setGenerationPreferences((value) => ({
                        ...value, volumeAdjustment: parseAdjustmentLevel(event.target.value),
                      }))} />
                    <span className="grid grid-cols-5 text-center text-xs text-stone-600">
                      <span>−10%</span><span>−5%</span><span>No change</span><span>½ increase</span><span>Full increase</span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-stone-600">Increases are calculated from this week’s volume and VDOT; full increase is usually 2–30%, and about 5% near 100 km.</span>
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold">Intensity</span>
                    <input className="mt-2 block w-full accent-emerald-800" type="range" min="-2" max={currentHadDifficulty ? 0 : 2} step="1"
                      value={generationPreferences.intensityAdjustment}
                      aria-label="Workout intensity adjustment"
                      onChange={(event) => setGenerationPreferences((value) => ({
                        ...value, intensityAdjustment: parseAdjustmentLevel(event.target.value),
                      }))} />
                    <span className="grid grid-cols-5 text-center text-xs text-stone-600">
                      <span>−2 reps</span><span>−1 rep</span><span>No change</span><span>+1 rep</span><span>+2 reps</span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-stone-600">Each step changes VO₂ max reps by one or threshold work by two minutes, within the planned duration.</span>
                  </label>
                  <label className="block">
                    <span className="field-label">Runs this week</span>
                    <select className="field" value={generationPreferences.runCountAdjustment}
                      onChange={(event) => {
                        const selected = event.target.value;
                        const runCountAdjustment = selected === "1" ? 1 : selected === "-1" ? -1 : 0;
                        setGenerationPreferences((value) => ({ ...value, runCountAdjustment }));
                      }}>
                      <option value={0}>Keep schedule</option>
                      <option value={1} disabled={currentHadDifficulty || (current?.workouts.length ?? 7) >= 7}>Add one run</option>
                      <option value={-1} disabled={(current?.workouts.length ?? 1) <= 1}>Remove one run</option>
                    </select>
                  </label>
                  {currentHadDifficulty && <p className="text-xs leading-5 text-amber-900">Difficult or skipped feedback already reduces volume and prevents increases to intensity or run count for this week. You can still choose to reduce volume, intensity, or run count further.</p>}
                </fieldset>
                {next && <p>The existing next-week preview will be replaced.</p>}
              </> :
                <><p>Durations are based on VDOT, volume, workout type, and neighboring sessions. Difficult or skipped feedback reduces the next volume by 5%.</p><p>Current and historical weeks remain unchanged. Review the generated assumptions before using the plan.</p></>}
    </ConfirmationDialog>}
  </div>;
}
