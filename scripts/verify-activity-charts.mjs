// Synthetic, dependency-free chart regression checks; no credentials or API calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const externalRequire = createRequire(import.meta.url);
const modules = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (modules.has(file)) return modules.get(file).exports;
  const compiledModule = { exports: {} };
  modules.set(file, compiledModule);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (name) => {
    if (!name.startsWith(".") && !name.startsWith("@/")) return externalRequire(name);
    const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(file), name);
    return load(`${base}.ts`);
  };
  new Function("require", "module", "exports", code)(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { activityChartPoints, chartRows, hasRecordedDistance, chartExtent, timeAxisTicks, distanceAxisStepMeters, distanceAxisTicks } = load("src/features/strava/activity-chart-data.ts");
assert.deepEqual(timeAxisTicks(0), [0], "A zero-duration axis has one origin tick");
assert.deepEqual(timeAxisTicks(55.5), [0, 55.5], "Short runs retain the exact fractional endpoint");
assert.deepEqual(timeAxisTicks(125.5), [0, 60, 120, 125.5], "Intermediate time ticks remain whole minutes");
assert.deepEqual(timeAxisTicks(120), [0, 60, 120], "An endpoint on the minute grid is not duplicated");
assert.deepEqual(timeAxisTicks(600), [0, 120, 240, 360, 480, 600], "Time ticks use a readable integer-minute step");
assert.deepEqual(timeAxisTicks(7200), [0, 1200, 2400, 3600, 4800, 6000, 7200]);
assert.deepEqual(timeAxisTicks(-1), []);
assert.deepEqual(timeAxisTicks(Infinity), []);
assert.equal(distanceAxisStepMeters(15000), 1000, "Exactly 15 km uses 1 km steps");
assert.equal(distanceAxisStepMeters(15001), 2000, "More than 15 km switches to 2 km steps");
assert.equal(distanceAxisStepMeters(30000), 2000, "30 km stays within about 15 intervals");
assert.equal(distanceAxisStepMeters(31000), 5000, "Longer spans use a readable 1/2/5 progression");
assert.equal(distanceAxisStepMeters(76000), 10000, "Very long spans scale to larger integer steps");
assert.deepEqual(distanceAxisTicks(0, 15000), Array.from({ length: 16 }, (_, index) => index * 1000));
assert.deepEqual(distanceAxisTicks(0, 15001), Array.from({ length: 8 }, (_, index) => index * 2000));
assert.deepEqual(distanceAxisTicks(0, 31000), [0, 5000, 10000, 15000, 20000, 25000, 30000]);
assert.deepEqual(distanceAxisTicks(0, 800), [0], "A sub-kilometre chart shows only the true zero tick");
assert.ok(distanceAxisTicks(200, 800).length === 0, "Do not round partial distances to a false whole-kilometre tick");
assert.ok(distanceAxisTicks(0, 15500).every((tick) => tick % 1000 === 0), "All distance ticks are whole kilometres");
const stream = { time: [0, 5, 10, 40, 45], distance: [0, 20, 20, 100, 120],
  heartrate: [150, null, 170, 180, 180], velocity_smooth: [4, 0, 4, 4, 4], altitude: [-5, -2, null, 4, 4] };
const original = structuredClone(stream);
assert.equal(hasRecordedDistance(stream), true, "Stationary distance plateaus remain recorded");
const points = activityChartPoints(stream);
assert.deepEqual(stream, original, "Raw metric inputs are never mutated");
assert.equal(points[1].hr, null);
assert.equal(points[1].pace, null, "Stopped pace is not fabricated");
assert.equal(points[2].altitude, null);
assert.equal(points[3].gap, true);
assert.equal(points[0].altitude, -5, "Below-sea-level altitude survives");
const rows = chartRows(points);
assert.deepEqual(chartExtent(points, "altitude"), { min: -5, max: 4 });
assert.equal(chartExtent([], "hr"), null);
assert.equal(chartExtent([{ hr: null }], "hr"), null);
assert.equal(rows.length, 6);
assert.deepEqual(rows[3], { time: 25, distance: 60, hr: null, pace: null, altitude: null, gap: true, separator: true });
for (const distance of [null, [0, 1], [0, 20, null, 100, 120], [0, 20, 10, 100, 120],
  [0, 0, 0, 0, 0], [-1, 20, 30, 100, 120], [0, 20, NaN, 100, 120], [0, 20, Infinity, 100, 120]]) {
  assert.equal(hasRecordedDistance({ ...stream, distance }), false);
  assert.ok(activityChartPoints({ ...stream, distance }).every((p) => p.distance === null),
    "Never synthesize distance from recorded velocity");
}
assert.equal(hasRecordedDistance({ time: [0, 0], distance: [0, 10] }), false);
assert.deepEqual(activityChartPoints({ time: [], distance: null, heartrate: null, velocity_smooth: null, altitude: null }), []);
const time = Array.from({ length: 1201 }, (_, i) => i);
const long = { time, distance: time.map((t) => t * 4), heartrate: time.map(() => 160),
  velocity_smooth: time.map(() => 4), altitude: time.map(() => 10) };
long.heartrate[1] = null;
long.altitude[2] = null;
long.distance[1] = null;
const decimated = activityChartPoints(long);
assert.ok(decimated.length <= 601);
assert.equal(decimated.at(-1).time, 1200);
assert.equal(decimated[1].hr, null, "Missing samples omitted by the stride still break the HR curve");
assert.equal(decimated[1].altitude, null);
assert.ok(decimated.every((p) => p.distance === null), "Validate distance before decimation");
const gapDecimated = activityChartPoints({ ...long, time: time.map((t) => t >= 2 ? t + 20 : t) });
assert.equal(gapDecimated[1].gap, true, "Recording gaps omitted by the stride still break every curve");
const { smoothSeries } = load("src/features/strava/chart-smoothing.ts");
assert.deepEqual(smoothSeries([0, 5, 10, 40, 45], [160, 240, 160, 180, 180]), [160, 160, 160, 180, 180],
  "Existing display smoothing removes isolated spikes without smearing across recording gaps");
const { ACTIVITY_CHART_MESSAGES } = load("src/features/strava/activity-chart-messages.ts");
const { kilometreSplits } = load("src/features/strava/stream-metrics.ts");
const { activityZoneTimes, durationWithSeconds, heartRateTimes } = load("src/features/strava/analytics.ts");
assert.deepEqual(durationWithSeconds(59.49), { hours: 0, minutes: 0, seconds: 59 });
assert.deepEqual(durationWithSeconds(59.5), { hours: 0, minutes: 1, seconds: 0 });
assert.deepEqual(durationWithSeconds(3599.5), { hours: 1, minutes: 0, seconds: 0 });
const zoneStream = { time: [0, 10, 20, 30, 40, 50, 60, 80, 90, 100],
  heartrate: [132, 133, 152, 161.5, 171, 190, 191, null, 0, 150],
  distance: Array(10).fill(0), velocity_smooth: null, altitude: null };
const zoneResult = activityZoneTimes(zoneStream, 110);
assert.deepEqual(zoneResult.zones, [10, 10, 10, 10, 20], "Exact zone boundaries and HRmax are classified consistently");
assert.equal(zoneResult.unclassified, 50, "Gaps, missing readings and uncovered tail stay unclassified");
assert.equal(zoneResult.zones.reduce((a, b) => a + b, 0) + zoneResult.unclassified, 110);
assert.deepEqual(heartRateTimes([zoneStream], { maxHr: 190 }).zones.map((z) => z.seconds), zoneResult.zones);
assert.deepEqual(activityZoneTimes(null, 60), { zones: [0, 0, 0, 0, 0], unclassified: 60 });
assert.equal(activityZoneTimes({ ...zoneStream, time: [0, 10, 5] }, 60).unclassified, 60);
assert.deepEqual(activityZoneTimes({ ...zoneStream, time: [0, 10], heartrate: [160, null] }, 5),
  { zones: [0, 0, 5, 0, 0], unclassified: 0 }, "Left-sample hold and elapsed clipping match dashboard semantics");
const { selectedSplitIntervals, splitAxisBounds, toggleSplit } = load("src/features/strava/split-selection.ts");
const raw = {
  time: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50.5],
  distance: [0, 250, 500, 750, 1000, 1000, 1000, 1250, 1750, 2250, 2375.5],
  heartrate: Array(11).fill(160), velocity_smooth: Array(11).fill(4), altitude: Array(11).fill(10),
};
const rawBefore = structuredClone(raw);
const splits = kilometreSplits(raw);
assert.equal(splits[0].pace, 20, "A fully recorded first kilometre is already available");
assert.equal(splits[0].averageHr, 160);
assert.equal(splits[0].maxHr, 160);
assert.deepEqual(splits.map((s) => [s.startSeconds, s.endSeconds]), [[0, 20], [20, 42.5], [42.5, 50.5]],
  "Arrival at km 1 precedes the stop; the next split includes it. Fractional arrival is exact.");
assert.equal(splits[2].meters, 375.5, "Include the actual fractional final kilometre");
assert.deepEqual(selectedSplitIntervals(splits, []), []);
let selection = toggleSplit([], 1);
assert.deepEqual(selection, [1]);
selection = toggleSplit(selection, 3);
assert.deepEqual(selection, [1, 3]);
const intervals = selectedSplitIntervals(splits, selection);
assert.deepEqual(intervals.map((interval) => splitAxisBounds(interval, "distance")), [[0, 1000], [2000, 2375.5]]);
assert.deepEqual(intervals.map((interval) => splitAxisBounds(interval, "time")), [[0, 20], [42.5, 50.5]]);
assert.deepEqual(splitAxisBounds(selectedSplitIntervals(splits, [2])[0], "time"), [20, 42.5],
  "Do not use a moving-time ratio or downsampled points to convert distance");
selection = toggleSplit(selection, 1);
assert.deepEqual(selection, [3], "Independent deselection retains other splits");
assert.deepEqual(toggleSplit(selection, 3), [], "Return to zero selections");
assert.deepEqual(raw, rawBefore);
const missingInitial = kilometreSplits({ ...raw, distance: [null, ...raw.distance.slice(1)] });
assert.equal(missingInitial[0].startSeconds, null);
assert.equal(missingInitial[0].pace, null, "Never invent an initial zero sample");
assert.equal(splitAxisBounds(selectedSplitIntervals(missingInitial, [1])[0], "time"), null);
assert.equal(missingInitial[1].pace, splits[1].pace, "Later complete splits still recover");
const positiveInitial = kilometreSplits({ ...raw, distance: [10, ...raw.distance.slice(1)] });
assert.equal(positiveInitial[0].pace, 20,
  "A positive initial distance at elapsed zero retains the activity start");
assert.deepEqual(splitAxisBounds(selectedSplitIntervals(positiveInitial, [1])[0], "time"), [0, 20],
  "The first kilometre can be highlighted when its initial distance reading is positive");
assert.equal(kilometreSplits({ ...raw, time: raw.time.map((t) => t + 5) })[0].pace, 20,
  "A recorded zero at a later timestamp is valid; no artificial t=0 is needed");
for (const distance of [
  raw.distance.slice(1), [0, null, ...raw.distance.slice(2)],
  [0, 600, 500, ...raw.distance.slice(3)], [NaN, ...raw.distance.slice(1)],
]) {
  const result = kilometreSplits({ ...raw, distance });
  assert.ok(result.length === 0 || result[0].pace === null, "Invalid/misaligned raw remains honestly unavailable");
  assert.ok(activityChartPoints({ ...raw, distance }).some((point) => point.pace !== null),
    "A recorded pace graph can exist without usable raw distance; it is not a split proxy");
}
const missingInitialHr = kilometreSplits({ ...raw, heartrate: [null, ...raw.heartrate.slice(1)] })[0];
assert.equal(missingInitialHr.pace, 20);
assert.equal(missingInitialHr.averageHr, null, "Pace coverage cannot repair missing raw HR");
assert.equal(missingInitialHr.maxHr, 160);
const finalStop = kilometreSplits({ ...raw, time: [...raw.time, 55.5], distance: [...raw.distance, 2375.5] });
assert.equal(finalStop.at(-1).endSeconds, 55.5, "Highlight the entire final stopped plateau");
const { STREAM_MESSAGES } = load("src/features/strava/stream-messages.ts");
const { LOCALES } = load("src/features/i18n/locales.ts");
assert.deepEqual(Object.keys(ACTIVITY_CHART_MESSAGES).sort(), [...LOCALES].sort());
for (const copy of Object.values(ACTIVITY_CHART_MESSAGES)) {
  for (const value of Object.values(copy)) assert.ok(typeof value === "string" && value.length > 0);
}
for (const locale of LOCALES) assert.ok(STREAM_MESSAGES[locale].selectionHelp.length > 0);
const { activityZoneSelectionIntervals, selectedZoneIntervals, mergeZoneIntervals } = load("src/features/strava/zone-selection.ts");
const { activityZoneBounds } = load("src/features/strava/analytics.ts");
const { ACTIVITY_ZONES_MESSAGES } = load("src/features/strava/activity-zones-messages.ts");
assert.deepEqual([1, 2, 3, 4, 5].map(activityZoneBounds), [[30, 133], [133, 152], [152, 161.5], [161.5, 171], [171, 240]]);
const boundaryHrs = [29, 30, 132.99, 133, 151.99, 152, 161.49, 161.5, 170.99, 171, 190, 191, 240, 241, NaN, null];
const boundaryStream = { time: Array.from({ length: boundaryHrs.length + 1 }, (_, i) => i * 5),
  heartrate: [...boundaryHrs, 150], distance: null, velocity_smooth: null, altitude: null };
assert.deepEqual(activityZoneTimes(boundaryStream, 80), { zones: [10, 10, 10, 10, 20], unclassified: 20 });
const holds = activityZoneSelectionIntervals(boundaryStream, 80);
assert.deepEqual(holds.map((i) => [i.zone, i.startSeconds, i.endSeconds]),
  [[1, 5, 15], [2, 15, 25], [3, 25, 35], [4, 35, 45], [5, 45, 65]]);
assert.ok(holds.every((i) => i.startMeters === null && i.endMeters === null));
assert.deepEqual(selectedZoneIntervals(holds, []), []);
assert.deepEqual(selectedZoneIntervals(holds, [5, 1]), [holds[0], holds[4]]);
assert.deepEqual(selectedZoneIntervals(holds, toggleSplit([1, 5], 5)), [holds[0]]);
const clippedStream = { ...raw, heartrate: [160, 160, null, ...raw.heartrate.slice(3)] };
const clipped = activityZoneSelectionIntervals(clippedStream, 22.5);
assert.deepEqual(clipped, [
  { zone: 3, startSeconds: 0, endSeconds: 10, startMeters: 0, endMeters: 500 },
  { zone: 3, startSeconds: 15, endSeconds: 22.5, startMeters: 750, endMeters: 1000 },
], "Merge continuous same-zone holds, never bridge missing HR; retain a clipped stop");
assert.deepEqual(activityZoneSelectionIntervals({ ...raw, heartrate: Array(11).fill(200) }, 42.5),
  [{ zone: 5, startSeconds: 0, endSeconds: 42.5, startMeters: 0, endMeters: 2000 }],
  "Interpolate within the actual raw distance pair, not proportionally across the run");
assert.equal(activityZoneSelectionIntervals({ ...raw, distance: [2.2, ...raw.distance.slice(1)] }, 10)[0].startMeters, 2.2);
const stopped = activityZoneSelectionIntervals({ ...raw, heartrate: raw.heartrate.map((_, i) => i >= 4 && i <= 5 ? 200 : null) }, 50.5);
assert.deepEqual(stopped, [{ zone: 5, startSeconds: 20, endSeconds: 30, startMeters: 1000, endMeters: 1000 }]);
assert.deepEqual(splitAxisBounds(stopped[0], "time"), [20, 30]);
assert.equal(splitAxisBounds(stopped[0], "distance"), null, "A stop has no fabricated distance width");
assert.deepEqual(activityZoneSelectionIntervals({ ...raw, time: raw.time.map((t) => t >= 10 ? t + 20 : t) }, 100)
  .map((i) => [i.startSeconds, i.endSeconds]), [[0, 5], [30, 70.5]], "Long recording gaps are never merged");
for (const distance of [null, [0, 1], [0, null, ...raw.distance.slice(2)], [0, 600, 500, ...raw.distance.slice(3)]]) {
  assert.ok(activityZoneSelectionIntervals({ ...raw, distance }, 50.5).every((i) => i.startMeters === null && i.endMeters === null));
}
assert.deepEqual(activityZoneSelectionIntervals({ ...raw, time: [0, 0] }, 60), []);
assert.deepEqual(activityZoneSelectionIntervals(null, 60), []);
assert.deepEqual(mergeZoneIntervals(clipped), clipped);
const adjacentZones = [
  { zone: 1, startSeconds: 0, endSeconds: 5, startMeters: 0, endMeters: 20 },
  { zone: 2, startSeconds: 5, endSeconds: 10, startMeters: 20, endMeters: 40 },
];
assert.deepEqual(mergeZoneIntervals(adjacentZones), adjacentZones, "Adjacent different selected zones retain their identity");
assert.deepEqual(selectedZoneIntervals(adjacentZones, [1, 2]), adjacentZones);
const { ACTIVITY_ZONE_COLORS } = load("src/features/strava/activity-zone-palette.ts");
assert.equal(ACTIVITY_ZONE_COLORS.length, 5);
assert.equal(new Set(ACTIVITY_ZONE_COLORS).size, 5);
const many = { time: Array.from({ length: 20001 }, (_, i) => i),
  heartrate: Array.from({ length: 20001 }, (_, i) => i % 2 ? 200 : 132),
  distance: null, velocity_smooth: null, altitude: null };
assert.equal(activityZoneSelectionIntervals(many, 20000).length, 20000, "Disjoint zone spans retain exact coverage");
assert.equal(activityZoneSelectionIntervals({ ...many, heartrate: Array(20001).fill(200) }, 20000).length, 1);
for (const locale of LOCALES) assert.ok(ACTIVITY_ZONES_MESSAGES[locale].selectionHelp.length > 0);
console.log("Activity chart/split regression checks passed: valid first km, honest missing raw/HR/misalignment, fractional endpoints, stops, zero/multi/deselect, ticks, smoothing, downsampling, all 10 locales.");
