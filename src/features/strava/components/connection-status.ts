"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

export const STRAVA_STATUS_KEY = ["strava-status"] as const;
const statusSchema = z.object({ connected: z.boolean(), consentCurrent: z.boolean() });

export function useStravaStatus(enabled: boolean) {
  return useQuery({
    queryKey: STRAVA_STATUS_KEY, enabled, staleTime: 0,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/strava/status", { cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
      if (!response.ok) throw new Error("Strava status request failed");
      const value: unknown = await response.json();
      return statusSchema.parse(value);
    },
  });
}
