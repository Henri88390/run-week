"use client";

import { keepPreviousData, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { dashboardSchema, type DashboardData } from "../types";
import { syncPeriodSchema, type SyncPeriod } from "../sync-period";
import { calendarRange } from "../analytics";

export const ACTIVITY_QUERY_KEY = ["strava-activities"] as const;
const ACTIVITY_CACHE_TTL = 300_000;

export function activityPeriod(data: DashboardData): SyncPeriod {
  return data.year ? { view: "year", year: data.year }
    : data.weekDate ? { view: "week", date: data.weekDate } : { view: "month", month: data.month };
}

/** Mirrors the defaults of the server page so client-side URL changes resolve to the same period. */
export function periodFromSearch(search: URLSearchParams, metrics: boolean, initialData: DashboardData): SyncPeriod {
  const today = initialData.today;
  const view = metrics ? "month" : search.get("view") ?? "month";
  const month = search.get("month");
  const candidate = view === "year" ? { view, year: search.get("year") ?? today.slice(0, 4) }
    : view === "week" ? { view, date: search.get("date") ?? (month ? `${month}-01` : today) }
      : { view: "month", month: month ?? today.slice(0, 7) };
  const parsed = syncPeriodSchema.safeParse(candidate);
  if (!parsed.success) return activityPeriod(initialData);
  return parsed.data.view === "week"
    ? { view: "week", date: calendarRange(parsed.data.date.slice(0, 7), parsed.data.date).start } : parsed.data;
}

function samePeriod(a: SyncPeriod, b: SyncPeriod) {
  return new URLSearchParams(a).toString() === new URLSearchParams(b).toString();
}

/** Date the user navigated from, kept in the URL so switching views returns to the same week/month. */
export function periodAnchor(search: URLSearchParams, period: SyncPeriod): string {
  if (period.view === "month") return `${period.month}-01`;
  if (period.view === "week") {
    const date = search.get("date");
    return date && /^(19|20)\d{2}-\d{2}-\d{2}$/.test(date) && calendarRange(date.slice(0, 7), date).start === period.date
      ? date : period.date;
  }
  const month = search.get("month");
  return month && /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month) && month.startsWith(period.year)
    ? `${month}-01` : `${period.year}-01-01`;
}

export function ActivityQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: ACTIVITY_CACHE_TTL, gcTime: ACTIVITY_CACHE_TTL, retry: false,
      refetchOnWindowFocus: false, refetchOnReconnect: false },
    mutations: { retry: false } },
  }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function useActivityQuery(period: SyncPeriod, initialData: DashboardData) {
  const query = useQuery({
    queryKey: [...ACTIVITY_QUERY_KEY, period],
    initialData: samePeriod(period, activityPeriod(initialData)) ? initialData : undefined,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/strava/activities?${new URLSearchParams(period)}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), cache: "no-store",
      });
      if (!response.ok) throw new Error("Activity request failed");
      const value: unknown = await response.json();
      return dashboardSchema.parse(value);
    },
  });
  return { data: query.data ?? initialData, loading: query.isPlaceholderData || query.isPending,
    isError: query.isError, errorUpdatedAt: query.errorUpdatedAt };
}
