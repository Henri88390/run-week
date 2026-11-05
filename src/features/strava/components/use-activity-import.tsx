"use client";

import { createContext, Suspense, useContext, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { activeSync, syncStatusSchema } from "../background-sync";
import { ACTIVITY_QUERY_KEY } from "./activity-query";
import { STRAVA_STATUS_KEY } from "./connection-status";

export const SYNC_STATUS_KEY = ["strava-sync-status"] as const;

function useImportController() {
  const { status } = useSession();
  const router = useRouter();
  const queries = useQueryClient();
  const previous = useRef<string | null>(null);
  const query = useQuery({
    queryKey: SYNC_STATUS_KEY, enabled: status === "authenticated",
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/strava/sync", {
        cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) throw new Error("Sync status unavailable");
      return syncStatusSchema.parse(await response.json());
    },
    refetchInterval: (query) => query.state.data?.job && activeSync(query.state.data.job.status) ? 5000 : 60_000,
    refetchIntervalInBackground: false,
  });
  const job = query.data?.job ?? null;
  const revision = query.data?.revision;
  useEffect(() => {
    if (!query.data) return;
    const progress = `${revision ?? ""}:${job ? `${job.id}:${job.status}:${job.summaries}:${job.recordings}` : "none"}`;
    if (previous.current !== null && previous.current !== progress) {
      void queries.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
      void queries.invalidateQueries({ queryKey: STRAVA_STATUS_KEY });
      router.refresh();
    }
    previous.current = progress;
  }, [job, revision, query.data, queries, router]);
  return useMemo(() => ({
    importing: job !== null && activeSync(job.status),
    error: query.isError || job?.status === "failed",
    retryAt: job?.retryAt ?? null, job,
  }), [job, query.isError]);
}

const ImportContext = createContext<ReturnType<typeof useImportController> | null>(null);
function ImportNavigationRefresh() {
  const pathname = usePathname();
  const { status } = useSession();
  const queries = useQueryClient();
  useEffect(() => {
    if (status === "authenticated") void queries.invalidateQueries({ queryKey: SYNC_STATUS_KEY });
  }, [pathname, queries, status]);
  return null;
}

export function ActivityImportProvider({ children }: { children: React.ReactNode }) {
  const controller = useImportController();
  return <ImportContext.Provider value={controller}>
    <Suspense fallback={null}><ImportNavigationRefresh /></Suspense>
    {children}
  </ImportContext.Provider>;
}
export function useActivityImport() {
  const controller = useContext(ImportContext);
  if (!controller) throw new Error("Missing activity import provider");
  return controller;
}
