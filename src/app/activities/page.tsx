import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsLoading, AnalyticsShell } from "@/features/strava/components/shell";
import { DashboardContent } from "@/features/strava/server/page-data";
export const metadata: Metadata = { title: "Activities · Run Week", robots: { index: false, follow: false } };
export default function Page({ searchParams }: PageProps<"/activities">) {
  return <AnalyticsShell><Suspense fallback={<AnalyticsLoading />}><DashboardContent searchParams={searchParams} /></Suspense></AnalyticsShell>;
}
