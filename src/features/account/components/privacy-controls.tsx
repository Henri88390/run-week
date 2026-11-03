"use client";

import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { garminDisconnectResponseSchema } from "@/features/garmin/sync-request";
import { STORAGE_KEY } from "@/features/running-programs/storage";

const LOCALE_KEY = "run-week-locale";
type Confirm = "local" | "account" | null;

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
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  async function exportData() {
    setBusy(true);
    setMessage("");
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
        if (!response.ok) throw new Error("Account export failed.");
        account = await response.json();
      }
      const data = { exportedAt: new Date().toISOString(), browser, account };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "run-week-data.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Data export downloaded. Garmin tokens are excluded.");
    } catch {
      setMessage("Could not export the data. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectGarmin() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/garmin/disconnect", { method: "POST" });
      const parsed = garminDisconnectResponseSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success || parsed.data.error) {
        const reference = parsed.success && parsed.data.requestId ? ` Reference: ${parsed.data.requestId}.` : "";
        setMessage(`Could not disconnect Garmin. Try again.${reference}`);
        return;
      }
      const { deleted, remaining } = parsed.data;
      setMessage([
        `Garmin disconnected. ${deleted} sent ${deleted === 1 ? "workout was" : "workouts were"} deleted from Garmin Connect, and the tokens and workout records were deleted from your account.`,
        remaining > 0 ? `${remaining} ${remaining === 1 ? "workout" : "workouts"} could not be deleted because Garmin no longer accepts Run Week's access; delete ${remaining === 1 ? "it" : "them"} in Garmin Connect.` : "",
        "Revoke Run Week access in Garmin Connect settings too.",
      ].filter(Boolean).join(" "));
    } catch {
      setMessage("Could not disconnect Garmin. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function deleteLocal() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LOCALE_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
      setMessage("Planner and language choice deleted from this browser.");
    } catch {
      setMessage("Could not delete browser data. Delete this site's data in browser settings.");
    }
    setConfirm(null);
  }

  async function deleteAccount() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) {
        setMessage("Could not delete the account. Try again.");
        setBusy(false);
        return;
      }
      await signOut({ redirectTo: "/privacy" });
    } catch {
      setMessage("Could not delete the account. Check your connection and try again.");
      setBusy(false);
    }
  }

  return <section className="space-y-3" aria-labelledby="data-controls">
    <h2 id="data-controls" className="text-lg font-semibold">Your data controls</h2>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="button-secondary" onClick={() => void exportData()} disabled={busy || status === "loading"}>
        {signedIn ? "Export account and browser data" : "Export browser data"}
      </button>
      {signedIn && <button type="button" className="button-secondary" onClick={() => void disconnectGarmin()} disabled={busy}>
        Withdraw consent and disconnect Garmin (deletes sent workouts from Garmin Connect)
      </button>}
      <button type="button" className="button-secondary" onClick={() => setConfirm("local")} disabled={busy}>Delete browser data…</button>
      {signedIn && <button type="button" className="button-secondary" onClick={() => setConfirm("account")} disabled={busy}>Delete account…</button>}
    </div>
    {confirm === "local" && <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p>This permanently deletes the planner and language choice saved in this browser. Account data is not affected.</p>
      <div className="flex gap-2">
        <button type="button" className="button-secondary" onClick={() => setConfirm(null)}>Cancel</button>
        <button type="button" className="button-primary" onClick={deleteLocal}>Delete browser data</button>
      </div>
    </div>}
    {confirm === "account" && <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p>This permanently deletes your account, its planner, sign-in methods, Garmin tokens and sent-workout records, and signs you out. Workouts already in Garmin Connect are not deleted; disconnect Garmin first to delete them. Data saved in this browser is not affected.</p>
      <div className="flex gap-2">
        <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
        <button type="button" className="button-primary" disabled={busy} onClick={() => void deleteAccount()}>Delete account</button>
      </div>
    </div>}
    <p role="status" className="text-sm empty:hidden">{message}</p>
  </section>;
}
