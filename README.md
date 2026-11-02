# Run Week

A frontend-first browser-local running planner, built with Next.js
App Router, React, TypeScript, Tailwind CSS, and ESLint.

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
    running-programs/
      components/         Running-program UI
      types.ts            Domain types independent of React
      domain.ts           Pure VDOT, schedule, feedback and generation functions
      storage.ts          Versioned localStorage validation
      use-planner-store.ts Hydration-safe browser store
public/                   Static assets
```

The home page supports performance/profile setup, current/next week previews,
per-run feedback and read-only week history. Profile, preferences and weeks are
saved only in this browser's localStorage. There is no account, backend, database
or cross-device sync. Clearing browser data deletes the planner. Failed writes
show an in-memory-only warning; invalid saved data is not silently overwritten.
System fonts keep builds independent of external font services.

VDOT uses the Daniels–Gilbert race-performance equations. Setup includes the
average weekly distance over the last four weeks. This value is optional. When
provided, generated weekly volume targets that average and does not increase
automatically. VDOT easy pace converts that distance to total duration, which is
distributed among workouts by type and neighboring sessions. Without a volume
value, session durations use the VDOT-based baseline. Difficult or skipped
feedback reduces the next target or baseline by 5%. Existing local planner data
is migrated by estimating volume from its saved workout durations and VDOT pace.

Easy pace estimates invert the oxygen-cost equation at 59–74% of VDOT. Full
equations and limits are shown in the UI. Each generated week retains its own
VDOT/profile snapshot. These are illustrative estimates, not personalized
training or medical advice.

Generated workout categories follow the selected run count: one VO₂ max workout;
two runs (easy and workout); three runs (workout, easy, long); four runs (workout,
two easy, long); five or more (VO₂ max, easy, threshold, long, then additional
easy runs). The total weekly duration is allocated in proportion to workout-type
and neighboring-session weights. Workout and long runs are spaced as evenly as
the selected weekdays allow, with the long run favored for a weekend when
spacing is otherwise equal. The displayed distance is a separate estimate based
on the VDOT easy-pace range. Missing feedback is unknown. These are product
heuristics, not scientifically validated training rules.

VO₂ max sessions use VDOT-derived I-pace estimates and 3-minute repeats with
2-minute easy jog recoveries. Threshold sessions use VDOT-derived T-pace
estimates and continuous or repeated efforts, fitted to the planned session
duration. The pace ranges and example formats follow the [VDOT2 training
definitions](https://vdoto2.com/Calculator). These are illustrative sessions,
not individualized coaching advice.

Next-week generation offers optional, one-week-only volume, intensity and run
count preferences. Five-point volume and intensity sliders make finer adjustments.
Volume increases use current-week estimated distance and
VDOT: the heuristic scales from 2–30% at higher volumes, and can approach 100%
for high VDOT at low volume. The two decrease settings reduce volume by 5% or
10%, while the increase settings apply half or all of the calculated increase.
Intensity changes VO₂ max repetitions or threshold work within the planned
session duration. Difficult or skipped feedback suppresses increases; run-count
changes do not alter the saved schedule.

Generate next week to preview it; regenerate to incorporate later feedback or
setup edits. Ending the week explicitly promotes the preview and archives the
current week. Weeks do not automatically advance with the clock. Confirmation
dialogs protect preview replacement, advancement and deletion.

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
