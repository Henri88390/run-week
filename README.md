# Run Week

A running planner built with Next.js App Router, React, TypeScript, Tailwind
CSS and ESLint, with optional accounts (Auth.js, PostgreSQL through Prisma).

![Setup form](docs/screenshots/setup.png)

![Weekly plan](docs/screenshots/week.png)

![Workout details](docs/screenshots/workout-details.png)

## Getting started

Use Node.js 24 LTS, npm and Docker (or another PostgreSQL 15+ server). From
this directory:

```sh
npm ci                  # also generates the Prisma client
cp .env.example .env.local   # set AUTH_SECRET; adjust DATABASE_URL if needed
docker compose up -d    # local PostgreSQL on port 5432
npm run db:migrate
npm run dev
```

Open [localhost:3000](http://localhost:3000).
On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`. Without
`AUTH_RESEND_KEY`, development sign-in codes are printed to the dev server
console.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate route types and check TypeScript |
| `npm run build` | Create the production build |
| `npm start` | Serve the production build |
| `npm run db:migrate` | Create and apply a migration in development (`prisma migrate dev`) |
| `npm run db:deploy` | Apply pending migrations in production (`prisma migrate deploy`) |
| `npm run test:e2e` | Run the Playwright end-to-end tests (see [End-to-end tests](#end-to-end-tests)) |

## Structure

```text
.github/
  agents/                 Project-specific coding and review agents
prisma/                   Database schema and migrations
src/
  app/                    Routes, API route handlers, root layout, global styles
  features/
    account/              Auth.js configuration, sign-in UI, privacy controls
    i18n/                 Locales, translated messages, language selector
    running-programs/
      components/         Running-program UI
      types.ts            Domain types independent of React
      domain.ts           Pure VDOT, schedule and workout generation functions
      storage.ts          Versioned planner validation
      use-planner-store.ts Hydration-safe browser store (signed out)
      use-account-planner.ts Account planner store (signed in)
    garmin/               Garmin Connect client hook and server-only API code
  generated/prisma/       Generated Prisma client (not committed)
public/                   Static assets
```

The home page supports performance/profile setup and a current-week plan.
Signed out, the profile and current week are saved only in this browser's
localStorage; clearing browser data deletes them. Signed in, they are saved in
the account and shared across devices. Failed writes show a warning; invalid
saved data is not silently overwritten. System fonts keep builds independent of
external font services.

VDOT uses the Daniels–Gilbert race-performance equations. Changing the
performance distance prefills the race time with the equivalent time for the
same VDOT, based on the last complete time entered. Setup can use an optional desired weekly distance or desired weekly time. A
distance target is converted to duration using VDOT easy pace; a time target is
used directly. The resulting duration is distributed among workouts by type and
neighboring sessions. Without a target, session durations use the VDOT-based
baseline: the first easy run is the longest, and each additional easy run is
shorter, by a larger step and down to a lower floor for lower VDOT values. Easy
runs next to a key session or the long run get the shorter durations. The long
run is always longer than every easy run: if needed, 10-minute blocks are moved
to it from the longest easy run, keeping the weekly total. Existing
local planner data is migrated by estimating volume from its
saved workout durations and VDOT pace.

Easy pace estimates invert the oxygen-cost equation at 59–74% of VDOT. Full
equations and limits are shown in the UI. The plan retains the VDOT/profile
snapshot used to create it. These are illustrative estimates, not personalized
training or medical advice.

Default workout categories follow the selected run count: one interval workout;
two runs (easy and intervals); three runs (intervals, easy, long); four runs (intervals,
two easy, long); five or more (intervals, easy, threshold, long, then additional
easy runs). The total weekly duration is allocated in proportion to workout-type
and neighboring-session weights. Workout and long runs are spaced as evenly as
the selected weekdays allow, with the long run favored for a weekend when
spacing is otherwise equal. Optional preferred days can be set for the interval
workout, the threshold workout, and the long run; each option is shown only when
the run count includes that session. With selected weekdays, preferred days must
be among them. With a run count, the run days are chosen to include the
preferred days and keep key sessions as far apart as possible. The displayed distance is a separate estimate based
on the VDOT easy-pace range. These are product heuristics, not scientifically
validated training rules.

Advanced options allow each existing key-session slot to be changed to intervals,
threshold, repetition or long run, with a separate preferred day for each slot.
The highlighted "Skip workout" option replaces that slot with an easy run;
its day preference applies unless it shares a day with another slot. In that case,
skipped slots become easy runs on other scheduled days and a real workout keeps
the specified day. Only conflicting non-skipped workouts cause a duplicate-day
error. Remaining key sessions are spaced around the easy runs.
The question-mark button beside each workout type shows a short paraphrase of
Daniels' training definition for the selected type on hover, keyboard focus or
tap. Escape dismisses it. Definitions are translated into all supported languages.
Jack Daniels is credited in the bottom method-and-limits text rather than in
each workout tooltip. Conflicting workout days show errors under every affected
workout, and changing a day revalidates all day selections.
All form dropdowns and the language selector use the same accessible dropdown
component. Arrows rotate when menus open and close; reduced-motion preferences
disable the animation. Keyboard navigation supports arrows, Home, End, typing,
Enter, Escape and Tab.
Types may be repeated, including multiple long runs. The number of key-session
slots and easy runs remains unchanged; leaving the choices at their defaults
preserves the existing generation rules. Each long run remains longer than every
easy run. At the minimum weekly duration, enforcing this can exceed the target.
Duplicate workouts are user choices, not an assessment of safe training load.
Saved profiles without workout choices retain their defaults.

Interval sessions use VDOT-derived I-pace estimates and 3-minute repeats with
2-minute easy jog recoveries. Threshold sessions use VDOT-derived T-pace
estimates and continuous or repeated efforts, fitted to the planned session
duration. The pace ranges and example formats follow the [VDOT2 training
definitions](https://vdoto2.com/Calculator). These are illustrative sessions,
not individualized coaching advice.

Repetition (R) training develops speed and running economy, with short efforts
and full recovery rather than the incomplete recovery of I training. The
[official VDOT calculator's training definitions](https://vdoto2.com/calculator)
describe R pace as similar to current 1500 m or mile race pace, with example
formats of 8 x 200 m or 4 x 400 m and easy jog recovery. Recover fully before the
next repetition; extending recovery is preferable to forcing the next effort.

The planner estimates R pace by solving the existing Daniels-Gilbert performance
equation for an equivalent mile time at the saved VDOT, then converting it to
seconds/km. This is a continuous approximation, not an exact official R-table
lookup. Generated sets use 200 m repeats, or 400 m when the session is at least
50 minutes, each effort fits within two minutes, and the volume budget allows
at least two 400 m repetitions. Otherwise 200 m repeats are used. Warm-up and cool-down each
receive at least eight minutes, with a starting recovery of three times the
effort duration. Rep count is fitted to time and volume, not fixed to the examples.
If there is not enough room for two repetitions, or a 200 m effort would exceed
two minutes, the details explicitly prescribe easy running instead.

As a conservative product rule inspired by the
[Daniels five-week-cycle review](https://fellrnr.com/wiki/Jack_Daniels_Running_Formula),
total R distance is capped at the smaller of 5% of estimated weekly distance or
8 km, shared across all selected R sessions. The estimate uses the slower easy
pace and scheduled minutes, not measured training history. These limits and
session templates are illustrative heuristics, not personalized coaching.

Select a calendar day to view its workout details. The copy button copies the
week, including workout steps and paces, as plain text in the current language.
Non-easy workouts include an
option to download a Garmin FIT workout file. Files contain timed workout steps
or distance-based R repetitions
and VDOT-derived pace targets where available. Easy runs and long runs carry
their easy-pace range as step text only, without a pace target, so the watch
does not alert when the pace leaves the range. This also applies to Garmin
Connect uploads. Transfer the downloaded file to
a compatible Garmin device using Garmin Connect or the device's supported
file-transfer method. Easy runs do not have FIT downloads; files are generated
in the browser and are not uploaded automatically.

## Accounts

Accounts are optional; everything except Garmin Connect works signed out.
`/signin` offers a six-digit email code (Auth.js Resend provider, valid 10
minutes) and, when `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set, Google
sign-in. A Google sign-in with the same verified email joins the existing
account. Sessions are stored in the database (30-day HttpOnly cookie). Only
the latest code for an email is valid; at most 5 codes per email per hour are
sent, and 5 wrong entries invalidate the pending code. Provider OAuth tokens
are not stored.

When signed in, the planner is loaded from and saved to the account
(`GET`/`PUT /api/planner`) instead of localStorage. If the account has no plan,
the setup form is shown; the browser copy is left unchanged and returns when
signed out. The privacy page exports the account (`GET /api/account`) and
deletes it (`DELETE /api/account`), which removes all its rows.

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by the app. On Supabase, the pooled URL (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | Optional direct connection for migrations (Supabase direct or session URL) |
| `AUTH_SECRET` | Random string of at least 32 characters (`npx auth secret`) |
| `AUTH_RESEND_KEY` | Resend API key; required in production for email codes |
| `AUTH_EMAIL_FROM` | Sender address on a domain verified in Resend |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Optional Google OAuth client; redirect URI `<origin>/api/auth/callback/google` |

Run `npm run db:deploy` against the production database before deploying a
version with new migrations. The email body is in English.

## Garmin Connect

When configured, the week view can send runs to the Garmin Connect calendar.
Connecting Garmin requires an account; Garmin controls are shown only when
signed in. The main page shows a persistent connected status and disconnect
control, even before a training week is created. Connection state is shared with
the week and workout modal; status-request failures are reported rather than
silently hidden.
Connected users can send the week from its Garmin controls or one run from its
workout modal: the whole week (workouts and long run, or all runs) or a single day from the
day dialog. Each run becomes a Garmin workout scheduled on its date. Each sent
workout is recorded in the database with its date and Garmin workout ID (one per
day per account). Uploads skip days already recorded and report them as already
in Garmin instead of failing; concurrent uploads of the same day keep one
workout and delete the duplicate. The week view reads the recorded days
(`GET /api/garmin/workouts?weekStart=`) when it opens and on window focus, so
every tab and device shows the same state. Run Week does not read the Garmin
calendar.
Garmin Connect does not let users edit or delete workouts created by a partner
app, so the week controls and workout modal also offer "Remove from Garmin"
(`DELETE /api/garmin/workouts`), which deletes the recorded workouts for those
dates, along with their calendar entries.
The connect button uses a locally hosted Garmin wordmark from the
[user-supplied logo source](https://zonalogo.com/garmin-logo-png-svg);
Garmin branding remains Garmin's trademark. Verify its use against the branding
requirements of your approved Garmin developer application.
Repetition workouts are accepted by the sync endpoint, with distance-based
efforts and R-pace speed targets. FIT exports retain the full week's R-volume
budget; Garmin sync generates each selected session independently using its
conservative session-duration-based R budget. Watch names for Russian,
Ukrainian and Belarusian use English.
Garmin workout names and embedded FIT names start with the full weekday in the
export language. Downloaded FIT filenames also start with the weekday (English).

The integration uses Garmin's Training API, which requires an approved
[Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/)
application with the workout import permission. Copy `.env.example` to
`.env.local` and set these environment variables:

| Variable | Description |
| --- | --- |
| `GARMIN_CLIENT_ID` | Application consumer key |
| `GARMIN_CLIENT_SECRET` | Application consumer secret |
| `GARMIN_SESSION_SECRET` | Random string of at least 32 characters, used to encrypt stored Garmin tokens and the authorization cookie, and to derive quota keys |
| `UPSTASH_REDIS_REST_URL` | Optional HTTPS REST endpoint; omit both Redis variables for per-process memory limits |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only read/write REST token when Redis is configured (not the read-only token) |
| `GARMIN_REDIRECT_URI` | Optional; defaults to `<origin>/api/garmin/callback`. Must be an HTTPS URL (HTTP is allowed only on localhost), without credentials or a fragment; register the exact URI with Garmin. |
| `PRIVACY_HOSTING_PROVIDER` | Required for new Garmin authorization; publicly names hosting, database, CDN/proxy and managed logging processors. |

For `https://run-week.fyi`, register the OAuth callback as
`https://run-week.fyi/api/garmin/callback` and the privacy policy as
`https://run-week.fyi/privacy`. `/garmin/consent` is the user-facing consent page,
not the OAuth callback. These URLs must be deployed and publicly reachable
before submitting the application. Set `GARMIN_REDIRECT_URI` to the exact callback.
For Garmin's branding image, use
`https://run-week.fyi/run-week-branding.png` after deployment. The public PNG is
300 x 300 pixels; it is not used as a favicon.

The privacy policy and consent pages are in English; the planner footer link is
localized. Consent is required before authorization; its version and time are
stored with the connection, and connections under an earlier version require
reconnection. Disconnect deletes the stored tokens and sent-workout records.
The privacy page provides JSON export of account and browser data, consent
withdrawal, browser-data deletion and account deletion. It never exports
credentials or claims to delete Garmin-side workouts. Users manage those and
revoke the OAuth grant in Garmin Connect.

Before submitting the policy, identify all actual infrastructure processors in
`PRIVACY_HOSTING_PROVIDER`, verify their logging/retention settings and ensure the
operator website provides a working privacy-contact channel. No runtime AI or
analytics processors are configured. Do not add them without updating the policy,
consent requirements and processor disclosure. Never log tokens, cookies
or OAuth callback query strings. Have the deployment-specific policy reviewed;
this page is not a guarantee of Garmin approval or legal compliance.

Without them, the Garmin controls are hidden. Authorization uses OAuth 2.0 with
PKCE; the callback must be completed by the account that started it. Tokens are
stored AES-256-GCM encrypted in the database with the account and never reach
browser JavaScript. Redis stores only short-lived quota metadata. Disconnecting
deletes the stored tokens; revoke access in Garmin Connect account settings.

A Garmin account can be connected to only one Run Week account. The callback
reads the Garmin user ID (`GET /wellness-api/rest/user/id`) and stores an HMAC
of it (keyed with `GARMIN_SESSION_SECRET`) in the unique
`GarminConnection.garminUserKey` column. If another account already holds that
key, the connection is refused with `?garmin=alreadyLinked`, and the other
account must disconnect first. Reconnecting the same account with a different
Garmin account deletes its sent-workout records, which belong to the previous
Garmin account.

### Distributed upload limits (Upstash Redis)

Provision an Upstash Redis database, select and review its region/retention
settings and processor terms, and set its REST URL and **read/write** REST token
in the server environment (Vercel integration variables or manual configuration).
The implementation uses Upstash's REST command API directly; no SDK is required.
Use the same database and stable `GARMIN_SESSION_SECRET` across all production
instances/deployments, and a separate database for local development. Do not
expose either Redis variable through `NEXT_PUBLIC_*`.

An authenticated, valid `POST` or `DELETE /api/garmin/workouts` reserves **one upload request**,
whether it sends one run or a batch of up to seven. Requests must start at least
**10 seconds apart in every environment**. There are **10 accepted requests per
UTC calendar day**, resetting at 00:00 UTC, except when the trusted server's
`NODE_ENV` is exactly `development` (`next dev`). No Origin, hostname or client
parameter can enable that exemption; production previews also have the daily cap.
The cooldown still applies across UTC midnight. Invalid/unauthenticated requests
and blocked attempts do not consume quota; accepted reservations do, including
failed/partial Garmin uploads or lost responses. There is no automatic refund
or retry, and this is not a per-workout or rolling-24-hour quota.

One atomic Redis Lua operation uses Redis server time to check and reserve both
limits before token refresh, deletion, creation or scheduling. Parallel requests
across Vercel instances cannot bypass the reservation. Rejections return typed
`rateLimited`, HTTP 429, `Retry-After` seconds and `retryAfterSeconds` JSON; the UI
shows the returned wait. Partially configured/invalid Redis configuration, provider failures
or unexpected responses fail closed as generic HTTP 503 `unavailable`, with
sanitized `rateLimit` diagnostics and no fallback during provider failures.

When both Redis settings are absent or blank, a synchronous in-memory reservation
enforces the same cooldown, UTC daily quota and development exemption. Expired
entries are removed on subsequent reservations. A structured warning identifies
this mode without exposing identities. State is shared only within one running
process, resets on restart/redeployment and is not shared across Vercel instances.
Use Redis for reliable distributed production protection; the memory fallback is
best-effort on serverless deployments.

The quota identity is an HMAC of the account ID under the Garmin session
secret, so limits apply per account across browsers and devices. Raw account
IDs, credentials and Garmin user IDs never go to Redis or diagnostics. Rotating
the session secret disconnects every account and resets quota identities; do
not rotate it routinely.

Upstash receives only the derived pseudonymous key, timestamp, UTC-day counter
and TTL (plus service network metadata), not tokens, workouts or Garmin activity
data. Quota records expire by UTC midnight or after the 10-second cooldown,
whichever is later (at most 24 hours); development records last 10 seconds.
Disconnect does not delete these records early. Review provider backups/logs
separately. Privacy and consent pages disclose Upstash explicitly; the consent
version is bumped so pre-Upstash sessions must reconnect before this processing.

Route handlers in `src/app/api/garmin`: `connect`, `callback`, `status`,
`disconnect` and `workouts`. Garmin's API documentation is available only to
approved developers; the endpoints and payload format in
`src/features/garmin/server` follow public implementations and were not tested
against a live account. Check them against the official documentation, in
particular the scheduling endpoint.

### Garmin diagnostics in production

Garmin failures emit structured JSON through server-only `console.error` (service,
network, invalid response, configuration or internal failures) or `console.warn`
(authorization, permission, rate limit, rejection or invalid input). On Vercel,
open the project's **Logs**, select the production deployment/environment and
filter for `garmin_failure` (include warning and error levels). No logging vendor
or additional environment variables are needed. These are runtime/function logs,
not browser console or build logs.

Each entry includes a generated request ID, a fixed operation (`refresh`,
`create`, `schedule`, `record`, `cleanup`, OAuth/status/disconnect, etc.), a
category, a safe frontend code, and, when applicable, the upstream HTTP status
and number of completed runs. Upload responses include the same ID in
`X-Request-ID` and JSON; localized week and workout-modal errors display it as a
reference. Other Garmin endpoints include it in the response header.

Uploads also emit `console.info` events sharing that request ID:
`garmin_upload_request` (the frontend JSON body), `garmin_api_request` (the
exact workout payload sent to Garmin, plus schedule/delete targets),
`garmin_api_response` (created workout ID) and
`garmin_upload_result` (HTTP status, error code and results, with `existing: true`
for skipped days). Removals emit `garmin_delete_request`,
`garmin_api_request` (`operation: "delete"`) and `garmin_delete_result`.
Filter by request ID to follow one upload.
Payloads above 16,000 characters are truncated. Failures from the Garmin
Training API include up to 2,000 characters of Garmin's error body as
`upstreamBody`; token-endpoint bodies are never read or logged.

Diagnostics never include credentials, cookies, tokens, OAuth codes, URLs
or original exception messages/stacks.
Unexpected exceptions are categorized as internal failures. Configure
Vercel/infrastructure retention and access appropriately; separately verify
that platform/proxy access logs do not retain OAuth callback query strings.

The UI distinguishes reconnect/permission/rate-limit, rejected workout,
unavailable service, network, invalid response and generic failures in all ten
languages. Transient refresh failures do not clear the session. Partial upload
successes remain recorded; scheduling and best-effort cleanup failures are both
logged under the same ID. Uploads are never automatically retried. After an
uncertain outcome, check Garmin before resending: an upstream write may have
succeeded despite a lost response, and failed cleanup can leave an orphan workout.

Run the focused mocked verification without calling Garmin:
`node scripts\verify-garmin.mjs`. It uses Node and the installed TypeScript compiler;
no test framework or real credentials are required. Redis REST and failure paths
are mocked as well. To additionally execute the production Lua script against
a real **local** Redis 5+ instance (no Upstash calls), start an isolated Redis
server bound to `127.0.0.1`, then run in PowerShell:

```powershell
$env:GARMIN_VERIFY_REDIS_PORT = "16379" # Port of your isolated local Redis
node scripts\verify-garmin.mjs
```

Those checks use uniquely prefixed keys and delete only their own keys. They
verify concurrent reservations across separate route instances, exact cooldown
boundaries, UTC-day exhaustion/reset, midnight cooldown carry-over, development
exemption and TTL expiry. Boundary tests replace only Redis's time source with a
deterministic clock; a separate check runs the unmodified script with Redis TIME.

Edit setup to update the current plan. Confirmation dialogs protect plan
replacement and deletion.

## End-to-end tests

Playwright tests in `e2e/` cover accounts and Garmin: sign-in by email code,
Garmin controls hidden when signed out, one Garmin account per Run Week account,
reconnecting, and sending and deleting a week.

Requirements: Docker running and Chromium installed once with
`npx playwright install chromium`. Then run:

```powershell
npm run test:e2e
```

- The tests start their own dev server on port 3100 (build directory
  `.next-e2e`, so `npm run dev` can keep running) and a Garmin mock on port 3101.
- Each run creates a new PostgreSQL container (`run-week-e2e-db`,
  `postgres:17-alpine`, `127.0.0.1:55432`, data in memory), applies the
  migrations, and removes the container at the end, with all test accounts.
  The development database is not used. Do not run two e2e runs at once.
- Email delivery is disabled; the tests replace the stored sign-in code
  directly in the database.
- Garmin is never called. `GARMIN_E2E_MOCK_ORIGIN` redirects the Garmin URLs to
  the mock and is ignored outside development.

## CI and deployment

`.github/workflows/ci.yml` runs on pushes to `main`, on pull requests to `main`
and manually. It has two jobs, which need no secrets:

- **Lint, typecheck and build**: `npm run lint`, `npm run typecheck`,
  `npm run build`.
- **E2E tests**: `npm run test:e2e`. On failure, the Playwright report and
  traces are uploaded as the `playwright-report` artifact.

Vercel deploys `main` through its GitHub integration. To promote a production
deployment only when both jobs pass, in the Vercel project:

1. **Settings → Environments → Production**: keep automatic aliasing of
   production deployments on.
2. **Settings → Build and Deployment → Deployment Checks → Add Checks**: choose
   **GitHub** and select **Lint, typecheck and build** and **E2E tests**. The
   jobs must have run at least once to be listed.

Vercel still builds each push to `main`, but the production domain keeps the
previous deployment until both checks pass. A failed check leaves the new
deployment unpromoted; **Force Promote** on the deployment page bypasses the
checks. Renaming a job requires updating the Deployment Checks.

## Languages

The UI is available in English, French, German, Spanish, Portuguese, Polish,
Russian, Ukrainian, Belarusian and Italian. The default language is the first supported language in
the browser's language settings, with English as the fallback. The language
selector overrides it and stores the choice in localStorage (`run-week-locale`).
Translations live in `src/features/i18n/messages`; `en.ts` defines the message
shape and the other locales must satisfy it.

Language is resolved in the browser rather than through locale URL segments,
because the app is a single page whose language choice is stored in the
browser. FIT workout
names are converted to ASCII for Garmin watch fonts; Russian, Ukrainian and
Belarusian FIT files use English names.

## Architecture

Keep program-specific UI and logic in `src/features/running-programs`. Add shared
UI components when another feature needs them. Keep route composition in
`src/app`, introducing client components when interactivity is needed.

The route remains a Server Component; interactive planner UI and browser storage
are Client Components. Calculation and generation helpers are independent of
React. Use the commands above to verify changes.

## Custom agents

The [`.github/agents`](.github/agents) directory contains project-specific
agents: the **Next.js Developer** implements changes, the **QA Engineer**
verifies acceptance criteria, the **Code Reviewer** reviews them, and the
**Feature Coordinator** orchestrates larger tasks.
