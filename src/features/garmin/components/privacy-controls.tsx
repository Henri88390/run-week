"use client";

import { useState } from "react";
import { STORAGE_KEY } from "@/features/running-programs/storage";
import { GARMIN_SENT_KEY } from "../privacy";

export function PrivacyControls() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function exportData() {
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        planner: JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"),
        garminSentWorkouts: JSON.parse(localStorage.getItem(GARMIN_SENT_KEY) ?? "{}"),
        language: localStorage.getItem("run-week-locale"),
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "run-week-data.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Data export downloaded. OAuth credentials are excluded.");
    } catch {
      setMessage("Could not export local data. Browser storage may be unavailable or contain unreadable data.");
    }
  }

  async function withdraw(deleteData: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/garmin/disconnect", { method: "POST" });
      if (!response.ok) {
        setMessage("Could not disconnect Garmin. No local data was deleted. Try again.");
        return;
      }
      setMessage("Garmin disconnected and local authorization cookies cleared. Revoke Run Week access in Garmin Connect settings too.");
      try {
        localStorage.removeItem(GARMIN_SENT_KEY);
        if (deleteData) {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem("run-week-locale");
        }
        window.dispatchEvent(new StorageEvent("storage", { key: null }));
        if (deleteData) setMessage("Local planner, language choice and Garmin references deleted; Garmin disconnected. Workouts already in Garmin Connect were not deleted.");
      } catch {
        setMessage("Garmin disconnected, but local browser data could not be cleared. Delete this site's data in browser settings.");
      }
      setConfirmDelete(false);
    } catch {
      setMessage("Could not disconnect Garmin. No local data was deleted. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-3" aria-labelledby="data-controls">
    <h2 id="data-controls" className="text-lg font-semibold">Your data controls</h2>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="button-secondary" onClick={exportData} disabled={busy}>Export local data</button>
      <button type="button" className="button-secondary" onClick={() => void withdraw(false)} disabled={busy}>Withdraw consent and disconnect Garmin</button>
      <button type="button" className="button-secondary" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete local data…</button>
    </div>
    {confirmDelete && <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p>This permanently deletes the planner and Garmin references from this browser and disconnects Garmin. It does not delete workouts already saved in Garmin Connect.</p>
      <div className="flex gap-2">
        <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button>
        <button type="button" className="button-primary" disabled={busy} onClick={() => void withdraw(true)}>Delete local data and disconnect</button>
      </div>
    </div>}
    <p role="status" className="text-sm empty:hidden">{message}</p>
  </section>;
}
