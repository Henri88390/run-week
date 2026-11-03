"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/features/i18n/locales";
import { addDays } from "@/features/running-programs/domain";
import type { TrainingWeek, Workout } from "@/features/running-programs/types";
import {
  GARMIN_ERRORS, garminDeleteResponseSchema, garminStatusSchema, garminSyncResponseSchema,
  type GarminDeleteRequest, type GarminErrorCode, type GarminStatus, type GarminSyncRequest,
} from "./sync-request";
import { GARMIN_SENT_KEY } from "./privacy";

const SENT_KEY = GARMIN_SENT_KEY;
const NOTICES = [...GARMIN_ERRORS, "connected", "error", "disconnectFailed", "localDeleteFailed", "statusFailed"] as const;
export type GarminNotice = (typeof NOTICES)[number];
export type GarminSendResult = { count: number; error?: GarminErrorCode; requestId?: string; retryAfterSeconds?: number };

function isGarminNotice(value: string): value is GarminNotice {
  return NOTICES.some((notice) => notice === value);
}

function readSent(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value)
      .filter((entry): entry is [string, number] => /^\d{4}-\d{2}-\d{2}$/.test(entry[0])
        && typeof entry[1] === "number" && Number.isSafeInteger(entry[1]) && entry[1] > 0));
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
  const [sentWorkouts, setSentWorkouts] = useState<Record<string, number>>({});

  useEffect(() => {
    // localStorage is only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSentWorkouts(readSent());
  }, []);

  useEffect(() => {
    if (notice !== "error") return;
    const timeout = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("garmin");
    if (param) {
      url.searchParams.delete("garmin");
      window.history.replaceState(window.history.state, "", url);
      // Reading the OAuth callback result requires the browser URL.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (isGarminNotice(param)) setNotice(param);
    }
    let active = true;
    const controller = new AbortController();
    fetch("/api/garmin/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Garmin status request failed.");
        const value: unknown = await response.json();
        const parsed = garminStatusSchema.safeParse(value);
        if (!parsed.success) throw new Error("Invalid Garmin status response.");
        if (active) setStatus(parsed.data);
      })
      .catch(() => { if (active && !controller.signal.aborted) setNotice("statusFailed"); });
    return () => {
      active = false;
      controller.abort();
    };
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
    let response: Response;
    let data: ReturnType<typeof garminSyncResponseSchema.parse>;
    try {
      response = await fetch("/api/garmin/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { count: 0, error: "network" };
    }
    try {
      const value: unknown = await response.json();
      const parsed = garminSyncResponseSchema.safeParse(value);
      if (!parsed.success || (!response.ok && !parsed.data.error)) return { count: 0, error: "invalidResponse" };
      data = parsed.data;
    } catch {
      return { count: 0, error: "invalidResponse" };
    }
    for (const result of data.results) sent[result.date] = result.workoutId;
    writeSent(sent);
    setSentWorkouts({ ...sent });
    if (data.error === "reconnect") {
      setStatus((current) => ({ ...current, connected: false }));
    }
    return { count: data.results.length, error: data.error, requestId: data.requestId,
      ...(data.error === "rateLimited" && data.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: data.retryAfterSeconds } : {}) };
  }, []);

  const remove = useCallback(async (dates: string[]): Promise<GarminSendResult> => {
    const sent = readSent();
    const workoutIds = [...new Set(dates.map((date) => sent[date]).filter((id) => id !== undefined))];
    if (workoutIds.length === 0) return { count: 0 };
    const body: GarminDeleteRequest = { workoutIds };
    let response: Response;
    let data: ReturnType<typeof garminDeleteResponseSchema.parse>;
    try {
      response = await fetch("/api/garmin/workouts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { count: 0, error: "network" };
    }
    try {
      const value: unknown = await response.json();
      const parsed = garminDeleteResponseSchema.safeParse(value);
      if (!parsed.success || (!response.ok && !parsed.data.error)) return { count: 0, error: "invalidResponse" };
      data = parsed.data;
    } catch {
      return { count: 0, error: "invalidResponse" };
    }
    const deleted = new Set(data.deleted);
    const remaining = Object.fromEntries(Object.entries(sent).filter(([, id]) => !deleted.has(id)));
    writeSent(remaining);
    setSentWorkouts(remaining);
    if (data.error === "reconnect") {
      setStatus((current) => ({ ...current, connected: false }));
    }
    return { count: data.deleted.length, error: data.error, requestId: data.requestId,
      ...(data.error === "rateLimited" && data.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: data.retryAfterSeconds } : {}) };
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const response = await fetch("/api/garmin/disconnect", { method: "POST" });
      if (!response.ok) {
        setNotice("disconnectFailed");
        return;
      }

      setStatus((current) => ({ ...current, connected: false }));
      setNotice(null);
      try {
        localStorage.removeItem(SENT_KEY);
        setSentWorkouts({});
      } catch {
        setNotice("localDeleteFailed");
      }
    } catch {
      setNotice("disconnectFailed");
    }
  }, []);

  return { ...status, notice, sentWorkouts, send, remove, disconnect };
}

export type GarminConnection = ReturnType<typeof useGarmin>;
