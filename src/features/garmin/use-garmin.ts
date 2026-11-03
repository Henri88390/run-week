"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/features/i18n/locales";
import type { TrainingWeek, Workout } from "@/features/running-programs/types";
import {
  GARMIN_ERRORS, garminDeleteResponseSchema, garminSentResponseSchema, garminStatusSchema,
  garminSyncResponseSchema,
  type GarminDeleteRequest, type GarminErrorCode, type GarminStatus, type GarminSyncRequest,
} from "./sync-request";

const NOTICES = [...GARMIN_ERRORS, "connected", "error", "disconnectFailed", "statusFailed"] as const;
export type GarminNotice = (typeof NOTICES)[number];
export type GarminSendResult = {
  count: number;
  /** Workouts that were already in Garmin Connect and were not sent again. */
  existing?: number;
  error?: GarminErrorCode;
  requestId?: string;
  retryAfterSeconds?: number;
};

const DISCONNECTED: GarminStatus = { configured: false, connected: false };

function isGarminNotice(value: string): value is GarminNotice {
  return NOTICES.some((notice) => notice === value);
}

/**
 * Garmin Connect state of the signed-in account. Sent workouts are recorded in the account, so
 * every tab and device reads the same state from the server.
 */
export function useGarmin(userId: string | null) {
  const [status, setStatus] = useState<GarminStatus>(DISCONNECTED);
  const [notice, setNotice] = useState<GarminNotice | null>(null);
  const [sent, setSent] = useState<{ weekStart: string; dates: ReadonlySet<string> } | null>(null);
  // Incremented by every send or removal so that an older read never overwrites newer results.
  const mutations = useRef({ generation: 0, pending: 0 });

  useEffect(() => {
    if (notice !== "error") return;
    const timeout = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("garmin");
    if (!param) return;
    url.searchParams.delete("garmin");
    window.history.replaceState(window.history.state, "", url);
    // Reading the OAuth callback result requires the browser URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isGarminNotice(param)) setNotice(param);
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/garmin/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Garmin status request failed.");
        const parsed = garminStatusSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error("Invalid Garmin status response.");
        if (active) setStatus(parsed.data);
      })
      .catch(() => { if (active && !controller.signal.aborted) setNotice("statusFailed"); });
    return () => {
      active = false;
      controller.abort();
      setSent(null);
    };
  }, [userId]);

  /** Reads which days of a week hold a workout sent from this account. Skipped while a mutation runs. */
  const loadWeek = useCallback(async (weekStart: string, signal?: AbortSignal): Promise<void> => {
    if (mutations.current.pending > 0) return;
    const generation = mutations.current.generation;
    let dates: string[];
    try {
      const response = await fetch(`/api/garmin/workouts?${new URLSearchParams({ weekStart })}`, {
        cache: "no-store", signal,
      });
      const parsed = garminSentResponseSchema.safeParse(await response.json());
      if (!parsed.success) return;
      if (parsed.data.error === "reconnect") {
        setStatus((current) => ({ ...current, connected: false }));
        return;
      }
      if (parsed.data.error) return;
      dates = parsed.data.dates;
    } catch {
      return;
    }
    if (signal?.aborted || generation !== mutations.current.generation) return;
    setSent({ weekStart, dates: new Set(dates) });
  }, []);

  const update = useCallback((weekStart: string, change: (dates: Set<string>) => void) => {
    setSent((current) => {
      const dates = new Set(current?.weekStart === weekStart ? current.dates : []);
      change(dates);
      return { weekStart, dates };
    });
  }, []);

  const mutate = useCallback(async <T>(
    request: () => Promise<Response>, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
  ): Promise<{ data: T; ok: boolean } | { error: GarminErrorCode }> => {
    mutations.current.generation++;
    mutations.current.pending++;
    try {
      let response: Response;
      try {
        response = await request();
      } catch {
        return { error: "network" };
      }
      try {
        const parsed = schema.safeParse(await response.json());
        return parsed.success ? { data: parsed.data, ok: response.ok } : { error: "invalidResponse" };
      } catch {
        return { error: "invalidResponse" };
      }
    } finally {
      mutations.current.generation++;
      mutations.current.pending--;
    }
  }, []);

  const send = useCallback(async (week: TrainingWeek, workouts: Workout[], locale: Locale): Promise<GarminSendResult> => {
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
      })),
    };
    const result = await mutate(() => fetch("/api/garmin/workouts", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), garminSyncResponseSchema);
    if ("error" in result) return { count: 0, error: result.error };
    const { data, ok } = result;
    if (!ok && !data.error) return { count: 0, error: "invalidResponse" };
    update(week.startDate, (dates) => data.results.forEach((entry) => dates.add(entry.date)));
    if (data.error === "reconnect") setStatus((current) => ({ ...current, connected: false }));
    return {
      count: data.results.filter((entry) => !entry.existing).length,
      existing: data.results.filter((entry) => entry.existing).length,
      error: data.error,
      requestId: data.requestId,
      ...(data.error === "rateLimited" && data.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: data.retryAfterSeconds } : {}),
    };
  }, [mutate, update]);

  const remove = useCallback(async (weekStart: string, dates: string[]): Promise<GarminSendResult> => {
    if (dates.length === 0) return { count: 0 };
    const body: GarminDeleteRequest = { dates };
    const result = await mutate(() => fetch("/api/garmin/workouts", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), garminDeleteResponseSchema);
    if ("error" in result) return { count: 0, error: result.error };
    const { data, ok } = result;
    if (!ok && !data.error) return { count: 0, error: "invalidResponse" };
    update(weekStart, (sentDates) => data.deleted.forEach((date) => sentDates.delete(date)));
    if (data.error === "reconnect") setStatus((current) => ({ ...current, connected: false }));
    return { count: data.deleted.length, error: data.error, requestId: data.requestId,
      ...(data.error === "rateLimited" && data.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: data.retryAfterSeconds } : {}) };
  }, [mutate, update]);

  const disconnect = useCallback(async () => {
    try {
      const response = await fetch("/api/garmin/disconnect", { method: "POST" });
      if (!response.ok) {
        setNotice("disconnectFailed");
        return;
      }
      setStatus((current) => ({ ...current, connected: false }));
      setSent(null);
      setNotice(null);
    } catch {
      setNotice("disconnectFailed");
    }
  }, []);

  const isSent = useCallback((weekStart: string, date: string) =>
    sent?.weekStart === weekStart && sent.dates.has(date), [sent]);

  const sentCount = useCallback((weekStart: string) =>
    sent?.weekStart === weekStart ? sent.dates.size : 0, [sent]);

  /** Deletes every workout of a week that this account sent to Garmin, reading the server record first. */
  const clearWeek = useCallback(async (weekStart: string): Promise<GarminSendResult> => {
    let dates: string[];
    try {
      const response = await fetch(`/api/garmin/workouts?${new URLSearchParams({ weekStart })}`, { cache: "no-store" });
      const parsed = garminSentResponseSchema.safeParse(await response.json());
      if (!parsed.success) return { count: 0, error: "invalidResponse" };
      if (parsed.data.error === "reconnect") setStatus((current) => ({ ...current, connected: false }));
      if (parsed.data.error) return { count: 0, error: parsed.data.error };
      dates = parsed.data.dates;
    } catch {
      return { count: 0, error: "network" };
    }
    return remove(weekStart, dates);
  }, [remove]);

  return {
    ...status, signedIn: userId !== null, notice, isSent, sentCount, loadWeek, send, remove, clearWeek, disconnect,
  };
}

export type GarminConnection = ReturnType<typeof useGarmin>;
