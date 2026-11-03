import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { GARMIN_CONSENT_VERSION } from "@/features/garmin/privacy";
import { hostingProvider } from "@/features/garmin/server/privacy";
import { garminConfig } from "@/features/garmin/server/config";

export const metadata: Metadata = { title: "Connect Garmin · Run Week" };

export default function GarminConsentPage() {
  return <Suspense fallback={<main className="mx-auto max-w-2xl p-6" role="status">Loading Garmin consent…</main>}><GarminConsentContent /></Suspense>;
}

async function GarminConsentContent() {
  await connection();
  const host = hostingProvider();
  const ready = Boolean(host && garminConfig());
  return <main lang="en" className="mx-auto w-full max-w-2xl space-y-5 px-6 py-8 text-sm leading-6">
    <Link href="/" className="underline">Back to Run Week</Link>
    <h1 className="text-2xl font-semibold">Connect Garmin</h1>
    <p>Run Week sends only the runs you select to create, schedule or replace workouts in Garmin Connect. Garmin provides authorization tokens and created workout identifiers; Run Week does not read your recorded activity history.</p>
    <p>Recipients are Garmin and the service infrastructure provider(s): {host ?? "not yet disclosed"}. No AI service processes Garmin data, and Garmin data is not sold or used to train, evaluate or improve AI models.</p>
    <p>Upstash Redis also receives a credential-derived pseudonymous quota key, request timing, daily counters and expiry metadata to enforce upload limits; it does not receive your Garmin tokens, workouts or recorded activities. Quota records expire within 24 hours (10 seconds in local development) and are not immediately deleted on disconnect.</p>
    <p>You can withdraw consent and disconnect at any time on the <Link href="/privacy" className="underline">privacy and data-controls page</Link>. Workouts already sent remain in Garmin until you delete them there.</p>
    {!ready && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3">Connection is unavailable. The operator must configure Garmin credentials and disclose the hosting provider in the privacy policy.</p>}
    <form action="/api/garmin/connect" method="post" className="space-y-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="consent" value={GARMIN_CONSENT_VERSION} required disabled={!ready} className="mt-1 shrink-0" />
        <span>I have read the <Link href="/privacy" className="underline">privacy policy</Link> and consent to Run Week and its disclosed infrastructure processing Garmin authorization tokens, workout identifiers and the runs I select for Garmin synchronization, and to Upstash processing the pseudonymous quota metadata described above.</span>
      </label>
      <button type="submit" className="button-primary" disabled={!ready}>Agree and continue to Garmin</button>
    </form>
  </main>;
}
