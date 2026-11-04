import { useCallback, useEffect, useRef, useState } from "react";
import { mobileApi, type GarminMutationResult, type GarminStatus } from "./api";
import type { Locale } from "@/features/i18n/locales";
import type { TrainingWeek, Workout } from "@/features/running-programs/types";
import { addDays } from "@/features/running-programs/domain";

type GarminSnapshot = {
  status: GarminStatus;
  sentDates: Set<string>;
  busy: boolean;
  error: string;
  loaded: boolean;
};

const EMPTY_STATUS: GarminStatus = { configured: false, connected: false, sentWorkouts: 0 };

export function useGarmin(token: string | null, weekStart: string | null) {
  const [snapshot, setSnapshot] = useState<GarminSnapshot>({
    status: EMPTY_STATUS, sentDates: new Set(), busy: false, error: "", loaded: false,
  });
  const generation = useRef(0);
  const latest = useRef(snapshot);
  latest.current = snapshot;

  const refresh = useCallback(async () => {
    if (!token) {
      setSnapshot({ status: EMPTY_STATUS, sentDates: new Set(), busy: false, error: "", loaded: true });
      return;
    }
    const requestId = ++generation.current;
    setSnapshot((current) => ({ ...current, loaded: false }));
    try {
      const status = await mobileApi.garminStatus(token);
      const sentDates = weekStart && status.connected
        ? new Set(await mobileApi.sentWorkouts(token, weekStart))
        : new Set<string>();
      if (requestId === generation.current)
        setSnapshot((current) => ({ ...current, status, sentDates, error: "", loaded: true }));
    } catch {
      if (requestId === generation.current)
        setSnapshot((current) => ({ ...current, error: "statusFailed", loaded: true }));
    }
  }, [token, weekStart]);

  useEffect(() => {
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);

  const send = useCallback(async (week: TrainingWeek, workouts: Workout[], locale: Locale): Promise<GarminMutationResult> => {
    if (!token) return { count: 0, error: "failed" };
    const requestId = ++generation.current;
    setSnapshot((current) => ({ ...current, busy: true, error: "" }));
    try {
      const result = await mobileApi.sendWorkouts(token, week, workouts, locale);
      if (requestId === generation.current) {
        const dates = new Set(latest.current.sentDates);
        for (const workout of workouts) dates.add(addDays(week.startDate, workout.day));
        setSnapshot((current) => ({
          ...current,
          sentDates: result.error ? latest.current.sentDates : dates,
          status: { ...current.status, sentWorkouts: Math.max(0, current.status.sentWorkouts + result.count) },
          busy: false,
        }));
      }
      return result;
    } catch (error) {
      if (requestId === generation.current)
        setSnapshot((current) => ({ ...current, busy: false, error: error instanceof Error ? error.message : "failed" }));
      return { count: 0, error: error instanceof Error ? error.message : "failed" };
    }
  }, [token]);

  const remove = useCallback(async (dates: string[]): Promise<GarminMutationResult> => {
    if (!token) return { count: 0, error: "failed" };
    const requestId = ++generation.current;
    setSnapshot((current) => ({ ...current, busy: true, error: "" }));
    try {
      const result = await mobileApi.deleteWorkouts(token, dates);
      if (requestId === generation.current) {
        const remaining = new Set(latest.current.sentDates);
        result.error ? undefined : result.count === 0 ? undefined : dates.forEach((date) => remaining.delete(date));
        setSnapshot((current) => ({
          ...current,
          sentDates: result.error ? latest.current.sentDates : remaining,
          status: { ...current.status, sentWorkouts: Math.max(0, current.status.sentWorkouts - result.count) },
          busy: false,
        }));
      }
      return result;
    } catch (error) {
      if (requestId === generation.current)
        setSnapshot((current) => ({ ...current, busy: false, error: error instanceof Error ? error.message : "failed" }));
      return { count: 0, error: error instanceof Error ? error.message : "failed" };
    }
  }, [token]);

  const isSent = useCallback((date: string) => snapshot.sentDates.has(date), [snapshot.sentDates]);
  return { ...snapshot, refresh, send, remove, isSent };
}
