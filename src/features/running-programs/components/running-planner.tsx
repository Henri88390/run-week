"use client";

import { useState } from "react";
import Link from "next/link";
import { LanguageSelect } from "@/features/i18n/language-select";
import { useI18n } from "@/features/i18n/use-i18n";
import { createPlanner, distanceLabel, generateWeek, selectDays } from "../domain";
import { savePlanner, usePlannerStore } from "../use-planner-store";
import { ConfirmationDialog } from "./confirmation-dialog";
import { ProfileForm } from "./profile-form";
import { WeekView } from "./week-view";
import type { Profile } from "../types";

type Action = "update-setup" | "reset" | null;

export function RunningPlanner() {
  const { loaded, state, warning, unreadable } = usePlannerStore();
  const { t } = useI18n();
  const [action, setAction] = useState<Action>(null);
  const [notice, setNotice] = useState<"" | "cleared" | "created">("");
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null);

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
  const confirm = () => {
    if (action === "reset") {
      savePlanner(null);
      setNotice("cleared");
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
    {warning && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{t.storage[warning]}</p>}
    <p role="status" className="text-sm text-emerald-900">{notice && t.notices[notice]}</p>

    {unreadable ? <section className="panel">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.unavailable.title}</h1>
        <LanguageSelect />
      </div>
      <p className="mt-2 text-sm text-stone-600">{t.unavailable.body}</p>
      <button className="button-secondary mt-4" onClick={() => setAction("reset")}>{t.unavailable.reset}</button>
    </section> : <>
      <div className="relative">
        <details className="group rounded-2xl border border-stone-200 bg-white" open={!state}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl p-4 pr-44 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:p-5 sm:pr-48">
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
            <ProfileForm key={current?.id ?? "new"} profile={state?.profile} onSave={(profile) => {
              if (state) {
                setPendingProfile(profile);
                setAction("update-setup");
              } else {
                savePlanner(createPlanner(profile, new Date()));
                setNotice("created");
              }
            }} />
          </div>
        </details>
        <LanguageSelect className="absolute top-4 right-4 sm:top-5 sm:right-5" />
      </div>
      {current && <WeekView key={current.id} week={current} />}
    </>}

    <details className="text-sm text-stone-600">
      <summary className="cursor-pointer rounded font-medium">{t.method.title}</summary>
      <div className="mt-2 space-y-2 leading-6">
        {t.method.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </details>
    <p className="text-sm text-stone-600"><Link href="/privacy" className="underline">{t.privacyLink}</Link></p>
    {action && <ConfirmationDialog title={action === "reset" ? t.confirm.resetTitle : t.confirm.regenerateTitle}
      confirmLabel={action === "reset" ? t.confirm.resetConfirm : t.confirm.regenerateConfirm}
      cancelLabel={t.confirm.cancel}
      onCancel={() => { setAction(null); setPendingProfile(null); }} onConfirm={confirm}>
      <p>{action === "reset" ? t.confirm.resetBody : t.confirm.regenerateBody}</p>
    </ConfirmationDialog>}
  </div>;
}
