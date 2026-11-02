"use client";

import { useState } from "react";
import { createPlanner, distanceLabel, generateWeek, selectDays, WEEKDAYS } from "../domain";
import { savePlanner, usePlannerStore } from "../use-planner-store";
import { ConfirmationDialog } from "./confirmation-dialog";
import { ProfileForm } from "./profile-form";
import { WeekView } from "./week-view";
import type { Profile } from "../types";

type Action = "update-setup" | "reset" | null;

export function RunningPlanner() {
  const { loaded, state, warning, unreadable } = usePlannerStore();
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [notice, setNotice] = useState("");
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);

  if (!loaded) return <section className="panel" role="status" aria-busy="true">Loading this browser’s saved planner…</section>;

  const current = state?.currentWeek;
  const profile = state?.profile;
  const performanceHours = profile ? Math.floor(profile.raceSeconds / 3600) : 0;
  const performanceMinutes = profile ? Math.floor(profile.raceSeconds % 3600 / 60) : 0;
  const performanceSeconds = profile ? profile.raceSeconds % 60 : 0;
  const scheduledDays = profile ? new Set(selectDays(profile.schedule)) : new Set<number>();
  const confirm = () => {
    if (action === "reset") {
      savePlanner(null);
      setEditing(false);
      setNotice("Local planner cleared.");
    } else if (state && current && pendingProfile && action === "update-setup") {
      const regenerated = generateWeek(pendingProfile, current.startDate, current.number);
      savePlanner({
        ...state,
        profile: pendingProfile,
        currentWeek: regenerated,
      });
      setEditing(false);
      setNotice("");
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
        setNotice("Current week created.");
      }
    }} onCancel={state ? () => setEditing(false) : undefined} /> : <>
      <section className="panel" aria-label="Running setup">
        <div className="flex flex-wrap items-center gap-4">
          <dl className="flex flex-wrap items-center gap-4 text-sm">
            <div>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-950">{distanceLabel(state.profile.distanceMeters)}</span>
              <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-semibold text-stone-900">
                {performanceHours > 0 && `${performanceHours} h `}
                {performanceMinutes} min {performanceSeconds} sec
              </span>
            </dd>
          </div>
          {state.profile.recentWeeklyVolumeKm !== null && <div><dt className="sr-only">Average weekly distance</dt><dd className="font-medium">{state.profile.recentWeeklyVolumeKm} km/week</dd></div>}
          {state.profile.desiredWeeklyDurationMinutes !== null && <div><dt className="sr-only">Average weekly time</dt><dd className="font-medium">{Math.floor(state.profile.desiredWeeklyDurationMinutes / 60) > 0 && `${Math.floor(state.profile.desiredWeeklyDurationMinutes / 60)} h `}{state.profile.desiredWeeklyDurationMinutes % 60} min/week</dd></div>}
            <div>
              <ol aria-label="Scheduled running days" className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((day, index) => {
                  const isRunDay = scheduledDays.has(index);
                  return <li key={day} aria-label={`${day}: ${isRunDay ? "run" : "rest"}`}
                    className={`flex size-9 items-center justify-center rounded-lg border text-xs font-semibold ${isRunDay
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-stone-200 bg-stone-50 text-stone-500"}`}>
                    {day.slice(0, 2)}
                  </li>;
                })}
              </ol>
            </div>
          </dl>
          <button type="button" aria-label="Edit setup" title="Edit setup"
            className="ml-auto shrink-0 rounded-xl border border-stone-300 bg-white/70 p-2 text-stone-700 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
            onClick={() => setEditing(true)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 2.651 2.651M4 20l4.548-.91L19.6 8.04a1.875 1.875 0 0 0-2.652-2.652L5.896 16.44 4 20Z" />
            </svg>
          </button>
        </div>
      </section>
      {current && <WeekView key={current.id} week={current} />}
    </>}

    <details className="text-sm text-stone-600">
      <summary className="cursor-pointer rounded font-medium">VDOT method and limits</summary>
      <div className="mt-3 space-y-3 leading-6">
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
