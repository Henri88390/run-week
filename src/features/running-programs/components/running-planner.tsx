"use client";

import { useState } from "react";
import { createPlanner, distanceLabel, generateWeek, selectDays } from "../domain";
import { savePlanner, usePlannerStore } from "../use-planner-store";
import { ConfirmationDialog } from "./confirmation-dialog";
import { ProfileForm } from "./profile-form";
import { WeekView } from "./week-view";
import type { Profile } from "../types";

type Action = "update-setup" | "reset" | null;

export function RunningPlanner() {
  const { loaded, state, warning, unreadable } = usePlannerStore();
  const [action, setAction] = useState<Action>(null);
  const [notice, setNotice] = useState("");
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);

  if (!loaded) return <section className="panel" role="status" aria-busy="true">Loading this browser’s saved planner…</section>;

  const current = state?.currentWeek;
  const weeklyHours = state?.profile.desiredWeeklyDurationMinutes == null
    ? 0
    : Math.floor(state.profile.desiredWeeklyDurationMinutes / 60);
  const weeklyMinutes = state?.profile.desiredWeeklyDurationMinutes == null
    ? 0
    : state.profile.desiredWeeklyDurationMinutes % 60;
  const performanceTime = state
    ? [
      Math.floor(state.profile.raceSeconds / 3600) > 0 ? `${Math.floor(state.profile.raceSeconds / 3600)} h` : "",
      `${Math.floor(state.profile.raceSeconds % 3600 / 60)} min`,
      `${state.profile.raceSeconds % 60} sec`,
    ].filter(Boolean).join(" ")
    : "";
  const weeklyTarget = state?.profile.recentWeeklyVolumeKm !== null && state?.profile.recentWeeklyVolumeKm !== undefined
    ? `${state.profile.recentWeeklyVolumeKm} km/week`
    : state?.profile.desiredWeeklyDurationMinutes != null
      ? `${weeklyHours > 0 ? `${weeklyHours} h ` : ""}${weeklyMinutes} min/week`
      : null;
  const confirm = () => {
    if (action === "reset") {
      savePlanner(null);
      setNotice("Local planner cleared.");
    } else if (state && current && pendingProfile && action === "update-setup") {
      const regenerated = generateWeek(pendingProfile, current.startDate, current.number);
      savePlanner({
        ...state,
        profile: pendingProfile,
        currentWeek: regenerated,
      });
      setNotice("");
    }
    setAction(null);
    setPendingProfile(null);
  };

  return <div className="space-y-4">
    {warning && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{warning}</p>}
    <p role="status" className="text-sm text-emerald-900">{notice}</p>

    {unreadable ? <section className="panel">
      <h1 className="text-xl font-semibold">Saved planner unavailable</h1>
      <p className="mt-2 text-sm text-stone-600">Reset only if you are willing to discard the saved data. You can also try another browser without changing this copy.</p>
      <button className="button-secondary mt-4" onClick={() => setAction("reset")}>Reset local data…</button>
    </section> : <>
      <details className="group rounded-2xl border border-stone-200 bg-white" open={!state}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:p-5">
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 transition-transform group-open:rotate-180">
            <path fillRule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
          {state && <span className="text-sm text-stone-600">
            {distanceLabel(state.profile.distanceMeters)}
          </span>}
          {state && <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-900">
            <span className="sr-only">Recent performance time: </span>{performanceTime}
          </span>}
          {weeklyTarget && <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-900">
            <span className="sr-only">Weekly target: </span>{weeklyTarget}
          </span>}
          {state && <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-900">
            <span className="sr-only">Schedule: </span>{selectDays(state.profile.schedule).length} runs/week
          </span>}
        </summary>
        <div className="border-t border-stone-200 px-4 pb-4 sm:px-5 sm:pb-5">
          <ProfileForm key={current?.id ?? "new"} profile={state?.profile} onSave={(profile) => {
            if (state) {
              setPendingProfile(profile);
              setAction("update-setup");
            } else {
              savePlanner(createPlanner(profile, new Date()));
              setNotice("Current week created.");
            }
          }} />
        </div>
      </details>
      {current && <WeekView key={current.id} week={current} />}
    </>}

    <details className="text-sm text-stone-600">
      <summary className="cursor-pointer rounded font-medium">VDOT method and limits</summary>
      <div className="mt-2 space-y-2 leading-6">
        <p>Daniels–Gilbert race-performance approximation (Jack Daniels’ VDOT): t = race time in minutes; v = metres / t. Oxygen cost = −4.60 + 0.182258v + 0.000104v². Sustainable fraction = 0.8 + 0.1894393e^(−0.012778t) + 0.2989558e^(−0.1932605t). VDOT = oxygen cost / fraction.</p>
        <p>Easy paces invert that same oxygen-cost equation at 59–74% of stored VDOT, a conventional Daniels easy-intensity range. This continuous approximation may differ from printed VDOT tables. Values are rounded only for display. The current plan uses its saved VDOT snapshot.</p>
        <p>A race-performance estimate is not a measured VO₂max or an assessment of safe training load. Weather, terrain, health and performance recency are not modeled. No target times or medically personalized recommendations are provided. “Improve” records a distance focus, not a promise of improvement.</p>
      </div>
    </details>
    {action && <ConfirmationDialog title={action === "reset" ? "Delete all local planner data?" : "Save setup and regenerate this week?"}
      confirmLabel={action === "reset" ? "Delete local data" : "Save and regenerate"}
      onCancel={() => { setAction(null); setPendingProfile(null); }} onConfirm={confirm}>
      {action === "reset" ? <p>This removes all saved profile and week data from this browser. This cannot be undone.</p> :
        <p>Saving these changes regenerates the current week using the updated profile.</p>}
    </ConfirmationDialog>}
  </div>;
}
