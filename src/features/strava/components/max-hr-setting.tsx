"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatInteger } from "@/features/i18n/locales";
import { PRESET_MAX_HR } from "../analytics";
import { HEART_RATE_MESSAGES } from "../heart-rate-messages";
import { MAX_HR_MESSAGES } from "../max-hr-messages";
import { ACTIVITY_QUERY_KEY } from "./activity-query";
import { rememberSavedMaxHr } from "./max-hr-freshness";

/** Account-wide HRmax: saving or resetting recomputes every zone on the server. */
export function MaxHrSetting({ value, custom }: { value: number; custom: boolean }) {
  const { locale } = useI18n();
  const text = MAX_HR_MESSAGES[locale];
  const router = useRouter();
  const queries = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [status, setStatus] = useState<"saved" | "restored" | null>(null);
  const [error, setError] = useState<"invalid" | "failed" | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const inputId = useId(), errorId = useId(), hintId = useId();
  const pending = busy || refreshing;

  function close() {
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => editButton.current?.focus());
  }
  async function save(maxHr: number | null) {
    setBusy(true); setError(null); setStatus(null);
    try {
      const response = await fetch("/api/strava/settings", {
        method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxHr }), signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(String(response.status));
      rememberSavedMaxHr(maxHr === null ? { value: PRESET_MAX_HR, custom: false } : { value: maxHr, custom: true });
      // Invalidate rather than remove, so pages kept for back/forward navigation refetch too.
      void queries.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
      setStatus(maxHr === null ? "restored" : "saved");
      if (editing) close();
      startRefresh(() => router.refresh());
    } catch { setError("failed"); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = Number(draft.trim());
    if (!/^\d+$/.test(draft.trim()) || next < 60 || next > 240) { setError("invalid"); return; }
    void save(next);
  }

  return <div data-max-hr-setting className="space-y-2 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <span data-max-hr={value} className="font-semibold tabular-nums">
        {text.short}: {formatInteger(locale, value)} bpm
      </span>
      <span data-max-hr-source={custom ? "custom" : "preset"}
        className={`rounded-full border px-2 py-0.5 text-xs ${custom ? "border-rose-300 bg-rose-50 text-rose-900" : "border-stone-300 bg-stone-100 text-stone-700"}`}>
        {custom ? text.custom : text.preset}
      </span>
      {!editing && <button ref={editButton} type="button" aria-label={text.editLabel} disabled={busy}
        onClick={() => { setDraft(String(value)); setStatus(null); setError(null); setEditing(true); }}
        className="button-secondary min-h-9 rounded-full px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2">
        {text.edit}
      </button>}
      {!editing && custom && <button type="button" disabled={pending} onClick={() => void save(null)}
        className="min-h-9 rounded-full px-2 py-1 text-xs text-stone-600 underline underline-offset-2 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">
        {text.reset(formatInteger(locale, PRESET_MAX_HR))}
      </button>}
    </div>
    {editing && <form noValidate onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label htmlFor={inputId} className="grid gap-1 text-xs text-stone-600">
        {HEART_RATE_MESSAGES[locale].maxHr}
        <input id={inputId} type="number" inputMode="numeric" min={60} max={240} step={1} required autoFocus
          value={draft} onChange={(event) => { setDraft(event.target.value); setError(null); }}
          onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
          aria-invalid={error === "invalid"} aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
          className="field w-28 tabular-nums" />
      </label>
      <button type="submit" disabled={pending} className="button-primary min-h-10 rounded-full">{text.save}</button>
      <button type="button" disabled={busy} onClick={close} className="button-secondary min-h-10 rounded-full">{text.cancel}</button>
    </form>}
    <p id={hintId} className="text-xs text-stone-500">{text.hint}</p>
    {error && <p id={errorId} role="alert" className="text-xs text-red-700">{error === "invalid" ? text.invalid : text.failed}</p>}
    <p role="status" className="text-xs text-stone-600">{status && !pending ? (status === "saved" ? text.saved : text.restored) : ""}</p>
  </div>;
}
