import type { Metadata } from "next";
import { Suspense } from "react";
import { currentUserId } from "@/features/account/server/auth";
import { AnalyticsLoading, AnalyticsShell } from "@/features/strava/components/shell";
import { StravaConsent } from "@/features/strava/components/consent";
import { connection } from "next/server";
export const metadata: Metadata = { title: "Strava import consent · Run Week", robots: { index: false, follow: false } };
async function Content() {
  await connection();
  return <StravaConsent signedIn={!!await currentUserId()} />;
}
export default function Page() {
  return <AnalyticsShell><Suspense fallback={<AnalyticsLoading />}><Content /></Suspense></AnalyticsShell>;
}
