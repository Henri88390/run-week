# Run Week

A frontend-first browser-local running planner, built with Next.js
App Router, React, TypeScript, Tailwind CSS, and ESLint.

![Setup form](docs/screenshots/setup.png)

![Weekly plan](docs/screenshots/week.png)

![Workout details](docs/screenshots/workout-details.png)

## Getting started

Use Node.js 24 LTS and npm. From this directory:

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000).
On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate route types and check TypeScript |
| `npm run build` | Create the production build |
| `npm start` | Serve the production build |

## Structure

```text
.github/
  agents/                 Project-specific coding and review agents
src/
  app/                    Routes, root layout, metadata, global styles
  features/
    i18n/                 Locales, translated messages, language selector
    running-programs/
      components/         Running-program UI
      types.ts            Domain types independent of React
      domain.ts           Pure VDOT, schedule and workout generation functions
      storage.ts          Versioned localStorage validation
      use-planner-store.ts Hydration-safe browser store
    garmin/               Garmin Connect client hook and server-only API code
public/                   Static assets
```

The home page supports performance/profile setup and a current-week plan. Profile
and the current week are saved only in this browser's localStorage. There is no
account, database or cross-device sync. The only server code is the optional
Garmin Connect integration described below.
Clearing browser data deletes the planner. Failed writes show an in-memory-only
warning; invalid saved data is not silently overwritten. System fonts keep builds
independent of external font services.

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
and VDOT-derived pace targets where available. Transfer the downloaded file to
a compatible Garmin device using Garmin Connect or the device's supported
file-transfer method. Easy runs do not have FIT downloads; files are generated
in the browser and are not uploaded automatically.

## Garmin Connect

When configured, the week view can send runs to the Garmin Connect calendar.
The main page shows a persistent connected status and disconnect control, even
before a training week is created. Connection state is shared with the week and
workout modal; status-request failures are reported rather than silently hidden.
Connected users can send the week from its Garmin controls or one run from its
workout modal: the whole week (workouts and long run, or all runs) or a single day from the
day dialog. Each run becomes a Garmin workout scheduled on its date. Sending a
day again replaces the workout previously sent from this browser for that date
(the sent workout IDs are kept in localStorage, `run-week.garmin.v1`).
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
| `GARMIN_SESSION_SECRET` | Random string of at least 32 characters, used to encrypt the session cookie |
| `GARMIN_REDIRECT_URI` | Optional; defaults to `<origin>/api/garmin/callback`. Register it with Garmin. |
| `PRIVACY_HOSTING_PROVIDER` | Required for new Garmin authorization; publicly names hosting, CDN/proxy and managed logging processors. |

For `https://run-week.fyi`, register the OAuth callback as
`https://run-week.fyi/api/garmin/callback` and the privacy policy as
`https://run-week.fyi/privacy`. `/garmin/consent` is the user-facing consent page,
not the OAuth callback. These URLs must be deployed and publicly reachable
before submitting the application. Set `GARMIN_REDIRECT_URI` to the exact callback.
For Garmin's branding image, use
`https://run-week.fyi/run-week-branding.png` after deployment. The public PNG is
300 x 300 pixels; it is not used as a favicon.

The privacy policy and consent pages are in English; the planner footer link is
localized. Consent is required before authorization and its version/time are
stored in the encrypted OAuth cookies; legacy sessions require reconnection.
Disconnect clears both authorization and token cookies, and local Garmin IDs.
The privacy page provides local JSON export, consent withdrawal and confirmed
local deletion. It never exports credentials or claims to delete Garmin-side
workouts. Users manage those and revoke the OAuth grant in Garmin Connect.

Before submitting the policy, identify all actual infrastructure processors in
`PRIVACY_HOSTING_PROVIDER`, verify their logging/retention settings and ensure the
operator website provides a working privacy-contact channel. No runtime AI or
analytics processors are configured. Do not add them without updating the policy,
consent requirements and processor disclosure. Never log Garmin payloads, tokens
or OAuth callback query strings. Have the deployment-specific policy reviewed;
this page is not a guarantee of Garmin approval or legal compliance.

Without them, the Garmin controls are hidden. Authorization uses OAuth 2.0 with
PKCE. Tokens are stored only in an encrypted, httpOnly cookie; there is no
database. Disconnecting deletes the cookie; revoke access in Garmin Connect
account settings.

Route handlers in `src/app/api/garmin`: `connect`, `callback`, `status`,
`disconnect` and `workouts`. Garmin's API documentation is available only to
approved developers; the endpoints and payload format in
`src/features/garmin/server` follow public implementations and were not tested
against a live account. Check them against the official documentation, in
particular the scheduling endpoint.

Edit setup to update the current plan. Confirmation dialogs protect plan
replacement and deletion.

## Languages

The UI is available in English, French, German, Spanish, Portuguese, Polish,
Russian, Ukrainian, Belarusian and Italian. The default language is the first supported language in
the browser's language settings, with English as the fallback. The language
selector overrides it and stores the choice in localStorage (`run-week-locale`).
Translations live in `src/features/i18n/messages`; `en.ts` defines the message
shape and the other locales must satisfy it.

Language is resolved in the browser rather than through locale URL segments,
because the app is a single static page with browser-only data. FIT workout
names are converted to ASCII for Garmin watch fonts; Russian, Ukrainian and
Belarusian FIT files use English names.

## Architecture

Keep program-specific UI and logic in `src/features/running-programs`. Add shared
UI components when another feature needs them. Keep route composition in
`src/app`, introducing client components when interactivity is needed.

The route remains a Server Component; interactive planner UI and browser storage
are Client Components. Calculation and generation helpers are independent of
React. No test framework is configured; use the commands above to verify builds.

## Custom agents

The [`.github/agents`](.github/agents) directory contains project-specific
agents: the **Next.js Developer** implements changes, the **QA Engineer**
verifies acceptance criteria, the **Code Reviewer** reviews them, and the
**Feature Coordinator** orchestrates larger tasks.
