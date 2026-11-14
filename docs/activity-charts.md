# Activity charts

The activity page uses the existing Recharts dependency with reusable stacked
tracks and one shared readout/cursor. Every available pace, HR and elevation
track is shown, with independent vertical scales and identical horizontal
margins. A time/distance selector appears only when the recorded distance stream
passes validation; distance is never inferred from speed.
The summary, chart group, individual available tracks, kilometre splits and
heart-rate zones are independently collapsible and initially open. Native
disclosures work with Enter and Space; collapsing does not clear the chart
cursor, axis, split or zone selections. Open/closed state is not persisted.
The existing maximal-effort checkbox and help remain visible beside the activity
title (wrapping on narrow screens), outside the collapsible sections.
Time-axis ticks use whole-minute coordinates with a readable 1/2/5 progression;
the exact elapsed endpoint is always included as the final tick, including a
fractional minute when needed. Responsive label spacing preserves that endpoint
and may hide intermediate labels, never replacing them with fractional minutes.
Distance-axis ticks remain at whole kilometres: every 1 km through 15 km, then
at 2 km steps, increasing through a 1/2/5/10 progression for longer runs to
keep the tick count manageable. A sub-kilometre chart may show only the true
zero mark. Both axes use explicit shared ticks without changing their scale.
Linear strokes and subtle fills do not bridge null samples or recording gaps.
Pace is seconds per kilometre; faster values appear higher. Below-sea-level
elevation is supported.

Display-only HR/speed smoothing and approximately 600-sample decimation are
unchanged. Raw imported streams still feed summaries, kilometre splits and
rankings. Tooltip/readout values describe the displayed samples, not new metrics.

Recorded distance remains in the unified readout. It requires a complete finite nonnegative nondecreasing recorded
distance stream and a strictly increasing recorded clock, checked **before**
decimation. Missing/reversed/constant distance shows as unavailable without
affecting the elapsed-time charts.
Distance is never integrated from speed, inferred from pace or allocated from
summary distance. Stationary distance plateaus retain distinct elapsed-time
positions (keyboard can inspect each).
Null separators occupy the midpoint of recording gaps solely to break the
geometry. Their readout shows elapsed position but no recorded distance or
measurements.

Hover or tap any track to retain a cursor across every available track. Focus the
chart group and use Left/Right, Home/End, or Escape. Each track header displays
its own selected measurement (pace min/km, HR bpm, elevation m), or the localized
unavailable state. The unified readout also reports all measurements and distance.
The synchronized cursor uses the selected time or recorded-distance coordinate
on every available track.
Readouts are accessible but do not announce every pointer move. Cursor and axis
selections remain in React memory only; there is no new browser/account storage
or upstream fetch.
HR shading preserves the existing fixed 190 bpm reference, now explicitly
disclosed as not personal zones. No zone customization.

The detail summary rounds elapsed seconds once before formatting hours, minutes
and seconds. Time in heart-rate zones uses the dashboard's fixed 190 bpm
reference and its raw, left-sample elapsed-interval rule (including pauses);
it is not personalized advice. Intervals longer than 15 seconds, missing or
invalid HR (outside 30–240 bpm), and time outside the recorded clock are
unclassified. A malformed clock leaves the entire elapsed duration
unclassified. Zone bars use elapsed time as their denominator; displayed
durations are individually rounded, so their displayed sum can differ by a
second from the rounded total. No coverage shows unavailable rather than
suggesting measured zeroes. The account dashboard currently uses the same
fixed reference rather than a per-account max HR setting. Activity Z5 extends
above the reference through 240 bpm; the dashboard retains its existing cap.

Zone rows are native whole-row toggle buttons with independent zero/one/multiple
selection, `aria-pressed`, keyboard focus and selected styling in both themes.
Selected BPM ranges shade the HR track (30 bpm inclusive, exact upper thresholds
exclusive except 240 inclusive). Zone-colored dashed interval overlays appear on
pace and elevation tracks only; green kilometre highlights remain on every track,
including HR. All ten locales
explain the interaction and page-only selection scope.
The server derives serializable classified spans from the same raw left-sample
holds used for displayed zone times. It maps endpoints using actual raw distance
pairs, interpolating only when elapsed duration clips a pair; never a proportional
or smoothed chart approximation. Same-zone adjacent holds merge only when
continuous, never across missing HR or recording gaps. Stops highlight elapsed
time but have no invented distance width; invalid distance disables that axis.
A shared theme-aware five-zone palette colors HR bands, interval overlays and
zone row accents, bars and selected backgrounds. Muted chart fills and selected
row tints preserve readable theme foreground text. Different adjacent selected
zones always retain their color identity; only continuous same-zone holds merge.
Zone identities are blue, muted green, yellow, orange and rose, in that order.
Selected vertical intervals use 22% fill opacity; selected horizontal HR ranges
use 28%. Base HR bands retain 8%, with unchanged outlines and metric strokes.
The browser regression uses independent exact RGB expectations for all five
opaque bars, row accents, base HR bands and selected horizontal/vertical SVG
fills and strokes in both themes at desktop/mobile widths. It also resolves
selected row tints to sRGB, rejects ancestor filters/opacity/blending, checks
hover and readable text contrast, and attaches screenshots and rendered RGB.
Matching two computed colors alone is not sufficient: missing CSS variables can
produce matching neutral fallbacks. When diagnosing local gray zones, inspect
the **served** stylesheet, not just source tokens. The reported local dev server
was serving CSS without the zone tokens/row rules; an independent warm E2E cache
also restored an older palette. Recompile stale CSS (clear the affected dev
Turbopack cache with that server stopped if necessary), rather than changing
selection geometry or disabling application-wide theme styles.
At most five memoized, plot-clipped SVG paths per pace or elevation track handle
disjoint intervals, plus at most five selected HR range rectangles. No vertical
zone paths are computed for HR. Cursor movement never recomputes
these paths or static chart geometry. No raw streams, persistence, dependencies
or upstream requests were added.

Kilometre row buttons independently toggle zero, one or multiple selected
intervals on every available track. Enter/Space work through native buttons
with `aria-pressed`, visible focus and selected styling in both themes.
Clicking or tapping anywhere on a row also toggles that split.
The smallest shared parent holds React-only selection, keyed by activity ID.
Highlights use cumulative raw split distances and the calculator's exact elapsed
boundaries, not smoothed/downsampled graph points or a time/distance ratio.
Boundary stops belong to the next split; final stops and partial kilometres
remain included. Unknown time boundaries produce no time-axis highlight.
Overlays use context like the shared cursor, without rebuilding static charts.

The first split starts at elapsed zero when the recording has a valid distance
sample at timestamp zero, even if that initial reading is already positive
(and below one kilometre). This uses the activity's elapsed origin, without
shifting cumulative kilometre boundaries or modifying recorded samples.
A late or missing initial sample cannot establish the start boundary;
internal missing distance invalidates the affected split; mismatched
time/distance lengths or reversed data are rejected. Missing HR endpoints or
intervals over 15 seconds independently invalidate HR averages. Displayed pace/HR
measurements do not prove raw distance/HR coverage. No proxy metrics,
raw-data rewriting, backfill or upstream requests were added. Positive initial
distance at elapsed zero and invalid initial coverage have regression tests.

Rows, ranges and formatters are memoized. The memoized Recharts body does not
receive selection props; only a lightweight cursor subscribes to the selected
time-or-distance coordinate through context. Identical index updates are
ignored. No additional animation-frame delay is introduced.

The browser regression checks the absence of metric checkboxes, displays every
available track, validates whole-minute time ticks and the exact endpoint across
responsive widths, and checks active axis styling. It sweeps three tracks built
from 3,600 synthetic input samples in both axis modes, checks development-only static-chart work marks and
that SVG geometry output remains unchanged during pointer movement, and records
frame intervals and pointer-to-readout latency in a JSON attachment.
Timings are local development-browser measurements, not a universal threshold.

Checks: `node scripts/verify-activity-charts.mjs` and
`npm run test:e2e -- e2e/activity-charts.spec.ts`.
Browser tests use synthetic account fixtures in the existing Docker harness,
never real Strava authorization or requests.
