// Dependency-free synthetic checks. No database, credentials or Strava calls.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const externalRequire = createRequire(import.meta.url);
const modules = new Map();
const overrides = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (modules.has(file)) return modules.get(file).exports;
  const compiledModule = { exports: {} };
  modules.set(file, compiledModule);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const require = (name) => {
    if (overrides.has(name)) return overrides.get(name);
    if (name === "server-only") return {};
    if (name.startsWith(".") || name.startsWith("@/")) {
      const base = name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.tsx`);
    }
    return externalRequire(name);
  };
  new Function("require", "module", "exports", code)(require, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}

const { bestSections, PERFORMANCE_DISTANCES, insertRankedSection, sectionDuration } = load("src/features/strava/best-sections.ts");
const stream = (time, distance) => ({ time, distance });
const effort = (time, distance, index = 0) => bestSections(stream(time, distance)).efforts[index];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} ≠ ${b}`);
assert.deepEqual(PERFORMANCE_DISTANCES, [100, 200, 400, 1000, 1500, 3000, 5000, 10000, 21097.5, 42195]);
assert.deepEqual(effort([0, 30, 40], [0, 80, 160]), { seconds: 17.5, startSeconds: 22.5, endSeconds: 40 },
  "Optimal start is interpolated, not necessarily a sample");
assert.deepEqual(effort([0, 10, 40], [0, 80, 160]), { seconds: 17.5, startSeconds: 0, endSeconds: 17.5 },
  "Optimal finish is interpolated");
assert.deepEqual(effort([0, 10, 110, 120], [0, 50, 50, 100]), { seconds: 120, startSeconds: 0, endSeconds: 120 },
  "Internal stop counts, unlike moving time");
assert.deepEqual(effort([0, 100, 110, 210], [0, 0, 100, 100]), { seconds: 10, startSeconds: 100, endSeconds: 110 },
  "Stops outside the chosen section need not count");
assert.equal(effort([0, 10, 110], [0, 100, 100]).seconds, 10, "Earliest arrival at a plateau");
assert.equal(effort([0, 1, 2, 12], [0, 30, null, 130]), null, "Never bridge missing distance");
assert.equal(effort([0, 10, 20, 30, 40], [0, 100, null, 200, 300]).seconds, 10, "Valid continuous portions still contribute");
assert.equal(bestSections(stream([0, 10, 20, 30, 40], [0, 100, null, 200, 300])).incomplete, true);
for (const value of [
  null, stream([], []), stream([0], [0]), stream([0, 1], null),
  stream([0, 1], [0]), stream([0, 0, 1], [0, 100, 200]),
  stream([0, 2, 1], [0, 100, 200]), stream([0, 1, 2], [0, 200, 100]),
  stream([0, Infinity], [0, 100]), stream([0, 1], [0, NaN]),
  stream([0, 1], [0, 0]),
]) {
  const result = bestSections(value);
  assert.ok(result.efforts.every((item) => item === null));
  assert.equal(result.incomplete, true);
}
for (const [i, meters] of PERFORMANCE_DISTANCES.entries()) {
  near(effort([10, 10010], [50, 50050], i).seconds, meters / 5);
  assert.equal(effort([0, 100], [0, meters - 0.0001], i), null, "No distance tolerance inflates short recordings");
  near(effort([0, 100], [0, meters], i).seconds, 100);
  near(effort([0, 100], [0, meters + 0.0001], i).seconds, meters * 100 / (meters + 0.0001));
}
assert.equal(sectionDuration(59.99), "1:00.0");
assert.equal(sectionDuration(3599.99), "1:00:00.0");

// Independent quadratic reference: inverse each endpoint at every possible vertex.
function reference(time, distance, meters) {
  const inverse = (target, latest) => {
    const matches = [];
    for (let i = 0; i < distance.length; i++) {
      if (distance[i] === target) matches.push(time[i]);
      if (i && distance[i - 1] < target && target < distance[i])
        matches.push(time[i - 1] + (target - distance[i - 1]) / (distance[i] - distance[i - 1]) * (time[i] - time[i - 1]));
    }
    return matches.length ? (latest ? Math.max(...matches) : Math.min(...matches)) : null;
  };
  const durations = [];
  for (let i = 0; i < time.length; i++) {
    const end = inverse(distance[i] + meters, false);
    const start = inverse(distance[i] - meters, true);
    if (end !== null) durations.push(end - time[i]);
    if (start !== null) durations.push(time[i] - start);
  }
  return durations.length ? Math.min(...durations) : null;
}
let seed = 43;
const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
for (let trial = 0; trial < 200; trial++) {
  const time = [0], distance = [0];
  for (let i = 1; i < 50; i++) {
    time.push(time[i - 1] + 1 + random() * 300);
    distance.push(distance[i - 1] + (random() < .25 ? 0 : random() * 2500));
  }
  const result = bestSections(stream(time, distance));
  PERFORMANCE_DISTANCES.forEach((meters, i) => {
    const expected = reference(time, distance, meters);
    if (expected === null) assert.equal(result.efforts[i], null);
    else near(result.efforts[i].seconds, expected);
  });
}
const ranked = (activityId, seconds, localDate = "2024-01-01") => ({
  activityId, seconds, localDate, name: activityId, startSeconds: 0, endSeconds: seconds,
});
const top = [];
for (const id of ["z", "f", "e", "d", "c", "b", "a"]) insertRankedSection(top, ranked(id, 20));
assert.deepEqual(top.map((r) => r.activityId), ["a", "b", "c", "d", "e"]);
insertRankedSection(top, ranked("a", 19));
insertRankedSection(top, ranked("a", 21));
assert.equal(top.filter((r) => r.activityId === "a").length, 1);
assert.equal(top[0].seconds, 19);
insertRankedSection(top, ranked("new", 20, "2023-01-01"));
assert.deepEqual(top.map((r) => r.activityId), ["a", "new", "b", "c", "d"]);
const { BEST_SECTIONS_MESSAGES } = load("src/features/strava/best-sections-messages.ts");
const { LOCALES } = load("src/features/i18n/locales.ts");
for (const locale of LOCALES) for (const text of Object.values(BEST_SECTIONS_MESSAGES[locale])) assert.ok(text.length > 0);

const { heartRateRecords, kilometreSplits, HR_DURATIONS, insertRankedHr } = load("src/features/strava/stream-metrics.ts");
const { STREAM_MESSAGES } = load("src/features/strava/stream-messages.ts");
for (const locale of LOCALES) for (const text of Object.values(STREAM_MESSAGES[locale])) assert.ok(text.length > 0);
const recording = (time, heartrate, distance = null) => ({ time, heartrate, distance });
assert.deepEqual(HR_DURATIONS, [10, 60, 300, 600, 1800, 3600, 5400, 7200]);
const long = recording(Array.from({ length: 725 }, (_, i) => i * 10), Array(725).fill(160));
const records = heartRateRecords(long);
assert.equal(records.peak.length, 5);
assert.deepEqual(records.peak.map((r) => r.startSeconds), [0, 10, 20, 30, 40], "Distinct tied samples, not activities");
for (const [i, window] of records.windows.entries()) {
  assert.equal(window.seconds, HR_DURATIONS[i]);
  assert.equal(window.results.length, 5);
  assert.deepEqual(window.results.map((r) => r.startSeconds), [0, 10, 20, 30, 40], "Overlapping windows retained");
  for (const result of window.results) {
    near(result.bpm, 160);
    near(result.endSeconds - result.startSeconds, window.seconds);
  }
}
const irregular = recording([0, 2, 10, 12], [100, 200, 150, 100]);
near(heartRateRecords(irregular).windows[0].results.find((r) => r.startSeconds === 0).bpm, 180);
assert.notEqual(180, (100 + 200 + 150) / 3, "Elapsed weighting, not arithmetic sample averaging");
near(heartRateRecords(recording([0, 7, 14], [100, 200, 150])).windows[0].results[0].bpm, 130,
  "Fractional last interval uses left sample");
assert.equal(heartRateRecords(recording([0, 5, 10], [100, null, 200])).windows[0].results.length, 0);
assert.equal(heartRateRecords(recording([0, 16, 26], [240, 150, 150])).windows[0].results[0].startSeconds, 16);
assert.equal(heartRateRecords(recording([0, 5, 10], [100, 100, null])).windows[0].results.length, 0,
  "Invalid endpoint excludes entire window");
assert.equal(heartRateRecords(recording([0, 10], [100, 100])).windows[0].results.length, 1, "Exact complete window");
assert.equal(heartRateRecords(recording([0, 9.99], [100, 100])).windows[0].results.length, 0);
assert.deepEqual(heartRateRecords(recording([0, 1, 2, 3, 4], [29, 241, NaN, 30, 240])).peak.map((r) => r.bpm), [240, 30]);
for (const r of [null, recording([], []), recording([0, 0, 10], [100, 200, 200]),
  recording([0, 10, 5], [100, 200, 200]), recording([0, Infinity], [100, 200])]) {
  const result = heartRateRecords(r);
  assert.equal(result.peak.length, 0);
  assert.ok(result.windows.every((w) => !w.results.length));
}
assert.equal(heartRateRecords(recording([0], [200])).peak.length, 1, "Single valid sample is a peak");
assert.ok(heartRateRecords(recording([0], [200])).windows.every((w) => !w.results.length));
const hrTop = [];
for (const id of ["z", "f", "e", "d", "c", "b", "a"]) for (let t = 5; t >= 0; t--)
  insertRankedHr(hrTop, { activityId: id, localDate: "2020-01-01", bpm: 200, startSeconds: t, endSeconds: t + 10 });
assert.deepEqual(hrTop.map((r) => [r.activityId, r.startSeconds]), [["a", 0], ["a", 1], ["a", 2], ["a", 3], ["a", 4]]);
insertRankedHr(hrTop, { activityId: "a", localDate: "2020-01-01", bpm: 200, startSeconds: 0, endSeconds: 10 });
assert.equal(hrTop.length, 5, "Do not duplicate the same window");
insertRankedHr(hrTop, { activityId: "z", localDate: "2019-01-01", bpm: 200, startSeconds: 0, endSeconds: 10 });
assert.equal(hrTop[0].activityId, "z", "Date precedes ID in deterministic ties");
// Quadratic independent HR reference over every recorded start and clipped interval.
for (let trial = 0; trial < 80; trial++) {
  const time = [0], hr = [100];
  for (let i = 1; i < 80; i++) {
    time.push(time[i - 1] + 1 + Math.floor(random() * 18));
    hr.push(random() < .08 ? null : 100 + Math.floor(random() * 100));
  }
  const actual = heartRateRecords(recording(time, hr));
  for (const window of actual.windows) {
    const expected = [];
    for (const start of time) {
      const end = start + window.seconds;
      if (end > time.at(-1)) continue;
      let sum = 0, valid = true;
      for (let i = 0; i + 1 < time.length; i++) {
        const dt = Math.min(end, time[i + 1]) - Math.max(start, time[i]);
        if (dt <= 0) continue;
        if (hr[i] === null || hr[i + 1] === null || time[i + 1] - time[i] > 15) valid = false;
        else sum += hr[i] * dt;
      }
      if (valid) expected.push({ bpm: sum / window.seconds, startSeconds: start, endSeconds: end });
    }
    expected.sort((a, b) => b.bpm - a.bpm || a.startSeconds - b.startSeconds);
    assert.deepEqual(window.results, expected.slice(0, 5));
  }
}
const splitFixture = recording([0, 10, 20, 30, 40, 50], [100, 120, 140, 160, 180, 200], [0, 500, 500, 1500, 2000, 2250]);
const splits = kilometreSplits(splitFixture);
assert.deepEqual(splits.map((s) => s.meters), [1000, 1000, 250]);
assert.deepEqual(splits.map((s) => s.pace), [25, 15, 40], "Interpolated boundary, stop, actual partial distance");
near(splits[0].averageHr, (1000 + 1200 + 700) / 25);
near(splits[1].averageHr, (700 + 1600) / 15);
assert.equal(splits[0].maxHr, 140);
assert.equal(splits[1].maxHr, 180);
const stopped = kilometreSplits(recording([0, 10, 20, 30, 40], [100, 200, 200, 150, 150], [0, 1000, 1000, 2000, 2000]));
assert.deepEqual(stopped.map((s) => s.pace), [10, 30], "Internal plateau assigned next split; final stop included");
near(stopped[1].averageHr, (2000 + 2000 + 1500) / 30);
assert.equal(stopped.length, 2, "No extra zero-distance partial");
near(heartRateRecords(recording([0, 5, 10], [100, 200, 200], [0, 0, 0])).windows[0].results[0].bpm, 150,
  "Stationary elapsed time still contributes to HR records");
const missingHr = kilometreSplits(recording([0, 10, 20], [100, null, 200], [0, 500, 1000]))[0];
assert.equal(missingHr.averageHr, null);
assert.equal(missingHr.maxHr, 200);
assert.equal(kilometreSplits(recording([0, 20], [100, 200], [0, 1000]))[0].averageHr, null);
assert.equal(kilometreSplits(recording([0, 20], [100, 200], [0, 1000]))[0].pace, 20, "HR gaps do not discard valid elapsed distance");
assert.equal(kilometreSplits(recording([0, 10, 20], [100, 100, 100], [0, null, 1000]))[0].pace, null);
assert.deepEqual(kilometreSplits(recording([0, 10, 20, 30], null, [0, null, 1000, 2000])).map((s) => s.pace),
  [null, 10], "Known later splits recover without bridging an earlier missing distance");
assert.equal(kilometreSplits(recording([0, 10], null, [0, 250]))[0].maxHr, null);
assert.equal(kilometreSplits(recording([0, 10], null, [50, 250]))[0].pace, null);
for (const r of [null, recording([], [], []), recording([0], [100], [0]), recording([0, 10], null, [0, 0]),
  recording([0, 0], null, [0, 1000]), recording([0, 10, 5], null, [0, 500, 1000]),
  recording([0, 10, 20], null, [0, 1000, 500]), recording([0, 10], null, [0, null])])
  assert.deepEqual(kilometreSplits(r), []);
console.log("Recorded stream metrics: all 8 durations + peak, finite sample starts, overlap/repeated activity, ties/top5, missing/gaps/clocks, elapsed weighting, synthetic split interpolation/stops/partial km passed.");

// Server query boundary, ownership, consent, pagination and account-scoped cache.
const { STRAVA_CONSENT_VERSION } = load("src/features/strava/types.ts");
const cached = new Map();
let hrComputations = 0;
overrides.set("../stream-metrics", {
  HR_DURATIONS, insertRankedHr,
  heartRateRecords(stream) { hrComputations++; return heartRateRecords(stream); },
});
let reads = 0, connectionReads = 0, consent = STRAVA_CONSENT_VERSION;
const queries = [];
const ownedRows = Array.from({ length: 205 }, (_, i) => ({
  id: `a-${String(i).padStart(3, "0")}`, userId: "alice", name: "Synthetic", localDate: "2020-01-01",
  streams: { time: Array.from({ length: 1001 }, (_, i) => i * 10),
    distance: Array.from({ length: 1001 }, (_, i) => i * 50),
    velocity_smooth: null, heartrate: Array(1001).fill(160), altitude: null },
}));
ownedRows.push({ ...ownedRows[0], id: "bob-private", userId: "bob", name: "Not Alice", streams: {
  ...ownedRows[0].streams, time: [0, 5000], distance: [0, 50000], heartrate: [220, 220],
} });
overrides.set("@/features/account/server/db", { db: () => ({
  stravaConnection: { async findUnique({ where }) {
    connectionReads++;
    return ["alice", "bob"].includes(where.userId) ? { consentVersion: consent } : null;
  } },
  stravaActivity: { async findMany(query) {
    reads++;
    queries.push(query);
    assert.deepEqual(Object.keys(query.where), ["userId"], "No page filters");
    const owned = ownedRows.filter((row) => row.userId === query.where.userId);
    const offset = query.cursor ? owned.findIndex((row) => row.id === query.cursor.id) + query.skip : 0;
    return owned.slice(offset, offset + query.take);
  } },
}) });
overrides.set("./cache", {
  async readActivityCache(userId, field) { return cached.get(`${userId}:${field}`) ?? null; },
  async writeActivityCache(userId, field, data) {
    assert.ok(field.startsWith("dashboard:"), "Stream commits invalidate this namespace");
    cached.set(`${userId}:${field}`, data);
  },
});
const { accountBestSections } = load("src/features/strava/server/best-sections.ts");
const { StravaError } = load("src/features/strava/server/api.ts");
await assert.rejects(accountBestSections(""), (error) => error instanceof StravaError && error.status === 401);
assert.equal(connectionReads, 0);
await assert.rejects(accountBestSections("unknown"), (error) => error.code === "notConnected");
assert.equal(reads, 0);
const alice = await accountBestSections("alice");
assert.equal(hrComputations, 205, "Compute HR once per activity, not once per distance category");
assert.equal(reads, 3, "Full history includes the final partial batch");
assert.equal(alice.distances.length, 10);
assert.ok(alice.distances.every((d) => d.results.length === 5 && d.results.every((r) => r.activityId.startsWith("a-"))));
assert.ok(alice.heartRate.peak.every((r) => r.activityId === "a-000"));
assert.deepEqual(alice.heartRate.peak.map((r) => r.startSeconds), [0, 10, 20, 30, 40]);
assert.ok(alice.heartRate.windows.every((w) => w.results.length === 5 && w.results.every((r) => r.activityId === "a-000")));
assert.ok((await accountBestSections("bob")).distances.every((distance) =>
  distance.results.length === 1 && distance.results[0].activityId === "bob-private"));
assert.equal(reads, 4);
assert.ok((await accountBestSections("bob")).heartRate.peak.every((r) => r.activityId === "bob-private"));
assert.ok(alice.heartRate.peak.every((r) => r.activityId !== "bob-private"), "Higher outsider HR cannot leak");
assert.deepEqual(await accountBestSections("alice"), alice);
assert.equal(reads, 4, "Independent cache shared across calendar periods");
consent = "old";
await assert.rejects(accountBestSections("alice"), (error) => error.code === "notConnected", "Consent checked before cached results");
consent = STRAVA_CONSENT_VERSION;
cached.clear();
ownedRows[0].streams = null;
assert.equal((await accountBestSections("alice")).distances.length, 10, "Unavailable recordings do not remove distance cards");
assert.ok(queries.every((query) => query.take === 100));
console.log("Strava best sections: synthetic interpolation, stops, gaps, boundaries, all distances, ordering, pagination, consent and account isolation passed.");

if (process.argv.includes("--browser")) {
  // Render the actual component with a synthetic locale context and production CSS.
  // This checks component layout/keyboard use, not authenticated Next.js navigation.
  const { chromium } = await import("@playwright/test");
  const React = externalRequire("react");
  const { renderToStaticMarkup } = externalRequire("react-dom/server");
  let locale = "en";
  overrides.set("@/features/i18n/use-i18n", { useI18n: () => ({ locale, t: { units: { km: "km", min: "min", h: "h" } } }) });
  const { BestSections } = load("src/features/strava/components/best-sections.tsx");
  const { KilometreSplits } = load("src/features/strava/components/kilometre-splits.tsx");
  const chunks = path.join(root, ".next/static");
  const css = fs.readdirSync(chunks, { recursive: true }).filter((name) => name.endsWith(".css"))
    .map((name) => fs.readFileSync(path.join(chunks, name), "utf8")).join("\n");
  assert.ok(css.length, "Run npm run build before browser verification");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Synthetic internal activity</h1>" }));
    for (const width of [1280, 390]) for (const theme of ["light", "dark"]) {
      locale = width === 390 ? "fr" : "en";
      const fixture = structuredClone(alice);
      fixture.distances[9].results = [];
      fixture.distances[0].results[0].name = "Long synthetic activity name ".repeat(8);
      const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
        React.createElement(BestSections, { data: fixture }),
        React.createElement(KilometreSplits, { splits })));
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(`<!doctype html><html lang="${locale}" data-theme="${theme}"><head><base href="http://run-week.test"><style>${css}</style></head><body><main class="mx-auto max-w-6xl px-4 py-6">${markup}</main></body></html>`);
      assert.equal(await page.locator("[data-distance-sections] article").count(), 10);
      assert.equal(await page.locator("[data-distance-sections] article").first().locator("li").count(), 5);
      const rankedItems = page.locator("[data-distance-sections] article").first().locator("li");
      for (let rank = 0; rank < 5; rank++) {
        const rankLabel = rankedItems.nth(rank).locator(".sr-only");
        assert.equal(await rankLabel.textContent(), String(rank + 1), "Rank is available to screen readers");
        const rankStyle = await rankLabel.evaluate((element) => {
          const style = getComputedStyle(element);
          return { position: style.position, width: style.width, clipPath: style.clipPath };
        });
        assert.deepEqual(rankStyle, { position: "absolute", width: "1px", clipPath: "inset(50%)" }, "Rank is visually hidden");
        assert.equal(await rankedItems.nth(rank).locator("svg").getAttribute("aria-hidden"), "true", "Medal icon is decorative");
      }
      assert.equal(await page.locator("[data-best-sections] ol").first().evaluate((element) =>
        getComputedStyle(element).listStyleType), "none", "Native numeric markers are not visible");
      assert.equal(await page.locator("[data-distance-sections] article").last().innerText().then((text) => text.includes(BEST_SECTIONS_MESSAGES[locale].empty)), true);
      assert.equal(await page.locator("[data-hr-records] article").count(), 9);
      assert.equal(await page.locator("[data-hr-records] li").count(), 45);
      assert.match(await page.locator("[data-hr-records] a").first().innerText(), /160[.,]0 bpm - .*\n\+0:00\.0/);
      assert.equal(await page.locator("[data-kilometre-splits] tbody tr").count(), 3);
      assert.match(await page.locator("[data-kilometre-splits] tbody tr").last().innerText(), /0[.,]250/);
      assert.equal(await page.locator("[data-best-sections] h1 + p").count(), 0, "No explanatory text below the title");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${width}px ${theme}: no horizontal overflow`);
      const definitions = page.locator("[data-hr-records] summary");
      await definitions.focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("[data-hr-records] details").getAttribute("open"), "");
      const splitRegion = page.locator("[data-kilometre-splits] [role=region]");
      await splitRegion.focus();
      assert.equal(await splitRegion.evaluate((element) => element === document.activeElement), true);
      await page.locator("body").click({ position: { x: 1, y: 1 } });
      await page.locator("[data-best-sections] a").first().focus();
      const firstLink = page.locator("[data-best-sections] a").first();
      assert.equal(await firstLink.evaluate((element) => element === document.activeElement), true, "Keyboard reaches first activity link");
      assert.match(await firstLink.innerText(), /^0:20\.0 - /, "Link is elapsed time, separator and localized date");
      assert.equal((await firstLink.innerText()).includes("Synthetic"), false, "Activity name is not shown");
      const target = await firstLink.getAttribute("href");
      assert.ok(target.startsWith("/activities/a-"));
      await page.keyboard.press("Enter");
      await page.waitForURL(`http://run-week.test${target}`);
      assert.equal(await page.getByRole("heading", { name: "Synthetic internal activity" }).isVisible(), true);
      await page.goto("about:blank");
    }
    console.log("Mocked component browser checks passed: desktop/mobile, light/dark, en/fr, empty states, medal ranks, no overflow, Tab and Enter internal links.");
  } finally { await browser.close(); }
}
