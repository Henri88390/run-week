"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { dashboardSchema, type DashboardData } from "../types";
import type { SyncPeriod } from "../sync-period";

export const ACTIVITY_QUERY_KEY = ["strava-activities"] as const;

export function activityPeriod(data: DashboardData): SyncPeriod {
  return data.year ? { view: "year", year: data.year }
    : data.weekDate ? { view: "week", date: data.weekDate } : { view: "month", month: data.month };
}

export function ActivityQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 300_000, gcTime: 300_000, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
      mutations: { retry: false } },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function useActivityQuery(initialData: DashboardData) {
  const period = activityPeriod(initialData);
  return useQuery({
    queryKey: [...ACTIVITY_QUERY_KEY, period],
    initialData,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/strava/activities?${new URLSearchParams(period)}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), cache: "no-store",
      });
      if (!response.ok) throw new Error("Activity request failed");
      const value: unknown = await response.json();
      return dashboardSchema.parse(value);
    },
  });
}
