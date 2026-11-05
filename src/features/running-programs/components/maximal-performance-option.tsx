"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal } from "@/features/i18n/locales";
import { useStravaStatus } from "@/features/strava/components/connection-status";
import { ACTIVITY_QUERY_KEY } from "@/features/strava/components/activity-query";
import { dashboardSchema } from "@/features/strava/types";
import { STRAVA_MESSAGES } from "@/features/strava/messages";
import { RequestError } from "@/features/strava/components/request-error";
import { bestMaximalPerformance } from "../maximal-performance";
import { MAXIMAL_PERFORMANCE_MESSAGES } from "../maximal-performance-messages";

export function MaximalPerformanceOption({ onUse }: {
  onUse: (performance: { distanceMeters: number; raceSeconds: number }) => void;
}) {
  const { status } = useSession();
  const { locale } = useI18n();
  const strava = useStravaStatus(status === "authenticated");
  const query = useQuery({
    queryKey: [...ACTIVITY_QUERY_KEY, "planner-maximal-efforts"],
    enabled: status === "authenticated" && strava.data?.connected === true && strava.data.consentCurrent,
    queryFn: async ({ signal }) => {
      const month = new Date().toISOString().slice(0, 7);
      const response = await fetch(`/api/strava/activities?view=month&month=${month}`, {
        cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) throw new Error("Maximal performances unavailable");
      return dashboardSchema.parse(await response.json()).maximalEfforts;
    },
  });
  if (status !== "authenticated") return null;
  if (strava.isError || query.isError) return <RequestError message={STRAVA_MESSAGES[locale].error} />;
  if (!strava.data?.connected || !strava.data.consentCurrent || !query.data?.length) return null;
  const best = bestMaximalPerformance(query.data);
  const text = MAXIMAL_PERFORMANCE_MESSAGES[locale];
  return <section className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3" data-maximal-performance-option>
    <button type="button" className="button-secondary" disabled={!best} onClick={() => { if (best) onUse(best); }}>
      {text.use}
    </button>
    <p className="text-sm text-stone-600">{text.help}</p>
    {best ? <p className="text-sm">VDOT {formatDecimal(locale, best.vdot)} · {best.name} · {formatDate(locale, best.localDate)}</p>
      : <p className="text-sm text-amber-900">{text.unavailable}</p>}
  </section>;
}
