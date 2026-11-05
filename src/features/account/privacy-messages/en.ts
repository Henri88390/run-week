export interface PrivacyMessages {
  title: string;
  back: string;
  loading: string;
  intro: string;
  contact: string;
  deployment: string;
  dataTitle: string;
  data: [string, string, string, string, string];
  recipientsTitle: string;
  recipients: [string, string, string, string, string, string, string, string];
  unconfigured: string;
  keys: string;
  aiTitle: string;
  ai: string;
  storageTitle: string;
  storage: [string, string, string, string];
  rightsTitle: string;
  plannerBefore: string;
  plannerLink: string;
  plannerAfter: string;
  rights: [string, string];
  changesTitle: string;
  changes: string;
  controls: {
    title: string;
    exportAccount: string;
    exportBrowser: string;
    disconnect: string;
    deleteBrowserOpen: string;
    deleteAccountOpen: string;
    deleteBrowser: string;
    deleteAccount: string;
    cancel: string;
    confirmBrowser: string;
    confirmAccount: string;
    exported: string;
    exportError: string;
    disconnectError: string;
    disconnectNetwork: string;
    reference: string;
    disconnected: string;
    remaining: string;
    revoke: string;
    browserDeleted: string;
    browserError: string;
    accountError: string;
    accountNetwork: string;
  };
}

export const en: PrivacyMessages = {
  title: "Privacy policy",
  back: "Back to Run Week",
  loading: "Loading privacy policy…",
  intro: "Effective 4 November 2026. This policy covers Run Week at run-week.fyi and its Android app. Service operator and privacy contact:",
  contact: "Use the contact options on that website for privacy requests.",
  deployment: "Deployment disclosure incomplete: the operator must name the hosting and database providers before enabling Garmin authorization or submitting this policy to Garmin.",
  dataTitle: "Data and purposes",
  data: [
    "Without an account, your race performance, VDOT estimate, schedule, training week and language choice are stored only in this browser or locally on your Android device. The Android app keeps its language choice on the device and stores its sign-in token in Android secure storage, not with the planner.",
    "With an account, Run Week stores in its database: your email address; the name and profile image supplied by Google if you sign in with Google; the linked sign-in methods (provider and provider account identifier, not Google tokens); sign-in sessions; your planner (profile and current training week); and, if you connect Garmin, the Garmin connection and sent-workout records described below. The language choice stays in the browser. This data is used to sign you in, keep your planner across devices and operate the Garmin integration.",
    "Email sign-in codes are stored as a keyed hash for at most 10 minutes and deleted when used or replaced. Per-email counters of code requests and failed attempts are stored to limit abuse.",
    "Connecting Garmin requires an account. When you choose to send runs, Run Week's server receives the selected runs, dates, durations, workout types and VDOT to create and schedule workouts in Garmin Connect. Garmin supplies OAuth access and refresh tokens, stored encrypted (AES-256-GCM) with your account, and identifiers of the workouts created, stored with their dates to show which runs were sent and to delete them when you ask. When you connect, Run Week reads your Garmin user ID and stores only a keyed hash of it, so that a Garmin account can be connected to one Run Week account at a time. Run Week does not read your Garmin calendar, recorded activity history, GPS tracks, heart rate, sleep or other Garmin health metrics.",
    "Garmin data and data derived from it are used only for this requested integration. They are not sold, used for advertising, or shared for unrelated purposes.",
  ],
  recipientsTitle: "Recipients and processors",
  recipients: [
    "Garmin receives the workouts you choose to send and handles authentication and calendar storage under its own privacy policy.",
    "Strava handles activity-import authorization and supplies the running summaries and non-GPS streams you authorize under its own privacy policy. Run Week does not request activity-write permission or delete original Strava activities.",
    "Hosting, database, infrastructure, CDN and managed logging providers: {host}. They process HTTP requests, network metadata and the stored account data required to run the service.",
    "Resend delivers email sign-in codes. It receives your email address and the code.",
    "Inngest schedules background Strava imports. It receives opaque import-job identifiers, execution timing, progress/control metadata and sanitized failures, never Strava tokens, activity contents or account identity. Job identifiers become unusable when the connection/account is deleted. Configure Inngest execution-history retention and access in its dashboard.",
    "Google, if you choose Google sign-in, authenticates you under its own privacy policy and provides your email address, name and profile image.",
    "Redis (Upstash in production, Docker Redis locally) enforces shared Garmin upload quotas when configured. The Redis host, included in the infrastructure providers above, receives a pseudonymous HMAC key derived from your account ID, upload-request timestamps, UTC-day counters and expiry metadata. These quota records contain no Garmin tokens, email addresses, workouts or activity data. The separate encrypted Strava cache is described above.",
    "No analytics vendors or external AI services are configured by this application. The operator must update this policy before adding other processors.",
  ],
  unconfigured: "not yet configured; Garmin authorization is disabled",
  keys: "Garmin API keys remain under the operator's control as server configuration. They are not provided to users or transferred to third parties for their use. Infrastructure providers process service traffic; they are not authorized to use the keys for their own applications.",
  aiTitle: "AI transparency",
  ai: "No AI system processes Garmin user data in Run Week. Workout generation uses deterministic VDOT equations and disclosed heuristics, not AI. Garmin data, including anything derived from it, must not be used to train, evaluate or improve AI models. There is no AI-data consent request because no such processing occurs; adding it would require a new disclosure and explicit, withdrawable consent before processing.",
  storageTitle: "Storage, retention and security",
  storage: [
    "Browser data remains until you delete it or clear site data. Account data remains until you delete the account. Sign-in sessions use an HttpOnly cookie and expire after 30 days without use, or when you sign out. Garmin tokens remain until you disconnect Garmin, delete the account, or the Garmin refresh token expires; the Garmin consent version and acceptance time are stored with them. Connections made under an earlier consent version require reconnection. The Garmin authorization cookie used during connection expires after 10 minutes.",
    "Android sign-in sessions expire after 30 days or when you sign out; only a hash of the Android session token is stored on the server. System-browser sign-in and Garmin linking store a temporary browser ticket for at most 10 minutes and a single-use app-return code for at most 60 seconds. Expired tickets are excluded from use and cleaned up when a new mobile browser flow starts. Google and Garmin authorization open in the system browser. The app-return code is bound to the app using PKCE; session tokens are never put in return URLs. Deleting local app data does not delete account data.",
    "Hosting-provider access and operational logs may contain request metadata. For troubleshooting, Garmin upload requests are logged with their training-plan contents (workout types, durations, paces, scheduled dates, VDOT, language and Garmin workout IDs) and Garmin's workout-API error responses; these logs never include tokens, cookies, email addresses or OAuth values. Log and database-backup retention depend on the providers and deployment settings. The operator must verify them before launch.",
    "Redis quota records expire automatically within 24 hours of the last accepted upload request (10 seconds in local development). Uploads require at least 10 seconds between requests; outside local development, at most 10 requests are accepted per UTC calendar day. A week batch counts as one request. Disconnecting does not immediately delete these short-lived abuse-prevention records.",
  ],
  rightsTitle: "Access, correction, export, deletion and consent",
  plannerBefore: "View your profile and current training week on the",
  plannerLink: "planner",
  plannerAfter: ". Edit setup to correct your inputs and regenerate the week. Export your account and browser data below. Garmin tokens are excluded from exports.",
  rights: [
    "Connecting Garmin requires your explicit consent on the connection page and Garmin's authorization screen. Sending each day or week remains your choice. Withdraw consent below or use Disconnect Garmin on the planner; this deletes the workouts sent from your account from Garmin Connect, then deletes the Garmin tokens and sent-workout records from your account. If Garmin no longer accepts Run Week's access, those workouts cannot be deleted and stay in Garmin Connect. Also revoke Run Week in Garmin Connect's connected-app settings; disconnecting does not revoke Garmin's server-side grant.",
    "Delete your account or browser data below. Deleting the account removes all its data from the Run Week database, including email sign-in records. Workouts already sent remain in Garmin Connect when you delete the account; disconnect Garmin first to delete them, or manage them with Garmin's own controls. For provider logs, backups or other operator-held information, use the privacy contact above.",
  ],
  changesTitle: "Changes",
  changes: "Changes to Garmin-data purposes or recipients require an updated policy and consent before the new processing begins. Review this page before reconnecting.",
  controls: {
    title: "Your data controls",
    exportAccount: "Export account and browser data",
    exportBrowser: "Export browser data",
    disconnect: "Withdraw consent and disconnect Garmin (deletes sent workouts from Garmin Connect)",
    deleteBrowserOpen: "Delete browser data…",
    deleteAccountOpen: "Delete account…",
    deleteBrowser: "Delete browser data",
    deleteAccount: "Delete account",
    cancel: "Cancel",
    confirmBrowser: "This permanently deletes the planner and language choice saved in this browser. Account data is not affected.",
    confirmAccount: "This permanently deletes your account, its planner, sign-in methods, Garmin tokens and sent-workout records, Strava imports, tokens and HR settings, cancels pending imports, and signs you out. Workouts already in Garmin Connect are not deleted; disconnect Garmin first to delete them. Original Strava activities and data saved in this browser are not affected.",
    exported: "Data export downloaded. Garmin and Strava tokens are excluded; Strava imports and HR settings are included.",
    exportError: "Could not export the data. Try again.",
    disconnectError: "Could not disconnect Garmin. Try again.",
    disconnectNetwork: "Could not disconnect Garmin. Check your connection and try again.",
    reference: "Reference: {reference}.",
    disconnected: "Garmin disconnected. Sent workouts deleted from Garmin Connect: {deleted}. The tokens and workout records were deleted from your account.",
    remaining: "Workouts that could not be deleted because Garmin no longer accepts Run Week's access: {remaining}. Delete them in Garmin Connect.",
    revoke: "Revoke Run Week access in Garmin Connect settings too.",
    browserDeleted: "Planner and language choice deleted from this browser.",
    browserError: "Could not delete browser data. Delete this site's data in browser settings.",
    accountError: "Could not delete the account. Try again.",
    accountNetwork: "Could not delete the account. Check your connection and try again.",
  },
};
