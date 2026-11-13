import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsLoading, AnalyticsShell } from "@/features/strava/components/shell";
import { TopPerformancesContent } from "@/features/strava/server/page-data";

export const metadata: Metadata = { title: "Top performances · Run Week", robots: { index: false, follow: false } };

export default function Page() {
  return <AnalyticsShell><Suspense fallback={<AnalyticsLoading />}><TopPerformancesContent /></Suspense></AnalyticsShell>;
}
