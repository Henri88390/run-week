"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/features/i18n/use-i18n";
import type { ActivitySummary } from "../types";
import { EFFORT_MESSAGES } from "../effort-messages";
import { PERFORMANCE_MESSAGES } from "../performance-messages";
import { STRAVA_MESSAGES } from "../messages";
import { RequestError } from "./request-error";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVITY_QUERY_KEY } from "./activity-query";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EFFORT_REMOVAL_MESSAGES } from "../effort-removal-messages";

export function MaximalEffort({ activity, removeOnly = false }: { activity: ActivitySummary; removeOnly?: boolean }) {
  const { locale, t } = useI18n();
  const text = EFFORT_MESSAGES[locale];
  const router = useRouter();
  const queries = useQueryClient();
  const helpId = useId();
  const [requests] = useState(() => new Set<AbortController>());
  const [busy, setBusy] = useState(false);
  const [maximal, setMaximal] = useState(activity.maximalEffort);
  const [error, setError] = useState(0);
  const [showError, setShowError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => () => { for (const request of requests) request.abort(); requests.clear(); }, [requests]);
  async function save(checked: boolean) {
    if (requests.size) return;
    const previous = maximal;
    setMaximal(checked);
    const controller = new AbortController();
    requests.add(controller);
    setBusy(true); setShowError(false);
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`/api/strava/activities/${encodeURIComponent(activity.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maximalEffort: checked }), signal: controller.signal,
      });
      if (!response.ok) throw new Error("Effort update failed");
      await queries.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
      setConfirming(false);
      router.refresh();
    } catch {
      if (requests.has(controller)) { setMaximal(previous); setError((value) => value + 1); setShowError(true); }
    } finally {
      clearTimeout(timer);
      if (requests.delete(controller)) setBusy(false);
    }
  }
  if (removeOnly) return <>
    <button type="button" aria-label={`${EFFORT_REMOVAL_MESSAGES[locale].title}: ${activity.name}`}
      disabled={busy} onClick={() => { setShowError(false); setConfirming(true); }}
      className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-lg text-stone-600 hover:bg-red-100 hover:text-red-800 focus-visible:outline-2 disabled:opacity-50">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />
      </svg>
    </button>
    {confirming && <ConfirmationDialog title={EFFORT_REMOVAL_MESSAGES[locale].title} tone="danger" busy={busy}
      confirmLabel={EFFORT_REMOVAL_MESSAGES[locale].title} cancelLabel={t.confirm.cancel}
      onCancel={() => setConfirming(false)} onConfirm={() => void save(false)}>
      <p className="font-semibold">{activity.name}</p>
      <p>{EFFORT_REMOVAL_MESSAGES[locale].body}</p>
      {showError && <RequestError key={error} message={STRAVA_MESSAGES[locale].error} />}
    </ConfirmationDialog>}
  </>;
  return <div className="space-y-2">
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={maximal} disabled={busy}
          onChange={(event) => void save(event.target.checked)} />
        {text.label}
      </label>
      <span className="group relative">
        <button type="button" aria-label={`${text.label} · ?`} aria-describedby={helpId}
          className="flex size-6 items-center justify-center rounded-full border border-stone-300 text-xs font-semibold text-stone-600 focus-visible:outline-2">?</button>
        <span id={helpId} role="tooltip"
          className="absolute left-1/2 top-full z-30 hidden w-64 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-stone-200 bg-white p-3 text-xs font-normal text-stone-700 shadow-lg group-hover:block group-focus-within:block">{PERFORMANCE_MESSAGES[locale].help}</span>
      </span>
    </div>
    {showError && <RequestError key={error} message={STRAVA_MESSAGES[locale].error} />}
  </div>;
}
