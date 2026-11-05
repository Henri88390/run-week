"use client";

import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { garminDisconnectResponseSchema } from "@/features/garmin/sync-request";
import { STORAGE_KEY } from "@/features/running-programs/storage";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatInteger } from "@/features/i18n/locales";
import { PRIVACY_MESSAGES } from "../privacy-messages";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

const LOCALE_KEY = "run-week-locale";
type Confirm = "local" | "account" | null;
type Message =
  | { kind: "exported" | "exportError" | "disconnectNetwork" | "browserDeleted" | "browserError" | "accountError" | "accountNetwork" }
  | { kind: "disconnectError"; reference?: string }
  | { kind: "disconnected"; deleted: number; remaining: number };

function readLocal() {
  const planner = localStorage.getItem(STORAGE_KEY);
  let parsed: unknown = planner;
  try {
    parsed = planner === null ? null : JSON.parse(planner);
  } catch {
    // Export unreadable data as stored.
  }
  return { planner: parsed, language: localStorage.getItem(LOCALE_KEY) };
}

export function PrivacyControls() {
  const { locale } = useI18n();
  const text = PRIVACY_MESSAGES[locale].controls;
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  async function exportData() {
    setBusy(true);
    setMessage(null);
    try {
      let browser: ReturnType<typeof readLocal> | null = null;
      try {
        browser = readLocal();
      } catch {
        // Browser storage can be unavailable; the account export still applies.
      }
      let account: unknown = null;
      if (signedIn) {
        const response = await fetch("/api/account", { cache: "no-store" });
        if (!response.ok) {
          setMessage({ kind: "exportError" });
          return;
        }
        account = await response.json();
      }
      const data = { exportedAt: new Date().toISOString(), browser, account };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "run-week-data.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage({ kind: "exported" });
    } catch {
      setMessage({ kind: "exportError" });
    } finally {
      setBusy(false);
    }
  }

  async function disconnectGarmin() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/garmin/disconnect", { method: "POST" });
      const parsed = garminDisconnectResponseSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success || parsed.data.error) {
        setMessage({ kind: "disconnectError", reference: parsed.success ? parsed.data.requestId : undefined });
        return;
      }
      const { deleted, remaining } = parsed.data;
      setMessage({ kind: "disconnected", deleted, remaining });
    } catch {
      setMessage({ kind: "disconnectNetwork" });
    } finally {
      setBusy(false);
    }
  }

  function deleteLocal() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LOCALE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
      setMessage({ kind: "browserDeleted" });
    } catch {
      setMessage({ kind: "browserError" });
    }
    setConfirm(null);
  }

  async function deleteAccount() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        setMessage({ kind: "accountError" });
        setBusy(false);
        return;
      }
      await signOut({ redirectTo: "/privacy" });
    } catch {
      setMessage({ kind: "accountNetwork" });
      setBusy(false);
    }
  }

  const feedback = !message ? "" : message.kind === "disconnected"
    ? [
      text.disconnected.replace("{deleted}", formatInteger(locale, message.deleted)),
      message.remaining > 0 ? text.remaining.replace("{remaining}", formatInteger(locale, message.remaining)) : "",
      text.revoke,
    ].filter(Boolean).join(" ")
    : message.kind === "disconnectError"
      ? [text.disconnectError, message.reference ? text.reference.replace("{reference}", message.reference) : ""].filter(Boolean).join(" ")
      : text[message.kind];

  return <section className="space-y-3" aria-labelledby="data-controls">
    <h2 id="data-controls" className="text-lg font-semibold">{text.title}</h2>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="button-secondary" onClick={() => void exportData()} disabled={busy || status === "loading"}>
        {signedIn ? text.exportAccount : text.exportBrowser}
      </button>
      {signedIn && <button type="button" className="button-secondary" onClick={() => void disconnectGarmin()} disabled={busy}>
        {text.disconnect}
      </button>}
      <button type="button" className="button-secondary" onClick={() => setConfirm("local")} disabled={busy}>{text.deleteBrowserOpen}</button>
      {signedIn && <button type="button" className="button-secondary" onClick={() => setConfirm("account")} disabled={busy}>{text.deleteAccountOpen}</button>}
    </div>
    {confirm && <ConfirmationDialog title={confirm === "local" ? text.deleteBrowser : text.deleteAccount}
      confirmLabel={confirm === "local" ? text.deleteBrowser : text.deleteAccount} cancelLabel={text.cancel}
      tone="danger" busy={busy} onCancel={() => setConfirm(null)}
      onConfirm={() => { if (confirm === "local") deleteLocal(); else void deleteAccount(); }}>
      <p>{confirm === "local" ? text.confirmBrowser : text.confirmAccount}</p>
      {confirm === "account" && (message?.kind === "accountError" || message?.kind === "accountNetwork") && <p role="status">{feedback}</p>}
    </ConfirmationDialog>}
    <p role="status" className="text-sm empty:hidden">{feedback}</p>
  </section>;
}
