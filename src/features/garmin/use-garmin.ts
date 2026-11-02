"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/features/i18n/locales";
import { addDays } from "@/features/running-programs/domain";
import type { TrainingWeek, Workout } from "@/features/running-programs/types";
import type { GarminErrorCode, GarminStatus, GarminSyncRequest, GarminSyncResponse } from "./sync-request";

const SENT_KEY = "run-week.garmin.v1";
const NOTICES = ["connected", "error", "unavailable"] as const;
export type GarminNotice = (typeof NOTICES)[number];
export type GarminSendResult = { count: number; error?: GarminErrorCode };

function readSent(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value)
      .filter((entry): entry is [string, number] => Number.isInteger(entry[1]) && entry[1] > 0));
  } catch {
    return {};
  }
}

function writeSent(sent: Record<string, number>) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(sent));
  } catch {
    // Storage may be unavailable; replacing earlier copies is best effort.
  }
}

export function useGarmin() {
  const [status, setStatus] = useState<GarminStatus>({ configured: false, connected: false });
  const [notice, setNotice] = useState<GarminNotice | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("garmin");
    if (param) {
      url.searchParams.delete("garmin");
      window.history.replaceState(window.history.state, "", url);
      // Reading the OAuth callback result requires the browser URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if ((NOTICES as readonly string[]).includes(param)) setNotice(param as GarminNotice);
    }
    let active = true;
    fetch("/api/garmin/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<GarminStatus> : null)
      .then((value) => { if (active && value) setStatus(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const send = useCallback(async (week: TrainingWeek, workouts: Workout[], locale: Locale): Promise<GarminSendResult> => {
    const sent = readSent();
    const body: GarminSyncRequest = {
      locale,
      vdot: week.profile.vdot,
      weekStart: week.startDate,
      workouts: workouts.map((workout) => ({
        day: workout.day,
        durationMinutes: workout.durationMinutes,
        type: workout.type,
        intensityAdjustment: workout.intensityAdjustment
          ?? (workout.intensityIncreased ? 1 : workout.intensityDecreased ? -1 : 0),
        previousWorkoutId: sent[addDays(week.startDate, workout.day)],
      })),
    };
    let data: GarminSyncResponse;
    try {
      const response = await fetch("/api/garmin/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      data = await response.json() as GarminSyncResponse;
    } catch {
      return { count: 0, error: "failed" };
    }
    for (const result of data.results ?? []) sent[result.date] = result.workoutId;
    writeSent(sent);
    if (data.error === "reconnect") setStatus((current) => ({ ...current, connected: false }));
    return { count: data.results?.length ?? 0, error: data.error };
  }, []);

  const disconnect = useCallback(async () => {
    await fetch("/api/garmin/disconnect", { method: "POST" }).catch(() => undefined);
    setStatus((current) => ({ ...current, connected: false }));
  }, []);

  return { ...status, notice, send, disconnect };
}
