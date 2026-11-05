"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSiteGarmin } from "@/components/site-shell";
import { useI18n } from "@/features/i18n/use-i18n";
import { createPlanner, distanceLabel, generateWeek, selectDays } from "../domain";
import { useAccountPlanner } from "../use-account-planner";
import { savePlanner, usePlannerStore } from "../use-planner-store";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ProfileForm } from "./profile-form";
import { WeekView } from "./week-view";
import type { PlannerState, Profile } from "../types";

type Action = "update-setup" | "reset" | null;

export function RunningPlanner() {
  const { data: session, status: sessionStatus } = useSession();
  const userId = sessionStatus === "authenticated" ? session.user?.id ?? null : null;
  const local = usePlannerStore();
  const account = useAccountPlanner(userId);
  // Signed in, the account planner is used; the browser copy stays untouched.
  const store = userId ? account : local;
  const save = (next: PlannerState | null) => userId ? void account.save(next) : savePlanner(next);
  const { state, warning, unreadable } = store;
  const loaded = sessionStatus !== "loading" && store.loaded;
  const { t } = useI18n();
  const garmin = useSiteGarmin();
  const [action, setAction] = useState<Action>(null);
  const [notice, setNotice] = useState<"" | "cleared" | "created">("");
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  if (!loaded) return <section className="panel" role="status" aria-busy="true">{t.loading}</section>;

  const current = state?.currentWeek;
  const weeklyHours = state?.profile.desiredWeeklyDurationMinutes == null
    ? 0
    : Math.floor(state.profile.desiredWeeklyDurationMinutes / 60);
  const weeklyMinutes = state?.profile.desiredWeeklyDurationMinutes == null
    ? 0
    : state.profile.desiredWeeklyDurationMinutes % 60;
  const performanceTime = state
    ? [
      Math.floor(state.profile.raceSeconds / 3600) > 0 ? `${Math.floor(state.profile.raceSeconds / 3600)} ${t.units.h}` : "",
      `${Math.floor(state.profile.raceSeconds % 3600 / 60)} ${t.units.min}`,
      `${state.profile.raceSeconds % 60} ${t.units.sec}`,
    ].filter(Boolean).join(" ")
    : "";
  const weeklyTarget = state?.profile.recentWeeklyVolumeKm !== null && state?.profile.recentWeeklyVolumeKm !== undefined
    ? t.perWeek(`${state.profile.recentWeeklyVolumeKm} ${t.units.km}`)
    : state?.profile.desiredWeeklyDurationMinutes != null
      ? t.perWeek(`${weeklyHours > 0 ? `${weeklyHours} ${t.units.h} ` : ""}${weeklyMinutes} ${t.units.min}`)
      : null;
  const closeDialog = () => {
    setAction(null);
    setPendingProfile(null);
    setConfirmError("");
  };
  const garminSentCount = current && garmin.connected ? garmin.sentCount(current.startDate) : 0;
  const confirm = async () => {
    if (action === "reset") {
      save(null);
      setNotice("cleared");
    } else if (state && current && pendingProfile && action === "update-setup") {
      // Workouts already sent for this week would no longer match it; delete them before regenerating.
      if (garmin.connected) {
        setConfirmBusy(true);
        setConfirmError("");
        const result = await garmin.clearWeek(current.startDate);
        setConfirmBusy(false);
        if (result.error) {
          setConfirmError([
            t.confirm.regenerateGarminFailed,
            t.garmin[result.error],
            result.error === "rateLimited" && result.retryAfterSeconds !== undefined
              ? t.garmin.retryAfter(result.retryAfterSeconds) : "",
            result.requestId ? `${t.garmin.reference}: ${result.requestId}` : "",
          ].filter(Boolean).join(" "));
          return;
        }
      }
      const regenerated = generateWeek(pendingProfile, current.startDate, current.number);
      save({
        ...state,
        profile: pendingProfile,
        currentWeek: regenerated,
      });
      setNotice("");
    }
    closeDialog();
  };
  const accountLoadFailed = Boolean(userId) && account.loadFailed;

  return <div data-training-simulator className="space-y-4">
    {warning && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{t.storage[warning]}
      {accountLoadFailed && <button type="button" className="ml-2 underline" onClick={account.retry}>{t.storage.retry}</button>}
    </p>}
    <p role="status" className="text-sm text-emerald-900">{notice && t.notices[notice]}</p>
    {accountLoadFailed ? null : unreadable ? <section className="panel">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.unavailable.title}</h1>
      </div>
      <p className="mt-2 text-sm text-stone-600">{t.unavailable.body}</p>
      <button className="button-secondary mt-4" onClick={() => setAction("reset")}>{t.unavailable.reset}</button>
    </section> : <>
      <div className="relative">
        <details className="group rounded-2xl border border-stone-200 bg-white" open={!state}>
          <summary data-simulator-header className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:p-5">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
              className="size-5 shrink-0 text-stone-600">
              <path d="M4 7h3m4 0h9M4 17h9m4 0h3" />
              <circle cx="9" cy="7" r="2" /><circle cx="15" cy="17" r="2" />
            </svg>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 transition-transform group-open:rotate-180">
              <path fillRule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
            {state && <span className="text-sm text-stone-600">
              {distanceLabel(state.profile.distanceMeters, t.distances)}
            </span>}
            {state && <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-900">
              <span className="sr-only">{t.summary.performanceTime}: </span>{performanceTime}
            </span>}
            {weeklyTarget && <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-900">
              <span className="sr-only">{t.summary.weeklyTarget}: </span>{weeklyTarget}
            </span>}
            {state && <span className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium text-stone-900">
              <span className="sr-only">{t.summary.schedule}: </span>{t.runsPerWeek(selectDays(state.profile.schedule).length)}
            </span>}
          </summary>
          <div className="border-t border-stone-200 px-4 pb-4 sm:px-5 sm:pb-5">
            {/* Remount when the saved profile changes so derived race times start from the saved performance. */}
            <ProfileForm key={`${current?.id ?? "new"}:${JSON.stringify(state?.profile ?? null)}`} profile={state?.profile} onSave={(profile) => {
              if (state) {
                setPendingProfile(profile);
                setAction("update-setup");
              } else {
                save(createPlanner(profile, new Date()));
                setNotice("created");
              }
            }} />
          </div>
        </details>
      </div>
      {current && <WeekView key={current.id} week={current} garmin={garmin} />}
    </>}

    <details className="text-sm text-stone-600">
      <summary className="cursor-pointer rounded font-medium">{t.method.title}</summary>
      <div className="mt-2 space-y-2 leading-6">
        {t.method.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </details>
    <p className="text-sm text-stone-600"><Link href="/privacy" className="underline">{t.privacyLink}</Link></p>
    {action && <ConfirmationDialog title={action === "reset" ? t.confirm.resetTitle : t.confirm.regenerateTitle}
      confirmLabel={confirmBusy ? t.garmin.removing : action === "reset" ? t.confirm.resetConfirm : t.confirm.regenerateConfirm}
      cancelLabel={t.confirm.cancel} busy={confirmBusy}
      onCancel={closeDialog} onConfirm={() => void confirm()}>
      <p>{action === "reset" ? t.confirm.resetBody : t.confirm.regenerateBody}</p>
      {action === "update-setup" && garminSentCount > 0 && <p>{t.confirm.regenerateGarminBody(garminSentCount)}</p>}
      {confirmError && <p role="alert" className="text-red-700">{confirmError}</p>}
    </ConfirmationDialog>}
  </div>;
}
