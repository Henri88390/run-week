import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { PrivacyControls } from "@/features/garmin/components/privacy-controls";
import { hostingProvider } from "@/features/garmin/server/privacy";

export const metadata: Metadata = { title: "Privacy policy · Run Week" };

export default function PrivacyPage() {
  return <Suspense fallback={<main className="mx-auto max-w-3xl p-6" role="status">Loading privacy policy…</main>}><PrivacyContent /></Suspense>;
}

async function PrivacyContent() {
  await connection();
  const host = hostingProvider();
  return <main lang="en" className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8 text-sm leading-6">
    <Link href="/" className="underline">Back to Run Week</Link>
    <h1 className="text-2xl font-semibold">Privacy policy</h1>
    <p>Effective 3 November 2026. This policy covers Run Week at run-week.fyi. Service operator and privacy contact: <a href="https://www.henri-lambert.my/" className="underline">Henri Lambert</a>. Use the contact options on that website for privacy requests.</p>
    {!host && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3">Deployment disclosure incomplete: the operator must name the hosting provider before enabling Garmin authorization or submitting this policy to Garmin.</p>}
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Data and purposes</h2>
      <p>Your race performance, VDOT estimate, schedule, training week and language choice are stored in this browser. There is no Run Week account or planner database. When you choose to send runs, Run Week&apos;s server receives the selected runs, dates, durations, workout types, VDOT and previous Garmin workout IDs to create, schedule or replace workouts in Garmin Connect.</p>
      <p>Garmin supplies OAuth access and refresh tokens and identifiers of workouts created through the integration. Tokens authorize these operations and are stored in an encrypted, HttpOnly cookie, not exposed to browser JavaScript. This app does not retrieve your recorded activity history, GPS tracks, heart rate, sleep or other Garmin health metrics.</p>
      <p>Garmin data and data derived from it are used only for this requested integration. They are not sold, used for advertising, or shared for unrelated purposes.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Recipients and processors</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Garmin receives the workouts you choose to send and handles authentication and calendar storage under its own privacy policy.</li>
        <li>Hosting, infrastructure, CDN and managed logging providers: {host ?? "not yet configured; Garmin authorization is disabled"}. Infrastructure processes HTTP requests, network metadata and the Garmin synchronization traffic required to run the service.</li>
        <li>Upstash Redis enforces shared upload quotas. It receives a pseudonymous HMAC key derived from an authorization credential, upload-request timestamps, UTC-day counters and expiry metadata, not Garmin tokens, raw user identifiers, workouts or activity data. Network metadata is also processed to provide the service.</li>
        <li>No additional analytics vendors, integration partners, external AI services or data-processing services are configured by this application. The operator must update this policy and its processor disclosure before adding any that process Garmin data.</li>
      </ul>
      <p>Garmin API keys remain under the operator&apos;s control as server configuration. They are not provided to users or transferred to third parties for their use. Infrastructure providers process service traffic; they are not authorized to use the keys for their own applications.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">AI transparency</h2>
      <p>No AI system processes Garmin user data in Run Week. Workout generation uses deterministic VDOT equations and disclosed heuristics, not AI. Garmin data, including anything derived from it, must not be used to train, evaluate or improve AI models. There is no AI-data consent request because no such processing occurs; adding it would require a new disclosure and explicit, withdrawable consent before processing.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Storage, retention and security</h2>
      <p>Browser planner data and Garmin workout-ID references remain until you delete them or clear site data. OAuth authorization cookies expire after 10 minutes. The connected session cookie expires when the Garmin refresh token expires, or is removed when you disconnect. Consent version and acceptance time are stored inside the encrypted authorization/session cookies. Older sessions without this consent require reconnection.</p>
      <p>Sync requests are processed in server memory; there is no application database retaining their payloads. Hosting-provider access and operational logs may contain request metadata; their retention depends on the provider and deployment settings. Do not put tokens, API keys, workout payloads or OAuth callback query strings in analytics or logs. The operator must verify logging settings and the named provider&apos;s terms before launch.</p>
      <p>Upstash quota records expire automatically within 24 hours of the last accepted upload request (10 seconds in local development). Uploads require at least 10 seconds between requests; outside local development, at most 10 requests are accepted per UTC calendar day. A week batch counts as one request. Disconnecting does not immediately delete these short-lived abuse-prevention records. Upstash backups and operational-log retention depend on the operator&apos;s selected region, plan and settings; the operator must verify them before deployment.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Access, correction, export, deletion and consent</h2>
      <p>View your profile and current training week on the <Link href="/" className="underline">planner</Link>. Edit setup to correct your inputs and regenerate the week. Export local data below, or use the week copy/FIT download controls. OAuth credentials are excluded from exports.</p>
      <p>Connecting Garmin requires your explicit consent on the connection page and Garmin&apos;s authorization screen. Sending each day or week remains your choice. Withdraw consent below or use Disconnect Garmin on the planner. This clears Run Week&apos;s local authorization cookies and Garmin references, stopping further synchronization from this browser. Also revoke Run Week in Garmin Connect&apos;s connected-app settings; disconnecting locally does not revoke Garmin&apos;s server-side grant.</p>
      <p>Delete local data below or in browser settings. Workouts already sent remain in Garmin Connect; access, correct, delete or export them there using Garmin&apos;s own controls. For provider logs or other operator-held information, use the privacy contact above. Repeat local deletion/disconnection in each browser where you used the service.</p>
    </section>
    <PrivacyControls />
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Changes</h2>
      <p>Changes to Garmin-data purposes or recipients require an updated policy and consent before the new processing begins. Review this page before reconnecting.</p>
    </section>
  </main>;
}
