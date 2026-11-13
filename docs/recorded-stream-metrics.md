# Recorded splits and heart-rate records

These are descriptive metrics from already imported account-owned Strava streams,
not training advice. No GPS, new upstream requests, summary HR, summary distance,
moving time or smoothed chart values are used. Missing recordings remain missing.
Nothing new is persisted; the existing account-scoped, invalidated Redis activity
cache holds only bounded ranking results. The dashboard never receives full
history streams. The activity page receives computed splits and decimated charts.

## Kilometre splits

- Fixed cumulative recorded distance boundaries: 0–1000 m, 1000–2000 m, etc.
  The final non-zero partial kilometre uses its **actual recorded distance**.
- Boundary times are linearly interpolated on the recorded cumulative distance
  curve. Pace is elapsed seconds × 1000 / actual metres, including all stops.
  At an internal distance plateau use earliest arrival: a stop exactly at the
  boundary belongs to the following split. The last split includes any final
  stationary recording. There is no trailing zero-distance split.
- A recording beginning above zero cannot supply a complete first split.
  Missing distance intervals make affected split metrics unavailable; there is
  no interpolation across them. Reversed distance or invalid/non-increasing
  clocks reject the split series. Missing final distance rejects the series.
  Zero/one-point streams have no splits. Recordings over 1000 km are rejected
  to bound malformed input and table size.
- Average HR uses the elapsed-time integral below, not an arithmetic sample
  mean. It is unavailable unless the entire split has valid HR coverage.
  Maximum HR is the highest valid **recorded sample** within the inclusive
  split time span, never an interpolated maximum. An exact boundary sample can
  therefore appear in both adjacent splits. With partial HR, observed maximum
  remains available but the average does not; no samples means no maximum.

## Heart-rate rankings

- Separate top fives for individual recorded HR samples and elapsed windows of
  10 s, 1 min, 5 min, 10 min, 30 min, 1 h, 1 h 30 min and 2 h.
- A sample is finite and between 30 and 240 bpm inclusive (existing import
  limits). Each valid sample is a candidate, even without a valid adjacent
  interval; samples do not need a full window.
- **Finite boundary rule:** each window starts at a recorded timestamp and ends
  exactly the requested duration later. No arbitrary continuous shifts or
  additional end-anchored starts. The end may lie inside a valid interval.
  Incomplete tail windows are excluded. Candidates can overlap, and all five
  entries may come from the same activity. Distinct sample timestamps/windows
  are retained, not reduced to one record per activity.
- HR is held at the left recorded sample over each interval, matching existing
  `heartRateTimes` integration. Clip the last interval at the window end.
  Average = sum(HR × covered elapsed seconds) / requested elapsed seconds.
  Stopped time counts. There is no HR smoothing or inferred HR interpolation.
- Both endpoint HR samples must be valid; interval duration must be positive
  and at most **15 seconds**, matching the existing recording-gap convention.
  A missing/invalid endpoint or longer gap excludes every intersecting window,
  even when distance is stationary. Never bridge gaps, extrapolate the tail,
  or divide by only the known portion. Invalid/non-increasing timestamps
  reject that activity's HR series rather than reorder ambiguous samples.
- Rank on unrounded bpm descending, then local activity date ascending, opaque
  internal activity ID ascending, start offset ascending, end offset ascending.
  Equal-valued distinct samples/windows survive. UI rounds bpm to one decimal
  and offsets to tenths; ranking keeps full precision. Date, internal activity
  link and elapsed offset/span distinguish records from the same activity.
- The server scans **all** imported activities belonging to the authenticated
  account in cursor batches, independent of calendar filters. Each activity
  contributes at most five candidates per category to the global top five.
  Consent is checked before cached reads; cache revision v2 separates the new
  result shape. Existing import/disconnect invalidation continues to apply.

Verification: `node scripts/verify-strava-best-sections.mjs` covers synthetic
metrics and mocked server ownership/pagination/cache behavior; `--browser` adds
mocked component desktop/mobile light/dark keyboard checks after a build.
The targeted Docker-backed test is
`npm run test:e2e -- e2e/strava.spec.ts --grep "fastest sections"`.
