import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { PrivacyControls } from "@/features/account/components/privacy-controls";
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
    <p>Effective 4 November 2026. This policy covers Run Week at run-week.fyi and its Android app. Service operator and privacy contact: <a href="https://www.henri-lambert.my/" className="underline">Henri Lambert</a>. Use the contact options on that website for privacy requests.</p>
    {!host && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3">Deployment disclosure incomplete: the operator must name the hosting and database providers before enabling Garmin authorization or submitting this policy to Garmin.</p>}
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Data and purposes</h2>
      <p>Without an account, your race performance, VDOT estimate, schedule, training week and language choice are stored only in this browser or locally on your Android device. The Android app keeps its language choice on the device and stores its sign-in token in Android secure storage, not with the planner.</p>
      <p>With an account, Run Week stores in its database: your email address; the name and profile image supplied by Google if you sign in with Google; the linked sign-in methods (provider and provider account identifier, not Google tokens); sign-in sessions; your planner (profile and current training week); and, if you connect Garmin, the Garmin connection and sent-workout records described below. The language choice stays in the browser. This data is used to sign you in, keep your planner across devices and operate the Garmin integration.</p>
      <p>Email sign-in codes are stored as a keyed hash for at most 10 minutes and deleted when used or replaced. Per-email counters of code requests and failed attempts are stored to limit abuse.</p>
      <p>Connecting Garmin requires an account. When you choose to send runs, Run Week&apos;s server receives the selected runs, dates, durations, workout types and VDOT to create and schedule workouts in Garmin Connect. Garmin supplies OAuth access and refresh tokens, stored encrypted (AES-256-GCM) with your account, and identifiers of the workouts created, stored with their dates to show which runs were sent and to delete them when you ask. When you connect, Run Week reads your Garmin user ID and stores only a keyed hash of it, so that a Garmin account can be connected to one Run Week account at a time. Run Week does not read your Garmin calendar, recorded activity history, GPS tracks, heart rate, sleep or other Garmin health metrics.</p>
      <p>Garmin data and data derived from it are used only for this requested integration. They are not sold, used for advertising, or shared for unrelated purposes.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Recipients and processors</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Garmin receives the workouts you choose to send and handles authentication and calendar storage under its own privacy policy.</li>
        <li>Hosting, database, infrastructure, CDN and managed logging providers: {host ?? "not yet configured; Garmin authorization is disabled"}. They process HTTP requests, network metadata and the stored account data required to run the service.</li>
        <li>Resend delivers email sign-in codes. It receives your email address and the code.</li>
        <li>Google, if you choose Google sign-in, authenticates you under its own privacy policy and provides your email address, name and profile image.</li>
        <li>Upstash Redis enforces shared Garmin upload quotas. It receives a pseudonymous HMAC key derived from your account ID, upload-request timestamps, UTC-day counters and expiry metadata, not Garmin tokens, email addresses, workouts or activity data.</li>
        <li>No analytics vendors, external AI services or other data-processing services are configured by this application. The operator must update this policy before adding any.</li>
      </ul>
      <p>Garmin API keys remain under the operator&apos;s control as server configuration. They are not provided to users or transferred to third parties for their use. Infrastructure providers process service traffic; they are not authorized to use the keys for their own applications.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">AI transparency</h2>
      <p>No AI system processes Garmin user data in Run Week. Workout generation uses deterministic VDOT equations and disclosed heuristics, not AI. Garmin data, including anything derived from it, must not be used to train, evaluate or improve AI models. There is no AI-data consent request because no such processing occurs; adding it would require a new disclosure and explicit, withdrawable consent before processing.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Storage, retention and security</h2>
      <p>Browser data remains until you delete it or clear site data. Account data remains until you delete the account. Sign-in sessions use an HttpOnly cookie and expire after 30 days without use, or when you sign out. Garmin tokens remain until you disconnect Garmin, delete the account, or the Garmin refresh token expires; the Garmin consent version and acceptance time are stored with them. Connections made under an earlier consent version require reconnection. The Garmin authorization cookie used during connection expires after 10 minutes.</p>
      <p>Android sign-in sessions expire after 30 days or when you sign out; only a hash of the Android session token is stored on the server. System-browser sign-in and Garmin linking store a temporary browser ticket for at most 10 minutes and a single-use app-return code for at most 60 seconds. Expired tickets are excluded from use and cleaned up when a new mobile browser flow starts. Google and Garmin authorization open in the system browser. The app-return code is bound to the app using PKCE; session tokens are never put in return URLs. Deleting local app data does not delete account data.</p>
      <p>Hosting-provider access and operational logs may contain request metadata. For troubleshooting, Garmin upload requests are logged with their training-plan contents (workout types, durations, paces, scheduled dates, VDOT, language and Garmin workout IDs) and Garmin&apos;s workout-API error responses; these logs never include tokens, cookies, email addresses or OAuth values. Log and database-backup retention depend on the providers and deployment settings. The operator must verify them before launch.</p>
      <p>Upstash quota records expire automatically within 24 hours of the last accepted upload request (10 seconds in local development). Uploads require at least 10 seconds between requests; outside local development, at most 10 requests are accepted per UTC calendar day. A week batch counts as one request. Disconnecting does not immediately delete these short-lived abuse-prevention records.</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Access, correction, export, deletion and consent</h2>
      <p>View your profile and current training week on the <Link href="/" className="underline">planner</Link>. Edit setup to correct your inputs and regenerate the week. Export your account and browser data below. Garmin tokens are excluded from exports.</p>
      <p>Connecting Garmin requires your explicit consent on the connection page and Garmin&apos;s authorization screen. Sending each day or week remains your choice. Withdraw consent below or use Disconnect Garmin on the planner; this deletes the workouts sent from your account from Garmin Connect, then deletes the Garmin tokens and sent-workout records from your account. If Garmin no longer accepts Run Week&apos;s access, those workouts cannot be deleted and stay in Garmin Connect. Also revoke Run Week in Garmin Connect&apos;s connected-app settings; disconnecting does not revoke Garmin&apos;s server-side grant.</p>
      <p>Delete your account or browser data below. Deleting the account removes all its data from the Run Week database, including email sign-in records. Workouts already sent remain in Garmin Connect when you delete the account; disconnect Garmin first to delete them, or manage them with Garmin&apos;s own controls. For provider logs, backups or other operator-held information, use the privacy contact above.</p>
    </section>
    <PrivacyControls />
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Changes</h2>
      <p>Changes to Garmin-data purposes or recipients require an updated policy and consent before the new processing begins. Review this page before reconnecting.</p>
    </section>
  </main>;
}
