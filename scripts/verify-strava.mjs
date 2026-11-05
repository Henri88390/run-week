// Small dependency-free checks; all HTTP is mocked in-process, never real Strava.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const externalRequire = createRequire(import.meta.url);
const cache = new Map();
const moduleOverrides = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const compiledModule = { exports: {} };
  cache.set(file, compiledModule);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const require = (name) => {
    if (moduleOverrides.has(name)) return moduleOverrides.get(name);
    if (name === "server-only") return {};
    if (name.startsWith(".") || name.startsWith("@/")) {
      const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(`${base}.ts`);
    }
    return externalRequire(name);
  };
  new Function("require", "module", "exports", code)(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { heartRateTimes, criticalSpeed, heartRateZone, calendarRange, calendarWeeks, recordedPace, PRESET_MAX_HR,
  paceHistogram, aboveThresholdPercent, dominantZone, roundedDuration, activityAverages, effortPerformance,
  recentEnduranceRange, speedRetention, danielsEstimates } = load("src/features/strava/analytics.ts");
const { settingsSchema } = load("src/features/strava/types.ts");
const { bestMaximalPerformance } = load("src/features/running-programs/maximal-performance.ts");
const { calculateVdot } = load("src/features/running-programs/domain.ts");
const { MAXIMAL_PERFORMANCE_MESSAGES } = load("src/features/running-programs/maximal-performance-messages.ts");
const baseEffort = { id: "5k", name: "5 km", localDate: "2020-01-01", maximalEffort: true, distanceMeters: 5000, elapsedSeconds: 1500 };
const tenKm = { ...baseEffort, id: "10k", distanceMeters: 10000, elapsedSeconds: 2700 };
assert.equal(bestMaximalPerformance([]), null);
assert.equal(bestMaximalPerformance([{ ...baseEffort, maximalEffort: false }]), null);
assert.equal(bestMaximalPerformance([baseEffort]).vdot, calculateVdot(5000, 1500));
assert.equal(bestMaximalPerformance([{ ...baseEffort, elapsedSeconds: 1320 }, tenKm]).id, "10k", "Select highest VDOT, not highest raw speed");
assert.equal(bestMaximalPerformance([tenKm, { ...baseEffort, distanceMeters: 600, elapsedSeconds: 120 }]).id, "10k");
for (const value of [0, -1, NaN, Infinity, 1_000_000]) {
  assert.equal(bestMaximalPerformance([{ ...baseEffort, distanceMeters: value }]), null);
  assert.equal(bestMaximalPerformance([{ ...baseEffort, elapsedSeconds: value }]), null);
}
assert.equal(bestMaximalPerformance([{ ...baseEffort, distanceMeters: 5000.4, elapsedSeconds: 1500.4 }]).vdot, calculateVdot(5000, 1500));
assert.equal(Object.keys(MAXIMAL_PERFORMANCE_MESSAGES).length, 10);
for (const text of Object.values(MAXIMAL_PERFORMANCE_MESSAGES)) for (const value of Object.values(text)) assert.ok(value.length > 0);
const { stravaNoticeMessage, STRAVA_MESSAGES: linkedNoticeMessages } = load("src/features/strava/messages.ts");
const { linkedAccountEmail } = load("src/features/strava/server/linked-account-notice.ts");
const { seal } = load("src/features/garmin/server/session.ts");
const noticeNow = Date.now();
const noticeSecret = "mock-linked-account-notice-secret";
const sealedNotice = seal({ userId: "requesting-account", email: "linked@example.test", expiresAt: noticeNow + 60_000 }, noticeSecret);
assert.equal(linkedAccountEmail(sealedNotice, noticeSecret, "requesting-account", noticeNow), "linked@example.test");
assert.equal(linkedAccountEmail(sealedNotice, noticeSecret, "another-account", noticeNow), undefined);
assert.equal(linkedAccountEmail(sealedNotice, noticeSecret, "requesting-account", noticeNow + 60_000), undefined);
assert.equal(linkedAccountEmail(sealedNotice, "wrong-key", "requesting-account", noticeNow), undefined);
assert.equal(linkedAccountEmail("tampered", noticeSecret, "requesting-account", noticeNow), undefined);
assert.equal(linkedAccountEmail(seal({ userId: "requesting-account", email: "<script>", expiresAt: noticeNow + 60_000 }, noticeSecret),
  noticeSecret, "requesting-account", noticeNow), undefined);
for (const locale of Object.keys(linkedNoticeMessages)) {
  assert.ok(stravaNoticeMessage(locale, "alreadyLinked", "linked@example.test").includes("linked@example.test"));
  assert.equal(stravaNoticeMessage(locale, "alreadyLinked"), linkedNoticeMessages[locale].alreadyLinked);
  assert.equal(stravaNoticeMessage(locale, "connected"), linkedNoticeMessages[locale].connected);
}
const { StravaAlreadyLinkedError } = load("src/features/strava/server/api.ts");
class MockPrismaError extends Error {
  constructor(code) { super(code); this.code = code; }
}
let linkingRace = false;
let linkedOwner = { userId: "existing-account", user: { email: "linked@example.test" } };
const linkingDatabase = {
  async $transaction(work) {
    if (linkingRace) throw new MockPrismaError("P2002");
    return work({
      async $executeRaw() {},
      verificationToken: { async deleteMany() { return { count: 1 }; } },
      stravaConnection: { async findUnique() { return linkedOwner; } },
    });
  },
  stravaConnection: { async findUnique() { return linkedOwner; } },
};
moduleOverrides.set("@/features/account/server/db", { db: () => linkingDatabase });
moduleOverrides.set("@/generated/prisma/client", { Prisma: { PrismaClientKnownRequestError: MockPrismaError } });
moduleOverrides.set("./cache", { clearActivityCache: async () => {} });
moduleOverrides.set("./background-jobs", { createSyncJob: async () => {} });
moduleOverrides.set("./inngest", { requireBackgroundSync() {} });
const { saveConnection } = load("src/features/strava/server/store.ts");
moduleOverrides.clear();
for (const race of [false, true]) {
  linkingRace = race;
  await assert.rejects(saveConnection({ encryptionKey: noticeSecret }, "requesting-account",
    { athlete: { id: 123 } }, new Date(), "mock-state"),
  (error) => error instanceof StravaAlreadyLinkedError && error.accountEmail === "linked@example.test"
    && error.code === "alreadyLinked" && error.status === 409 && !error.message.includes("linked@example.test"));
}
linkedOwner = { userId: "existing-account", user: { email: null } };
linkingRace = false;
await assert.rejects(saveConnection({ encryptionKey: noticeSecret }, "requesting-account",
  { athlete: { id: 123 } }, new Date(), "mock-state"),
(error) => error instanceof StravaAlreadyLinkedError && error.accountEmail === null);
const { weeklyVolumes, averageWeeklyVolume } = load("src/features/strava/weekly-volume.ts");
const { WEEKLY_VOLUME_MESSAGES } = load("src/features/strava/weekly-volume-messages.ts");
const { METRIC_DEFINITIONS } = load("src/features/strava/metric-definitions.ts");
const { INDICATOR_MESSAGES } = load("src/features/strava/indicator-messages.ts");
const { DANIELS_MESSAGES } = load("src/features/strava/daniels-messages.ts");
const { rangePreviouslySynchronized, uncoveredRanges } = load("src/features/strava/sync-history.ts");
assert.deepEqual(uncoveredRanges([
  { start: "2024-02-01", end: "2024-03-01", syncedAt: "2024-04-01T00:00:00Z" },
], { start: "2024-01-01", end: "2024-04-01" }, "2026-11-05"), [
  { start: "2024-03-01", end: "2024-04-01" }, { start: "2024-01-01", end: "2024-02-01" },
]);
assert.deepEqual(uncoveredRanges([
  { start: "2024-01-01", end: "2025-01-01", syncedAt: "2025-01-02T00:00:00Z" },
], { start: "2024-06-01", end: "2024-07-01" }, "2026-11-05"), []);
assert.equal(rangePreviouslySynchronized([
  { start: "2026-10-01", end: "2026-10-15", syncedAt: "2026-11-04T10:00:00Z" },
  { start: "2026-10-15", end: "2026-11-01", syncedAt: "2026-11-04T10:00:00Z" },
], { start: "2026-10-01", end: "2026-11-01" }), true);
const { volumeBuckets, volumeAxisMaximum } = load("src/features/strava/volume-chart.ts");
for (const values of [[], [0], [.1], [4.9], [19.9], [20], [20.1], [567.8]]) {
  for (const increment of [1, 5]) {
    const maximum = volumeAxisMaximum(values, increment);
    assert.ok(maximum >= Math.max(0, ...values));
    for (const fraction of [0, .25, .5, .75, 1]) {
      assert.equal((maximum * fraction) % increment, 0);
    }
  }
}
const { VOLUME_CHART_MESSAGES } = load("src/features/strava/volume-chart-messages.ts");
assert.equal(Object.keys(VOLUME_CHART_MESSAGES).length, 10);
const volumeSamples = [
  { localDate: "2026-09-30", distanceMeters: 90000, movingSeconds: 9000 },
  { localDate: "2026-10-01", distanceMeters: 5000, movingSeconds: 1800 },
  { localDate: "2026-10-04", distanceMeters: 10000, movingSeconds: 3600 },
  { localDate: "2026-10-05", distanceMeters: 8000, movingSeconds: 3000 },
  { localDate: "2026-11-01", distanceMeters: 70000, movingSeconds: 7000 },
];
const monthlyVolume = volumeBuckets({ view: "month", month: "2026-10" }, volumeSamples);
assert.equal(monthlyVolume.length, 5);
assert.deepEqual(monthlyVolume[0], { start: "2026-10-01", end: "2026-10-04", distanceMeters: 15000, movingSeconds: 5400 });
assert.equal(monthlyVolume.at(-1).end, "2026-10-31");
assert.equal(monthlyVolume.reduce((sum, bucket) => sum + bucket.distanceMeters, 0), 23000);
assert.equal(monthlyVolume[2].distanceMeters, 0);
const yearlyVolume = volumeBuckets({ view: "year", year: "2026" }, volumeSamples);
assert.equal(yearlyVolume.length, 12);
assert.equal(yearlyVolume[9].distanceMeters, 23000);
assert.equal(yearlyVolume[9].movingSeconds, 8400);
const dailyVolume = volumeBuckets({ view: "week", date: "2026-10-01" }, volumeSamples);
assert.equal(dailyVolume.length, 7);
assert.equal(dailyVolume[0].start, "2026-09-28");
assert.equal(dailyVolume[3].distanceMeters, 5000);
assert.equal(dailyVolume[6].distanceMeters, 10000);
assert.equal(volumeBuckets({ view: "month", month: "2024-02" }, []).at(-1).end, "2024-02-29");
for (const locale of ["en", "fr", "de", "es", "pt", "pl", "ru", "uk", "be", "it"])
  for (const messages of [WEEKLY_VOLUME_MESSAGES[locale], METRIC_DEFINITIONS[locale], INDICATOR_MESSAGES[locale], { daniels: DANIELS_MESSAGES[locale] }])
    for (const value of Object.values(messages)) assert.ok(value.length > 0);
for (const vdot of [10, 30, 50, 85]) {
  const estimate = danielsEstimates(vdot);
  const oxygenAtPace = (pace) => -4.6 + .182258 * (60000 / pace) + .000104 * (60000 / pace) ** 2;
  assert.ok(Math.abs(oxygenAtPace(estimate.vmaPace) - vdot) < 1e-8);
  assert.ok(Math.abs(oxygenAtPace(estimate.thresholdPace) - vdot * .88) < 1e-8);
  assert.ok(estimate.thresholdPace > estimate.vmaPace);
  assert.ok(estimate.ratio > 0 && estimate.ratio < 100);
  assert.ok(Math.abs(estimate.ratio - (3600 / estimate.thresholdPace) / estimate.vmaKmh * 100) < 1e-8);
}
for (const value of [null, 0, -1, NaN, Infinity]) assert.equal(danielsEstimates(value), null);
assert.deepEqual(recentEnduranceRange("2026-11-04"), { start: "2026-08-13", end: "2026-11-05" });
assert.deepEqual(recentEnduranceRange("2024-03-01"), { start: "2023-12-09", end: "2024-03-02" });
assert.equal(speedRetention(4, 5), 80);
assert.equal(speedRetention(4, 4), 100);
for (const [critical, fastest] of [[null, 5], [4, null], [0, 5], [4, 0], [5, 4], [NaN, 5], [4, Infinity]])
  assert.equal(speedRetention(critical, fastest), null);
const volumeWeeks = weeklyVolumes([
  { localDate: "2026-10-25", distanceMeters: 10000, movingSeconds: 3600 },
  { localDate: "2026-10-26", distanceMeters: 20000, movingSeconds: 7200 },
  { localDate: "2026-11-01", distanceMeters: 10000, movingSeconds: 3600 },
  { localDate: "2026-11-02", distanceMeters: 90000, movingSeconds: 36000 },
]);
assert.deepEqual(volumeWeeks[1], { start: "2026-10-26", distanceMeters: 30000, movingSeconds: 10800 });
assert.deepEqual(averageWeeklyVolume(volumeWeeks, "2026-11-04", { weeks: 4 }),
  { weeks: 4, distanceMeters: 10000, movingSeconds: 3600 }, "Empty weeks count; current week is excluded");
assert.deepEqual(averageWeeklyVolume(volumeWeeks, "2026-11-01", { weeks: 1 }),
  { weeks: 1, distanceMeters: 10000, movingSeconds: 3600 }, "Sunday's ongoing week is excluded");
assert.deepEqual(averageWeeklyVolume(volumeWeeks, "2026-11-02", { weeks: 1 }),
  { weeks: 1, distanceMeters: 30000, movingSeconds: 10800 }, "Monday includes the week that just ended");
assert.deepEqual(averageWeeklyVolume(volumeWeeks, "2026-11-04", { month: "2026-11" }),
  { weeks: 0, distanceMeters: null, movingSeconds: null }, "Month without a fully completed in-month week is unavailable");
assert.deepEqual(averageWeeklyVolume(volumeWeeks, "2026-11-04", { month: "2026-10" }),
  { weeks: 3, distanceMeters: 10000 / 3, movingSeconds: 1200 }, "Month-boundary weeks are excluded");
assert.equal(averageWeeklyVolume([], "2024-03-01", { month: "2024-02" }).weeks, 3, "Leap month full weeks");
assert.equal(averageWeeklyVolume([], "2026-03-01", { month: "2026-02" }).weeks, 3, "Week ending on March 1 is outside February");
assert.equal(averageWeeklyVolume([], "2026-03-02", { month: "2026-02" }).weeks, 3);
assert.deepEqual(averageWeeklyVolume([], "2026-11-04", { weeks: 4 }),
  { weeks: 4, distanceMeters: 0, movingSeconds: 0 }, "Completed empty weeks average to zero");
const { streams, summaries, request } = load("src/features/strava/server/api.ts");
const { syncPeriodRange, syncPeriodSchema } = load("src/features/strava/sync-period.ts");
assert.deepEqual(syncPeriodRange({ view: "week", date: "2026-01-01" }), { start: "2025-12-29", end: "2026-01-05" });
assert.deepEqual(syncPeriodRange({ view: "month", month: "2024-02" }), { start: "2024-02-01", end: "2024-03-01" });
assert.deepEqual(syncPeriodRange({ view: "month", month: "2026-12" }), { start: "2026-12-01", end: "2027-01-01" });
assert.deepEqual(syncPeriodRange({ view: "year", year: "2026" }), { start: "2026-01-01", end: "2027-01-01" });
assert.equal(syncPeriodSchema.safeParse({ view: "week", date: "2026-02-30" }).success, false);
assert.equal(syncPeriodSchema.safeParse({ view: "month", month: "2026-13" }).success, false);
assert.equal(syncPeriodSchema.safeParse({ view: "year", year: "2026", backfill: true }).success, false);
const { STRAVA_MESSAGES } = load("src/features/strava/messages.ts");
const { HEART_RATE_MESSAGES } = load("src/features/strava/heart-rate-messages.ts");
assert.equal(Object.keys(STRAVA_MESSAGES).length, 10);
for (const messages of Object.values(STRAVA_MESSAGES)) {
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(STRAVA_MESSAGES.en).sort());
  for (const value of Object.values(messages)) assert.ok(typeof value === "string" && value.length > 0);
}
for (const messages of Object.values(HEART_RATE_MESSAGES))
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(HEART_RATE_MESSAGES.en).sort());
const { CALENDAR_MESSAGES } = load("src/features/strava/calendar-messages.ts");
assert.equal(Object.keys(CALENDAR_MESSAGES).length, 10);
for (const messages of Object.values(CALENDAR_MESSAGES))
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(CALENDAR_MESSAGES.en).sort());
const { CALENDAR_NAVIGATION } = load("src/features/strava/calendar-navigation-messages.ts");
assert.equal(Object.keys(CALENDAR_NAVIGATION).length, 10);
for (const messages of Object.values(CALENDAR_NAVIGATION))
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(CALENDAR_NAVIGATION.en).sort());
const { EFFORT_MESSAGES } = load("src/features/strava/effort-messages.ts");
assert.equal(Object.keys(EFFORT_MESSAGES).length, 10);
for (const messages of Object.values(EFFORT_MESSAGES))
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(EFFORT_MESSAGES.en).sort());
const { EFFORT_REMOVAL_MESSAGES } = load("src/features/strava/effort-removal-messages.ts");
assert.deepEqual(Object.keys(EFFORT_REMOVAL_MESSAGES).sort(), Object.keys(STRAVA_MESSAGES).sort());
for (const messages of Object.values(EFFORT_REMOVAL_MESSAGES)) {
  assert.deepEqual(Object.keys(messages).sort(), ["body", "title"]);
  for (const value of Object.values(messages)) assert.ok(value.length > 0);
}
const { SYNC_PROGRESS_MESSAGES, CACHE_PRIVACY_MESSAGES } = load("src/features/strava/sync-messages.ts");
assert.equal(Object.keys(SYNC_PROGRESS_MESSAGES).length, 10);
assert.deepEqual(Object.keys(CACHE_PRIVACY_MESSAGES).sort(), Object.keys(SYNC_PROGRESS_MESSAGES).sort());
for (const value of Object.values(CACHE_PRIVACY_MESSAGES)) assert.ok(value.length > 0);
const { PERFORMANCE_MESSAGES } = load("src/features/strava/performance-messages.ts");
assert.equal(Object.keys(PERFORMANCE_MESSAGES).length, 10);
for (const messages of Object.values(PERFORMANCE_MESSAGES)) {
  assert.deepEqual(Object.keys(messages).sort(), Object.keys(PERFORMANCE_MESSAGES.en).sort());
  for (const value of Object.values(messages)) assert.ok(typeof value === "string" && value.length > 0);
}
assert.deepEqual(activityAverages([]), { averageHr: null, pace: null });
assert.deepEqual(activityAverages([
  { averageHr: 140, movingSeconds: 100, distanceMeters: 500 },
  { averageHr: 160, movingSeconds: 300, distanceMeters: 1000 },
  { averageHr: null, movingSeconds: 100, distanceMeters: 500 },
]), { averageHr: 155, pace: 250 });
const { smoothSeries } = load("src/features/strava/chart-smoothing.ts");
assert.deepEqual(smoothSeries([0, 1, 2, 3, 4], [150, 150, 220, 150, 150]), [150, 150, 150, 150, 150]);
assert.deepEqual(smoothSeries([0, 1, 2, 30, 31], [150, null, 170, 190, 190]), [150, null, 170, 190, 190]);
assert.deepEqual(smoothSeries([0, 1, 2], [null, null, null]), [null, null, null]);
assert.deepEqual(smoothSeries([0], [145]), [145]);
const sustained = smoothSeries([0, 10, 20, 30, 40], [140, 140, 180, 180, 180]);
assert.equal(sustained[4], 180);
assert.equal(dominantZone([0, 10, 30, 20, 0]), 3);
assert.equal(dominantZone([0, 10, 10, 0, 0]), 2);
assert.equal(dominantZone([0, 0, 0, 0, 0]), null);
assert.deepEqual(roundedDuration(3590), { hours: 1, minutes: 0 });
assert.deepEqual(roundedDuration(29), { hours: 0, minutes: 0 });
assert.deepEqual(roundedDuration(30), { hours: 0, minutes: 1 });
assert.deepEqual(roundedDuration(5430), { hours: 1, minutes: 31 });
assert.equal(aboveThresholdPercent(60, 6000), 1);
assert.equal(aboveThresholdPercent(null, 6000), null);
assert.equal(aboveThresholdPercent(0, 0), null);
assert.equal(aboveThresholdPercent(0, 6000), 0);
const histogram = paceHistogram([{ time: [0, 5, 10, 15, 20, 25, 30, 60],
  velocity_smooth: [4, 3, 2, .5, 0, null, 4, 4] }]);
assert.equal(histogram.bins.reduce((sum, bin) => sum + bin.seconds, 0), 20);
assert.ok(Math.abs(histogram.averagePace - 4000 / 9.5) < 1e-10, "Average pace uses included time / distance, not arithmetic pace");
assert.ok(histogram.bins.length <= 25);
assert.ok(histogram.bins[0].start <= 250);
assert.ok(histogram.bins.at(-1).end >= 2000, "Sustained slow samples are not automatically walking");
const width = histogram.bins[0].end - histogram.bins[0].start;
for (const [i, bin] of histogram.bins.entries()) {
  assert.equal(bin.end - bin.start, width);
  if (i) assert.equal(histogram.bins[i - 1].end, bin.start);
}
for (let pace = 100; pace <= 2000; pace += .5) {
  const result = paceHistogram([{ time: [0, 5], velocity_smooth: [1000 / pace, 0] }]);
  assert.equal(result.bins.reduce((sum, bin) => sum + bin.seconds, 0), 5, `Every valid pace contributes exactly once: ${pace}`);
  assert.ok(result.bins.at(-1).end >= pace - 1e-10);
  assert.ok(result.bins.at(-1).end <= pace + 5);
  assert.ok(result.bins.length <= 25);
  assert.ok(Math.abs(result.averagePace - pace) < 1e-10);
}
assert.equal(paceHistogram([]), null);
const constantPace = paceHistogram([{ time: [0, 5, 10], velocity_smooth: [4, 4, 4] }]);
assert.equal(constantPace.averagePace, 250);
assert.equal(constantPace.bins.reduce((sum, bin) => sum + bin.seconds, 0), 10);
assert.equal(constantPace.bins.at(-1).end, 255);
const cutoff = paceHistogram([{ time: [0, 5], velocity_smooth: [1000 / 420, 0] }]);
assert.deepEqual(cutoff, { bins: [{ start: 420, end: 425, seconds: 5 }], averagePace: 420 });
function histogramForIntervals(intervals) {
  const time = [0];
  const velocity_smooth = [];
  for (const [pace, seconds] of intervals) {
    velocity_smooth.push(1000 / pace);
    time.push(time.at(-1) + seconds);
  }
  velocity_smooth.push(0);
  return paceHistogram([{ time, velocity_smooth }]);
}
for (const runningPace of [300, 420, 480, 540]) {
  const intervals = Array.from({ length: 99 }, () => [runningPace, 10]);
  const trimmed = histogramForIntervals([...intervals, [1200, 10]]);
  assert.equal(trimmed.bins.reduce((sum, bin) => sum + bin.seconds, 0), 990, "At most the slowest 1% of recorded time is omitted");
  assert.ok(trimmed.bins.at(-1).end <= runningPace + 5, "Axis adapts to the runner rather than keeping walking outliers");
  assert.ok(Math.abs(trimmed.averagePace - runningPace) < 1e-10, "Average excludes omitted samples");
  const sustained = histogramForIntervals([...intervals, [1200, 11]]);
  assert.equal(sustained.bins.reduce((sum, bin) => sum + bin.seconds, 0), 1001, "A tail larger than 1% stays included");
  const weighted = histogramForIntervals([...intervals.map(([pace]) => [pace, 1]), [1200, 15]]);
  assert.equal(weighted.bins.reduce((sum, bin) => sum + bin.seconds, 0), 114, "Cutoff uses recorded time, not sample counts");
}
const tied = histogramForIntervals([...Array.from({ length: 98 }, () => [300, 10]), [540, 10], [540, 10]]);
assert.equal(tied.bins.reduce((sum, bin) => sum + bin.seconds, 0), 1000, "All samples tied at the cutoff are retained");
const tinyTail = histogramForIntervals([...Array.from({ length: 100 }, () => [480, 10]), [1500, 1]]);
assert.equal(tinyTail.bins.reduce((sum, bin) => sum + bin.seconds, 0), 1000, "Sub-1% tail is omitted for slower runners too");
assert.equal(paceHistogram([{ time: [0, 30], velocity_smooth: [4, 4] }]), null, "Recording gaps are excluded");
assert.equal(settingsSchema.safeParse({ zoneBounds: [150, 130], thresholdBpm: null }).success, false);
assert.equal(settingsSchema.safeParse({ zoneBounds: [130, 130], thresholdBpm: 160 }).success, false);
assert.equal(settingsSchema.safeParse({ maxHr: 59 }).success, false);
assert.equal(settingsSchema.safeParse({ maxHr: 241 }).success, false);
assert.equal(PRESET_MAX_HR, 190);
assert.equal(recordedPace(4), 250);
assert.equal(recordedPace(2), 500);
for (const value of [0, .003, .499, -1, null, undefined, Infinity, NaN]) assert.equal(recordedPace(value), null);
assert.equal(recordedPace(.5), 2000);
assert.equal(paceHistogram([{ time: [0, 5, 10, 15], velocity_smooth: [.003, .499, 0, 0] }]), null);
const settings = settingsSchema.parse({ maxHr: 200 });
const measured = heartRateTimes([{ time: [0, 5, 10, 40, 45], heartrate: [140, 160, null, 181, 181], distance: null, velocity_smooth: null }], settings);
assert.deepEqual(measured.zones.map((zone) => zone.seconds), [0, 5, 5, 0, 5]);
assert.deepEqual(measured.threshold, { below: 10, above: 5 });
const boundaries = [139, 140, 159, 160, 169, 170, 179, 180, 181, 200];
assert.deepEqual(boundaries.map((hr) => heartRateZone(hr, 200)), [1, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
assert.equal(heartRateZone(201, 200), null);
assert.equal(heartRateZone(null, 200), null);
assert.equal(heartRateZone(180, null), null);
const exact = heartRateTimes([{ time: [0, 10, 20, 30], heartrate: [180, 181, 200, 200] }], settings);
assert.deepEqual(exact.threshold, { below: 10, above: 20 });
assert.equal(heartRateTimes([{ time: [0, 5], heartrate: null }], settingsSchema.parse({})).threshold, null);
assert.deepEqual(calendarRange("2026-11"), { start: "2026-10-26", end: "2026-12-07" });
assert.deepEqual(calendarRange("2027-02"), { start: "2027-02-01", end: "2027-03-01" });
assert.deepEqual(calendarRange("2026-11", "2026-11-01"), { start: "2026-10-26", end: "2026-11-02" });
assert.deepEqual(calendarRange("2027-01", "2027-01-01"), { start: "2026-12-28", end: "2027-01-04" });
const runs = [
  { id: "oct", localDate: "2026-10-31", movingSeconds: 3600, elapsedSeconds: 3600, distanceMeters: 10000, averageHr: 150 },
  { id: "nov-a", localDate: "2026-11-01", movingSeconds: 1800, elapsedSeconds: 1900, distanceMeters: 5000, averageHr: 180 },
  { id: "nov-b", localDate: "2026-11-01", movingSeconds: 5400, elapsedSeconds: 5500, distanceMeters: 15000, averageHr: 140 },
];
const weeks = calendarWeeks("2026-11", runs, new Map([
  ["oct", { above: 100, measured: 3600, zoneSeconds: [0, 1000, 1000, 1500, 100] }],
  ["nov-a", { above: 200, measured: 1000, zoneSeconds: [0, 300, 300, 200, 200] }],
  ["nov-b", { above: 0, measured: 500, zoneSeconds: [100, 400, 0, 0, 0] }],
]), 200);
assert.equal(weeks.length, 6);
assert.equal(weeks[0].movingSeconds, 10800);
assert.equal(weeks[0].distanceMeters, 30000);
assert.equal(weeks[0].aboveSeconds, 300);
assert.equal(weeks[0].partialHr, true);
assert.equal(weeks[0].days[6].zone, 2);
assert.equal(weeks[0].days[5].zone, 4); // Average HR is 150 (Z2), but most time was in Z4.
assert.equal(calendarWeeks("2026-11", runs, new Map(), 200, "2026-11-01").length, 1);
assert.equal(calendarWeeks("2026-11", runs, new Map(), 200, "2026-11-01")[0].movingSeconds, 10800);
assert.deepEqual(weeks[0].days[6].zoneSeconds, [100, 700, 300, 200, 200]);
assert.deepEqual(weeks[0].days[5].zoneSeconds, [0, 1000, 1000, 1500, 100]);
assert.deepEqual(weeks[0].days[0].zoneSeconds, [0, 0, 0, 0, 0]);
assert.deepEqual(calendarWeeks("2026-11", runs, new Map(), 200)[0].days[6].zoneSeconds, [0, 0, 0, 0, 0]);
assert.equal(calendarWeeks("2026-11", runs, new Map(), 200)[0].aboveSeconds, null);
assert.equal(calendarWeeks("2026-11", runs, new Map(), null)[0].aboveSeconds, null);
const efforts = [120, 300, 600].map((elapsedSeconds) => ({ elapsedSeconds, distanceMeters: 4 * elapsedSeconds + 200, maximalEffort: true }));
assert.equal(criticalSpeed(efforts).speed, 4);
assert.equal(criticalSpeed(efforts).rSquared, 1);
assert.equal(criticalSpeed(efforts.slice(0, 2)), null);
const oneEffort = { ...efforts[0], id: "one" };
assert.equal(effortPerformance([oneEffort]).speed, oneEffort.distanceMeters / oneEffort.elapsedSeconds);
assert.ok(effortPerformance([oneEffort]).vdot > 0);
assert.equal(effortPerformance([oneEffort]).count, 1);
assert.equal(effortPerformance(efforts.map((effort, i) => ({ ...effort, id: String(i) }))).activityId, "0");
assert.equal(effortPerformance([{ ...oneEffort, maximalEffort: false }]), null);
assert.ok(effortPerformance([{ ...oneEffort, elapsedSeconds: 119 }]).speed > 0);
assert.ok(effortPerformance([{ ...oneEffort, elapsedSeconds: 10800, distanceMeters: 42195 }]).vdot > 0);
assert.equal(effortPerformance([{ ...oneEffort, elapsedSeconds: 0 }]), null);
assert.equal(effortPerformance([{ ...oneEffort, distanceMeters: NaN }]), null);
assert.equal(criticalSpeed(efforts.map((e) => ({ ...e, maximalEffort: false }))), null);
assert.equal(criticalSpeed(efforts.map((e) => ({ ...e, elapsedSeconds: 120 }))), null);
assert.equal(criticalSpeed([{ ...efforts[0] }, { ...efforts[1], distanceMeters: 15000 }, efforts[2]]), null);
const originalFetch = global.fetch;
try {
  global.fetch = async (url, init) => {
    assert.equal(init.cache, "no-store"); assert.equal(init.redirect, "error"); assert.ok(init.signal instanceof AbortSignal);
    assert.ok(String(url).includes("keys=time,heartrate,velocity_smooth,distance,altitude"));
    assert.ok(!String(url).includes("latlng"));
    return Response.json({ time: { data: [0, 5] }, velocity_smooth: { data: [2, 3] } });
  };
  assert.deepEqual((await streams("synthetic-token", "1")).data, { time: [0, 5], heartrate: null, velocity_smooth: [2, 3], distance: null, altitude: null });
  global.fetch = async () => Response.json({
    time: { data: [0, 5] }, altitude: { data: [-12.5, 5] }, latlng: { data: [[1, 2], [3, 4]] },
  });
  const elevationStreams = (await streams("synthetic", "1")).data;
  assert.deepEqual(elevationStreams.altitude, [-12.5, 5], "Below-sea-level altitude is valid");
  assert.ok(!("latlng" in elevationStreams), "GPS coordinates are never persisted");
  global.fetch = async () => Response.json({ time: { data: [0, 5] }, altitude: { data: [10] } });
  await assert.rejects(streams("synthetic", "1"), (e) => e.diagnostic.reason === "sampleAlignment");
  global.fetch = async () => Response.json({ time: { data: [0, 5] }, heartrate: { data: [150] } });
  await assert.rejects(streams("synthetic", "1"), (e) => e.code === "unavailable" && e.diagnostic.reason === "sampleAlignment");
  global.fetch = async () => Response.json({ time: { data: [5, 0] } });
  await assert.rejects(streams("synthetic", "1"), (e) => e.code === "unavailable"
    && e.diagnostic.reason === "timestamps" && e.diagnostic.decreasingIntervals === 1);
  const originalStreamWarn = console.warn;
  const streamWarnings = [];
  try {
    console.warn = (...args) => streamWarnings.push(args);
    global.fetch = async () => Response.json({
      time: { data: [0, 0, 5, 5, 5, 10, 10] },
      heartrate: { data: [100, 140, 150, 160, 170, 180, null] },
      velocity_smooth: { data: [1, 2, 3, 4, 5, 6, 7] },
      distance: { data: [0, 0, 10, 11, 12, 30, 31] },
      altitude: { data: [-10, -5, 0, 2, 3, 5, null] },
    });
    const normalized = (await streams("synthetic", "1")).data;
    assert.deepEqual(normalized, {
      time: [0, 5, 10], heartrate: [140, 170, null], velocity_smooth: [2, 5, 7], distance: [0, 12, 31],
      altitude: [-5, 3, null],
    });
    assert.equal(heartRateTimes([normalized], settings).zones.reduce((sum, zone) => sum + zone.seconds, 0), 10);
    assert.deepEqual(streamWarnings[0], ["strava_stream_timestamps_normalized", { reason: "duplicates", removedSamples: 4 }]);
    global.fetch = async () => Response.json({ time: { data: [0, 0, 0] } });
    assert.deepEqual((await streams("synthetic", "1")).data, {
      time: [0], heartrate: null, velocity_smooth: null, distance: null, altitude: null,
    });
    global.fetch = async () => Response.json({ time: { data: [] } });
    assert.deepEqual((await streams("synthetic", "1")).data.time, []);
    global.fetch = async () => Response.json({ time: { data: [0, 0, 5] }, heartrate: { data: [140, 150] } });
    await assert.rejects(streams("synthetic", "1"), (e) => e.diagnostic.reason === "sampleAlignment");
    global.fetch = async () => Response.json({ time: { data: [0, 5, 5, 2] } });
    await assert.rejects(streams("synthetic", "1"), (e) => e.diagnostic.reason === "timestamps");
  } finally { console.warn = originalStreamWarn; }
  global.fetch = async () => new Response("", { status: 404 });
  assert.equal((await streams("synthetic", "1")).data, null);
  global.fetch = async () => new Response("", { status: 429, headers: { "X-ReadRateLimit-Limit": "100,1000", "X-ReadRateLimit-Usage": "100,200" } });
  await assert.rejects(request("/test", {}), (e) => e.code === "rateLimited" && e.retrySeconds > 0);
  global.fetch = async () => Response.json([], { headers: { "X-RateLimit-Limit": "200,2000", "X-RateLimit-Usage": "199,200" } });
  assert.ok((await summaries("synthetic", 1, 0, 100)).delay > 0);
  const summary = { id: 1, name: "Synthetic run", type: "Run", start_date: "2026-01-01T10:00:00Z",
    start_date_local: "2026-01-01T11:00:00Z", distance: 5000, moving_time: 1500, elapsed_time: 1510 };
  global.fetch = async () => Response.json([{ ...summary, total_elevation_gain: 42.5 }]);
  assert.equal((await summaries("synthetic", 1, 0, 100)).activities[0].total_elevation_gain, 42.5);
  for (const invalid of [-1, "10"]) {
    global.fetch = async () => Response.json([{ ...summary, total_elevation_gain: invalid }]);
    await assert.rejects(summaries("synthetic", 1, 0, 100), (e) => e.diagnostic.stage === "summaries");
  }
  global.fetch = async (url) => {
    assert.equal(new URL(url).searchParams.get("per_page"), "200");
    return Response.json(Array.from({ length: 200 }, (_, i) => ({ ...summary, id: i + 1 })));
  };
  assert.equal((await summaries("synthetic", 1, 0, 100, 200)).activities.length, 200);
  const originalWarn = console.warn;
  const warnings = [];
  try {
    console.warn = (...args) => warnings.push(args);
    for (const hr of [0, -1, 29, 241, 150, 30, 240, null, undefined]) {
      global.fetch = async () => Response.json([{ ...summary, average_heartrate: hr, max_heartrate: hr }, { ...summary, id: 2 }]);
      const result = await summaries("synthetic", 1, 0, 100);
      const expected = hr != null && hr >= 30 && hr <= 240 ? hr : null;
      assert.equal(result.activities.length, 2);
      assert.equal(result.activities[0].average_heartrate, expected);
      assert.equal(result.activities[0].max_heartrate, expected);
      assert.equal(result.activities[1].average_heartrate, null);
      assert.equal(result.activities[0].distance, summary.distance);
    }
    assert.equal(warnings.length, 4);
    assert.deepEqual(warnings[0], ["strava_summary_hr_excluded", {
      reason: "outOfRange", counts: { average_heartrate: 1, max_heartrate: 1 },
    }]);
    for (const hr of ["150", {}, true]) {
      global.fetch = async () => Response.json([{ ...summary, average_heartrate: hr }]);
      await assert.rejects(summaries("synthetic", 1, 0, 100), (e) =>
        e.diagnostic.stage === "summaries" && e.diagnostic.fields.includes("average_heartrate"));
    }
  } finally { console.warn = originalWarn; }
  global.fetch = async () => Response.json([{ id: "bad" }]);
  await assert.rejects(summaries("synthetic", 1, 0, 100), (e) => e.code === "unavailable"
    && e.diagnostic.stage === "summaries" && e.diagnostic.fields.includes("id") && !JSON.stringify(e.diagnostic).includes("bad"));
  global.fetch = async () => new Response("private-invalid-body");
  await assert.rejects(request("/test", {}), (e) => e.message === "unavailable" && e.diagnostic.reason === "invalidJson");
  global.fetch = async () => new Response("private-upstream-body", { status: 500 });
  await assert.rejects(request("/test", {}), (e) => e.diagnostic.reason === "http"
    && e.diagnostic.upstreamStatus === 500 && !JSON.stringify(e.diagnostic).includes("private"));
  global.fetch = async () => { throw new DOMException("private-timeout-message", "TimeoutError"); };
  await assert.rejects(request("/test", {}), (e) => e.diagnostic.reason === "timeout" && !JSON.stringify(e.diagnostic).includes("private"));
  global.fetch = async () => new Response("x", { headers: { "Content-Length": "9000000" } });
  await assert.rejects(request("/test", {}), (e) => e.code === "unavailable");
  global.fetch = async () => { throw new Error("private-network-details"); };
  await assert.rejects(request("/test", {}), (e) => e.message === "unavailable");
} finally { global.fetch = originalFetch; }
console.log("Strava mock checks passed: locale coverage, HR gaps/settings, critical-speed eligibility, streams/missing HR, quotas, bounds and sanitized failures.");
