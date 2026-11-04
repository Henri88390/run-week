"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { SyncPeriod } from "../sync-period";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVITY_QUERY_KEY } from "./activity-query";

const progressSchema = z.object({
  ok: z.literal(true),
});
const errorSchema = z.object({ error: z.string(), retrySeconds: z.number().positive().optional() });

function useImportController() {
  const router = useRouter();
  const queries = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(false);
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const [stopVersion, setStopVersion] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const [coolingDown, setCoolingDown] = useState(false);
  const nextStart = useRef(0);
  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => setCoolingDown(false), Math.max(0, nextStart.current - Date.now()) + 50);
    return () => clearTimeout(timer);
  }, [coolingDown, retryAt]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(false), 3000);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => () => { activeRequest.current?.abort(); }, []);
  const stop = useCallback(() => {
    setStopVersion((value) => value + 1);
    activeRequest.current?.abort();
    activeRequest.current = null;
    setImporting(false);
    setError(false);
    setRetryAt(null);
  }, []);
  const start = useCallback(async (period: SyncPeriod) => {
    if (activeRequest.current || Date.now() < nextStart.current) return null;
    const controller = new AbortController();
    activeRequest.current = controller;
    nextStart.current = Date.now() + 10_000;
    setImporting(true);
    setCoolingDown(true);
    setError(false);
    setRetryAt(null);
    let success = false;
    try {
      const response = await fetch("/api/strava/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(period), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(250_000)]), cache: "no-store",
      });
      const value: unknown = await response.json();
      if (activeRequest.current !== controller) return;
      if (!response.ok) {
        const parsed = errorSchema.safeParse(value);
        if (response.status === 429 && parsed.success && parsed.data.retrySeconds) {
          nextStart.current = Math.max(nextStart.current, Date.now() + parsed.data.retrySeconds * 1000);
          setRetryAt(new Date(nextStart.current).toISOString());
          setCoolingDown(true);
        }
        throw new Error("Import failed");
      }
      progressSchema.parse(value);
      success = true;
    } catch {
      if (activeRequest.current === controller) setError(true);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setImporting(false);
        nextStart.current = Math.max(nextStart.current, Date.now() + 1000);
        setCoolingDown(true);
        await queries.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
        router.refresh();
      }
    }
    return success;
  }, [queries, router]);
  return useMemo(() => ({ importing, error, retryAt, coolingDown, stopVersion, start, stop }),
    [importing, error, retryAt, coolingDown, stopVersion, start, stop]);
}

const ImportContext = createContext<ReturnType<typeof useImportController> | null>(null);

export function ActivityImportProvider({ children }: { children: React.ReactNode }) {
  const controller = useImportController();
  return <ImportContext.Provider value={controller}>{children}</ImportContext.Provider>;
}

export function useActivityImport() {
  const controller = useContext(ImportContext);
  if (!controller) throw new Error("Missing activity import provider");
  return controller;
}
