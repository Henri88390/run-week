import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsLoading, AnalyticsShell } from "@/features/strava/components/shell";
import { DetailContent } from "@/features/strava/server/page-data";
export const metadata: Metadata = { title: "Activity · Run Week", robots: { index: false, follow: false } };
export default function Page({ params }: PageProps<"/activities/[id]">) {
  return <AnalyticsShell><Suspense fallback={<AnalyticsLoading />}><DetailContent params={params} /></Suspense></AnalyticsShell>;
}
