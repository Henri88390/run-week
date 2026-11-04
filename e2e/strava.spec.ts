import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { createHash } from "node:crypto";
import { APP_URL, DATABASE_URL, REDIS_URL } from "./env";
import { createClient } from "redis";
import { createWeek, signIn, uniqueEmail } from "./helpers";

const MOCK = "http://127.0.0.1:3102";
const CONSENT = "2026-11-04-v1";
async function query(sql: string, params: unknown[] = []) {
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try {
    const result = await client.query(sql, params);
    if (/^\s*(UPDATE|INSERT|DELETE)\b/.test(sql)) {
      // Direct fixture writes bypass the application's cache invalidation.
      const cache = createClient({ url: REDIS_URL });
      await cache.connect();
      try { await cache.flushDb(); }
      finally { await cache.close(); }
    }
    return result;
  }
  finally { await client.end(); }
}
async function control(values: Record<string, number | boolean>) {
  const response = await fetch(`${MOCK}/__control`, { method: "POST", body: JSON.stringify(values) });
  expect(response.ok).toBeTruthy();
}
async function connect(page: Page, athlete: number) {
  await page.context().addCookies([{ name: "strava_e2e_athlete", value: String(athlete), url: MOCK }]);
  await page.goto("/strava/consent");
  await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Authorize import", exact: true }).click();
  await page.waitForURL(/\/activities\?strava=/);
  await page.waitForLoadState("networkidle");
}
async function post(page: Page, path: string, data = {}) {
  return page.request.post(path, { data, headers: { Origin: APP_URL } });
}
async function syncWithRetry(page: Page, data = {}) {
  for (let i = 0; i < 5; i++) {
    const response = await post(page, "/api/strava/sync", data);
    if (response.status() !== 429) return response;
    await new Promise((resolve) => setTimeout(resolve, Number(response.headers()["retry-after"]) * 1000 + 50));
  }
  throw new Error("Synchronization remained rate limited");
}
async function fullImport(page: Page, email: string) {
  const before = Math.floor(new Date(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1).getTime() / 1000);
  await query('UPDATE "StravaConnection" SET "syncBefore"=$1,"syncPage"=1,"syncActive"=true WHERE "userId"=(SELECT id FROM "User" WHERE email=$2)', [before, email]);
  for (let step = 0; step < 35; step++) {
    expect((await syncWithRetry(page)).status()).toBe(200);
    const state = await query(`SELECT c."syncActive", (SELECT count(*)::int FROM "StravaActivity" a WHERE a."userId"=c."userId" AND a."streamState"='pending') pending
      FROM "StravaConnection" c JOIN "User" u ON c."userId"=u.id WHERE u.email=$1`, [email]);
    if (!state.rows[0].syncActive && state.rows[0].pending === 0) return;
  }
  throw new Error("Bounded import did not finish");
}

test("account menu connects and disconnects Strava with confirmation", async ({ page }) => {
  await page.goto("/planner");
  await signIn(page, uniqueEmail("strava-menu"));
  const account = page.getByRole("button", { name: "Account menu", exact: true });
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Strava Connect with Strava", exact: true })).toHaveAttribute("href", "/strava/consent");
  await page.getByRole("menuitem", { name: "Strava Connect with Strava", exact: true }).click();
  await expect(page).toHaveURL(/\/strava\/consent/);
  await connect(page, 8502);
  await page.setViewportSize({ width: 390, height: 844 });
  await account.click();
  const disconnect = page.getByRole("menuitem", { name: "Strava · Disconnect", exact: true });
  await expect(disconnect).toBeVisible();
  await disconnect.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Disconnect and delete imported data", exact: true });
  await expect(dialog).toContainText("Strava");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(account).toBeFocused();
  await account.click();
  await disconnect.click();
  await page.route("**/api/strava/disconnect", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
  await dialog.getByRole("button", { name: "Disconnect and delete imported data", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/strava/disconnect");
  await dialog.getByRole("button", { name: "Disconnect and delete imported data", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await account.click();
  await expect(page.getByRole("menuitem", { name: "Strava Connect with Strava", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/strava/status")).json()).connected).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("website Strava OAuth, bounded summaries/streams, privacy and analytics", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const month = new Date().toISOString().slice(0, 7);
  const email = uniqueEmail("strava");
  const secondEmail = uniqueEmail("strava-other");
  const athlete = 8301;
  // Keep the backend concurrency checks independent of the browser import loop.
  await page.route("**/api/strava/sync", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
  await page.goto("/planner");
  await expect(page.getByRole("navigation", { name: "Run Week", exact: true }).getByRole("link", { name: "Activity overview", exact: true })).toBeVisible();
  await page.goto("/activities");
  await expect(page.getByRole("link", { name: "Sign in to view your running data" })).toBeVisible();
  expect((await post(page, "/api/strava/sync")).status()).toBe(401);
  await signIn(page, email);
  await page.goto("/activities");
  await expect(page.getByRole("link", { name: "Connect with Strava", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training calendar" })).toHaveCount(0);
  await page.goto("/running-metrics");
  await expect(page.getByRole("link", { name: "Connect with Strava", exact: true })).toBeVisible();
  expect((await page.request.post("/api/strava/sync", { data: {}, headers: { Origin: "https://foreign.example" } })).status()).toBe(403);
  expect((await post(page, "/api/strava/sync", { backfill: "bad" })).status()).toBe(400);
  await connect(page, athlete);
  await expect(page.getByText("Strava connected.", { exact: true }).filter({ visible: true })).toBeVisible();
  const connection = await query('SELECT c.tokens, c."athleteKey" FROM "StravaConnection" c JOIN "User" u ON u.id=c."userId" WHERE u.email=$1', [email]);
  expect(connection.rows[0].tokens).not.toContain("synthetic");
  expect(connection.rows[0].athleteKey).toMatch(/^[a-f0-9]{64}$/);

  await test.step("opening a pending activity imports its own heart-rate stream", async () => {
    expect((await post(page, "/api/strava/sync")).status()).toBe(200);
    const callsBeforeThrottle = (await (await fetch(`${MOCK}/__control`)).json()).calls.length;
    const throttled = await post(page, "/api/strava/sync");
    expect(throttled.status()).toBe(429);
    expect(Number(throttled.headers()["retry-after"])).toBeGreaterThan(0);
    expect((await (await fetch(`${MOCK}/__control`)).json()).calls.length).toBe(callsBeforeThrottle);
    const pending = await query(`SELECT a.id FROM "StravaActivity" a JOIN "User" u ON u.id=a."userId"
      WHERE u.email=$1 AND a."sourceId"=$2`, [email, String(athlete * 100 + 1)]);
    const id = pending.rows[0].id;
    await page.goto(`/activities/${id}`);
    await expect(page.getByText(/Elapsed time: 0 h 2 min/)).toBeVisible();
    await expect(page.getByRole("application", { name: "Heart rate / Pace · Elapsed time", exact: true })).toBeVisible();
    await expect(page.getByText("Average heart rate: 155.0 bpm", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue import", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Recorded streams", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to overview", exact: true })).toHaveCount(0);
    await expect.poll(async () => (await query('SELECT "streamState" FROM "StravaActivity" WHERE id=$1', [id])).rows[0].streamState).toBe("ready");
    const stored = await query('SELECT streams, "streamState" FROM "StravaActivity" WHERE id=$1', [id]);
    expect(stored.rows[0].streamState).toBe("ready");
    expect(stored.rows[0].streams.heartrate).toEqual([140, 160, null, 170, 170]);
    expect((await page.request.post(`/api/strava/activities/${id}`, {
      headers: { Origin: "https://foreign.example" },
    })).status()).toBe(403);
    expect((await post(page, "/api/strava/activities/missing")).status()).toBe(404);
  });

  await test.step("refresh is serialized and imports are paginated/idempotent", async () => {
    await control({ tokenDelay: 300 });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const simultaneous = await Promise.all([post(page, "/api/strava/sync"), post(page, "/api/strava/sync")]);
    expect(simultaneous.map((r) => r.status()).sort()).toEqual([200, 429]);
    await control({ tokenDelay: 0 });
    // Reset the cursor to exercise every synthetic record independent of today's date.
    await query('UPDATE "StravaConnection" SET "syncPage"=1,"syncActive"=true WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email]);
    await fullImport(page, email);
    const exportResponse = await page.request.get("/api/account");
    expect(exportResponse.headers()["cache-control"]).toBe("no-store");
    const exported = await exportResponse.json();
    expect(exported.stravaActivities).toHaveLength(21);
    expect(new Set(exported.stravaActivities.map((a: { sourceId: string }) => a.sourceId)).size).toBe(21);
    expect(exported.stravaActivities.find((a: { sourceId: string }) => a.sourceId.endsWith("03")).streams.heartrate).toBeNull();
    expect(exported.stravaActivities.find((a: { sourceId: string }) => a.sourceId.endsWith("04")).streamState).toBe("unavailable");
    expect(JSON.stringify(exported)).not.toMatch(/synthetic-access|synthetic-refresh|athleteKey|latitude|longitude|latlng/);
    expect((await syncWithRetry(page, { backfill: true })).status()).toBe(200);
    await fullImport(page, email);
    const repeat = await (await page.request.get("/api/account")).json();
    expect(repeat.stravaActivities).toHaveLength(21);
    const calls = await (await fetch(`${MOCK}/__control`)).json();
    const own = calls.calls.filter((c: { athlete: number }) => c.athlete === athlete);
    expect(own.filter((c: { grant?: string }) => c.grant === "refresh_token")).toHaveLength(1);
    expect(own.some((c: { query?: { page?: string } }) => c.query?.page === "2")).toBeTruthy();
    for (const c of own.filter((c: { path: string }) => c.path.endsWith("/streams"))) expect(c.query.keys).toBe("time,heartrate,velocity_smooth,distance");
  });

  await test.step("HR settings, measured charts, maximal confirmation and responsive keyboard UI", async () => {
    const before = Math.floor(new Date(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1).getTime() / 1000);
    await page.goto("/planner");
    await query('DELETE FROM "StravaActivity" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email]);
    await query('UPDATE "StravaConnection" SET "syncBefore"=$1,"syncPage"=1,"syncActive"=true WHERE "userId"=(SELECT id FROM "User" WHERE email=$2)', [before, email]);
    await expect.poll(async () => {
      const state = await query('SELECT "retryAt" FROM "StravaConnection" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email]);
      return state.rows[0].retryAt === null || new Date(state.rows[0].retryAt).getTime() <= Date.now();
    }).toBe(true);
    await page.unroute("**/api/strava/sync");
    const syncRequests: number[] = [];
    await page.route("**/api/strava/sync", async (route) => {
      syncRequests.push(Date.now());
      await route.continue();
    });
    await page.goto(`/activities?month=${month}`);
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Synchronize Strava", exact: true }).click();
    await expect.poll(async () => {
      const state = await query(`SELECT c."syncActive", (SELECT count(*)::int FROM "StravaActivity" a WHERE a."userId"=c."userId") total,
        (SELECT count(*)::int FROM "StravaActivity" a WHERE a."userId"=c."userId" AND a."streamState"='pending') pending
        FROM "StravaConnection" c JOIN "User" u ON c."userId"=u.id WHERE u.email=$1`, [email]);
      return state.rows[0];
    }, { timeout: 60_000 }).toEqual({ syncActive: false, total: 21, pending: 0 });
    expect(syncRequests).toHaveLength(1);
    await expect(page.getByRole("button", { name: "Synchronize Strava", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Import recent activities", exact: true })).toHaveCount(0);
    await page.route("**/api/strava/sync", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
    await page.getByRole("button", { name: "Synchronize Strava", exact: true }).click();
    const importError = page.getByRole("alert").filter({ hasText: "Unable to complete this request." });
    await expect(importError).toBeVisible();
    await expect(importError).toHaveClass(/text-red-700/);
    const errorVisibleAt = Date.now();
    await expect(importError).toHaveCount(0, { timeout: 4500 });
    expect(Date.now() - errorVisibleAt).toBeGreaterThan(2000);
    await page.unroute("**/api/strava/sync");
    await expect(page.getByRole("button", { name: "Synchronize Strava", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Synchronize Strava", exact: true }).click();
    await expect(page.getByRole("button", { name: "Synchronize Strava", exact: true })).toBeEnabled();
    await expect(importError).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Activity overview", exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    const importBounds = await page.getByRole("button", { name: "Synchronize Strava", exact: true }).boundingBox();
    const monthBounds = await page.getByLabel("Month", { exact: true }).boundingBox();
    expect(importBounds).not.toBeNull();
    expect(monthBounds).not.toBeNull();
    if (importBounds && monthBounds) {
      expect(importBounds.x + importBounds.width).toBeLessThan(monthBounds.x);
      expect(Math.abs(importBounds.y - monthBounds.y)).toBeLessThan(100);
    }
    const desktopHeights = await page.locator("[data-date], [data-week] aside > div").evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height));
    expect(new Set(desktopHeights).size).toBe(1);
    await expect(page.getByText("Import page", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Training calendar" })).toBeVisible();
    const paceSummary = page.locator("dl > div").filter({ has: page.getByText("Average moving pace", { exact: true }) });
    await expect(paceSummary.locator("dd")).toHaveText(/^\d+:[0-5]\d min\/km$/);
    await expect(page.getByRole("heading", { name: "Manual HR settings" })).toHaveCount(0);
    await expect(page.getByText("HRMax: 190 bpm")).toBeVisible();
    await expect(page.locator("[data-weekly-volume]")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.mouse.move(0, 0);
    await page.setViewportSize({ width: 1280, height: 900 });
    const panelBounds = await page.locator("[data-pace-histogram]").evaluate((element) =>
      Array.from(element.parentElement?.children ?? [], (panel) => {
        const { y, height } = panel.getBoundingClientRect();
        return { y, height };
      }));
    expect(panelBounds).toHaveLength(3);
    for (const [left, right] of [[0, 1]]) {
      expect(Math.abs(panelBounds[left].height - panelBounds[right].height)).toBeLessThan(1);
      expect(Math.abs(panelBounds[left].y - panelBounds[right].y)).toBeLessThan(1);
    }
    await expect(page.getByText(/Z4 85–90% ·/)).toBeVisible();
    await expect(page.locator(`[data-date="${month}-01"]`)).toHaveAttribute("data-zone", "2");
    await expect(page.locator(`[data-date="${month}-03"]`)).toHaveAttribute("data-zone", "");
    const firstWeek = page.locator("[data-week]").filter({ has: page.locator(`[data-date="${month}-01"]`) });
    await expect(firstWeek.getByText(/Time: \d+ h \d+ min/)).toBeVisible();
    await expect(firstWeek.getByText(/> threshold:.*\d.*%/)).toBeVisible();
    await expect(firstWeek.getByRole("complementary").getByText(/km$/, { exact: false }).first()).toBeVisible();
    await expect(firstWeek.locator("[data-week-hr]")).toContainText("155.0 bpm");
    await expect(firstWeek.locator("[data-week-pace]")).toHaveText(/Pace: \d+:[0-5]\d min\/km/);
    await page.screenshot({ path: test.info().outputPath("calendar-desktop.png"), fullPage: true });
    await expect(page.getByRole("heading", { name: "Runs", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Pace distribution", exact: true })).toBeVisible();
    await expect(page.locator("[data-pace-histogram]")).toHaveCount(1);
    const histogram = page.locator("[data-pace-histogram]");
    await expect(histogram.locator("[data-pace-bin]").first()).toBeVisible();
    await expect(histogram.locator("svg text").filter({ hasText: /^5:35$/ })).toBeVisible();
    const averageLine = histogram.locator("[data-average-pace]");
    await expect(averageLine).toBeAttached();
    await expect(averageLine).toHaveAttribute("data-average-pace", "300");
    await expect(averageLine).toHaveAttribute("aria-label", /^Average moving pace: \d+:[0-5]\d min\/km$/);
    expect(Number(await averageLine.getAttribute("x1"))).toBeGreaterThanOrEqual(110);
    expect(Number(await averageLine.getAttribute("x1"))).toBeLessThanOrEqual(620);
    await expect(histogram.locator('[aria-live="polite"]')).toBeEmpty();
    await expect(page.locator("[data-maximal-efforts]")).toHaveCount(0);
    await histogram.locator('[data-pace-bin][tabindex="0"]').first().focus();
    await expect(histogram.locator('[aria-live="polite"]')).toHaveText(/min\/km: \d+ h \d+ min/);
    await histogram.screenshot({ path: test.info().outputPath("pace-histogram-desktop.png") });
    await expect(page.locator("[data-pace-zone]")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await histogram.screenshot({ path: test.info().outputPath("pace-histogram-mobile.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    const mobileHeights = await page.locator("[data-date], [data-week] aside > div").evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height));
    expect(new Set(mobileHeights).size).toBe(1);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    const volumeChart = page.locator("[data-volume-chart]").filter({ visible: true });
    await expect(volumeChart.locator("[data-volume-bucket]")).toHaveCount(6);
    await expect(volumeChart.locator("[data-volume-month]")).toHaveText(
      new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" }));
    for (const tick of await volumeChart.locator("[data-volume-km-tick]").allTextContents()) {
      expect(Number(tick) % 5).toBe(0);
    }
    const distanceToggle = volumeChart.getByRole("radio", { name: "Distance (km)", exact: true });
    const timeToggle = volumeChart.getByRole("radio", { name: "Time (h)", exact: true });
    await volumeChart.locator('[role="img"]').first().focus();
    await expect(volumeChart.locator('[aria-live="polite"]')).toContainText("km");
    await expect(volumeChart.locator("[data-volume-value]")).toHaveCount(6);
    for (const point of await volumeChart.locator("[data-volume-value]").allTextContents()) {
      expect(point.trim()).toMatch(/^\d+$/);
    }
    await expect(volumeChart.locator("[data-volume-line]")).toHaveCount(1);
    await expect(volumeChart.locator("[data-volume-time]")).toHaveCount(0);
    await expect(volumeChart.locator("[data-volume-distance]")).toHaveCount(6);
    await timeToggle.check();
    await expect(distanceToggle).not.toBeChecked();
    await expect(volumeChart.locator("[data-volume-distance]")).toHaveCount(0);
    await expect(volumeChart.locator("[data-volume-time]")).toHaveCount(6);
    for (const tick of await volumeChart.locator("[data-volume-hours-tick]").allTextContents()) {
      expect(Number.isInteger(Number(tick))).toBe(true);
    }
    await volumeChart.locator('[role="img"]').first().focus();
    await expect(volumeChart.locator('[aria-live="polite"]')).toContainText("min");
    await expect(volumeChart.locator("[data-volume-hours-tick]").first()).toHaveAttribute("x", "50");
    await distanceToggle.check();
    await distanceToggle.focus();
    await page.keyboard.press("ArrowRight");
    await expect(timeToggle).toBeChecked();
    await page.keyboard.press("ArrowLeft");
    await expect(distanceToggle).toBeChecked();
    await volumeChart.screenshot({ path: test.info().outputPath("volume-chart-mobile.png") });
    await expect(page.getByText("Partial HR coverage:", { exact: false })).toHaveCount(0);
    // Existing confirmations remain valid; the temporary simplified UI no longer edits them.
    await query('UPDATE "StravaActivity" SET "maximalEffort"=true WHERE "sourceId"=$1 AND "userId"=(SELECT id FROM "User" WHERE email=$2)', [String(athlete * 100 + 1), email]);
    await page.goto(`/running-metrics?month=${month}`);
    await expect(page.locator("[data-weekly-volume]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Synchronize Strava", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Month", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Previous period" })).toHaveCount(0);
    for (const [title, definition] of [
      ["Speed", "Ability to run fast over a short effort."],
      ["Endurance", "Ability to sustain an effort for a long time,"],
      ["Speed-endurance", "Ability to sustain a high running speed despite accumulating fatigue."],
    ]) {
      const help = page.getByRole("button", { name: `${title} · ?`, exact: true });
      await help.hover();
      await expect(page.getByRole("tooltip")).toContainText(definition);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await help.focus();
      await expect(page.getByRole("tooltip")).toContainText(definition);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await help.click();
      await expect(page.getByRole("tooltip")).toContainText(definition);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
      await page.keyboard.press("Escape");
    }
    for (const label of ["Runs", "Distance", "Moving time", "Average moving pace"])
      await expect(page.locator("dt").filter({ hasText: new RegExp(`^${label}$`) })).toHaveCount(0);
    const provisional = page.locator("[data-provisional-performance]");
    await expect(provisional).toContainText("Low confidence");
    await expect(provisional).toContainText("20.40 km/h");
    await expect(provisional.locator("dd").nth(1)).toHaveText(/^\d+\.\d$/);
    await expect(provisional.locator("dd").nth(2)).toHaveText("Unavailable");
    const speedIndicator = page.locator('[data-performance-indicator="speed"]').filter({ visible: true });
    await expect(speedIndicator.locator("[data-indicator-value]")).toHaveText("20.40 km/h");
    await expect(speedIndicator).toContainText("2:56 min/km");
    await expect(page.locator('[data-performance-indicator="speedEndurance"] [data-indicator-value]').filter({ visible: true })).toHaveText("Unavailable");
    const enduranceRun = (await query(`SELECT id, "movingSeconds", "distanceMeters" FROM "StravaActivity"
      WHERE "userId"=(SELECT id FROM "User" WHERE email=$1) AND "localDate">=$2 AND "localDate"<=$3
      AND "movingSeconds">0 AND "distanceMeters">0
      ORDER BY "movingSeconds" DESC, "distanceMeters" DESC, "localDate" DESC, id ASC LIMIT 1`,
    [email, new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 83)).toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10)])).rows[0];
    const enduranceIndicator = page.locator('[data-performance-indicator="endurance"]').filter({ visible: true });
    const enduranceMinutes = Math.round(enduranceRun.movingSeconds / 60);
    await expect(enduranceIndicator.locator("[data-indicator-value]")).toHaveText(
      `${Math.floor(enduranceMinutes / 60)} h ${enduranceMinutes % 60} min · ${(enduranceRun.distanceMeters / 1000).toFixed(1)} km`);
    await expect(enduranceIndicator.getByRole("link")).toHaveAttribute("href", `/activities/${enduranceRun.id}`);
    await page.keyboard.press("Escape");
    await page.mouse.move(0, 0);
    await page.screenshot({ path: test.info().outputPath("performance-indicators-mobile.png"), fullPage: true });
    await page.goto("/running-metrics?month=2026-01");
    await expect(page.locator("[data-maximal-efforts]").getByRole("link", { name: /Synthetic run 1/ })).toBeVisible();
    expect(await page.locator("[data-maximal-efforts]").filter({ visible: true }).evaluate((element) => element === element.parentElement?.lastElementChild)).toBe(true);
    const removeEffort = page.getByRole("button", { name: "Remove maximal-effort mark: Synthetic run 1", exact: true });
    await removeEffort.click();
    const removalDialog = page.getByRole("dialog", { name: "Remove maximal-effort mark", exact: true });
    await expect(removalDialog).toContainText("The activity stays in your calendar and on Strava.");
    await expect(removalDialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(removalDialog).toHaveCount(0);
    await expect(removeEffort).toBeFocused();
    await removeEffort.click();
    await page.route("**/api/strava/activities/*", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 503, json: { error: "unavailable" } });
      else await route.continue();
    });
    await removalDialog.getByRole("button", { name: "Remove maximal-effort mark", exact: true }).click();
    await expect(removalDialog.getByRole("alert")).toBeVisible();
    await expect(removalDialog.getByRole("alert")).toHaveClass(/text-red-700/);
    await page.unroute("**/api/strava/activities/*");
    await removalDialog.getByRole("button", { name: "Remove maximal-effort mark", exact: true }).click();
    await expect(removalDialog).toHaveCount(0);
    await expect(removeEffort).toHaveCount(0);
    const retained = await query('SELECT "maximalEffort" FROM "StravaActivity" WHERE "sourceId"=$1 AND "userId"=(SELECT id FROM "User" WHERE email=$2)', [String(athlete * 100 + 1), email]);
    expect(retained.rows).toEqual([{ maximalEffort: false }]);
    for (let i = 0; i < 3; i++)
      await query('UPDATE "StravaActivity" SET "maximalEffort"=true WHERE "sourceId"=$1 AND "userId"=(SELECT id FROM "User" WHERE email=$2)', [String(athlete * 100 + i + 1), email]);
    await page.goto(`/running-metrics?month=${month}`);
    await expect(page.getByText("14.40 km/h").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("4:10 min/km", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("200.0 m").filter({ visible: true })).toBeVisible();
    await expect(page.locator('[data-performance-indicator="speedEndurance"] [data-indicator-value]').filter({ visible: true })).toHaveText("70.6%");
    const danielsPanel = page.locator("[data-daniels-estimates]").filter({ visible: true });
    await expect(danielsPanel.locator("[data-estimate-vma]")).toHaveText(/^\d+\.\d{2} km\/h\d+:[0-5]\d min\/km$/);
    await expect(danielsPanel.locator("[data-estimate-threshold]")).toHaveText(/^\d+:[0-5]\d min\/km$/);
    await expect(danielsPanel.locator("[data-estimate-ratio]")).toHaveText(/^\d+\.\d%$/);
    await expect(danielsPanel).toContainText("Low confidence");
    await expect(page.locator("[data-maximal-efforts] li")).toHaveCount(3);
    await page.goto("/planner");
    await createWeek(page);
    await expect.poll(async () => (await query('SELECT p.data FROM "Planner" p JOIN "User" u ON p."userId"=u.id WHERE u.email=$1', [email])).rows.length).toBe(1);
    // Two activities on one date exercise the touch/keyboard chooser.
    await query(`INSERT INTO "StravaActivity" (id,"userId","sourceId",name,sport,"startedAt","localDate",
      "distanceMeters","movingSeconds","elapsedSeconds","averageHr","maxHr",streams,"streamState","maximalEffort","updatedAt")
      SELECT id || '-extra',"userId","sourceId" || '99','Extra run',sport,"startedAt" - interval '1 hour',"localDate",
      "distanceMeters","movingSeconds","elapsedSeconds","averageHr","maxHr",streams,"streamState",false,"updatedAt"
      FROM "StravaActivity" WHERE "sourceId"=$1 AND "userId"=(SELECT id FROM "User" WHERE email=$2)`, [String(athlete * 100 + 2), email]);
    await page.goto(`/activities?month=${month}`);
    await expect(page.locator(`[data-date="${month}-01"] [data-maximal-effort]`).filter({ visible: true })).toHaveAttribute("aria-label", "Maximal effort: 1");
    await expect(page.locator("[data-maximal-efforts]")).toHaveCount(0);
    await expect(page.locator("[data-pace-zone]")).toHaveCount(0);
    await expect(page.getByText("Between training ranges", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Below easy pace", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Above interval pace", { exact: false })).toHaveCount(0);
    const singleDay = page.locator(`[data-date="${month}-01"]`);
    await expect(singleDay.locator("[data-day-duration]")).toHaveText("2 min");
    await expect(singleDay.locator("[data-run-count]")).toHaveCount(0);
    const dateBadge = await singleDay.locator("time").boundingBox();
    const dayBounds = await singleDay.boundingBox();
    expect(dateBadge).not.toBeNull();
    expect(dayBounds).not.toBeNull();
    if (dateBadge && dayBounds) {
      expect(dateBadge.x - dayBounds.x).toBeLessThan(12);
      expect(dateBadge.y - dayBounds.y).toBeLessThan(12);
    }
    await singleDay.evaluate((element) => {
      window.scrollBy(0, element.getBoundingClientRect().top - 10);
    });
    await singleDay.hover();
    const summary = singleDay.getByRole("tooltip");
    await expect(summary).toHaveAttribute("data-placement", "below");
    await singleDay.evaluate((element) => {
      window.scrollBy(0, element.getBoundingClientRect().bottom - window.innerHeight + 10);
    });
    await singleDay.hover();
    await expect(summary).toHaveAttribute("data-placement", "above");
    await expect(singleDay.locator("[data-zone-bars]")).toHaveCount(1);
    await expect(singleDay.locator("[data-zone-bar]")).toHaveCount(5);
    await expect(singleDay.locator("[data-zone-bars]")).toHaveAttribute("aria-label", /Z1: 0.0%.*Z2: 33.3%.*Z3: 33.3%.*Z4: 33.3%.*Z5: 0.0%/);
    await expect(summary.getByLabel("Average heart rate", { exact: true })).toHaveText("155.0 bpm");
    await expect(summary.getByLabel("Pace", { exact: true })).toHaveText(/\d+:\d{2} min\/km/);
    await expect(summary.getByLabel("Distance", { exact: true })).toHaveText("0.7 km");
    await expect(summary.getByLabel("Time", { exact: true })).toHaveText("0 h 2 min");
    await expect(summary.locator("[data-zone-percent]")).toHaveCount(5);
    await expect(summary.locator('[data-zone-percent="2"]')).toContainText("33.3%");
    await page.screenshot({ path: test.info().outputPath("calendar-mobile.png") });
    const barColors = await singleDay.locator("[data-zone-bar]").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
    expect(new Set(barColors).size).toBe(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(summary).toHaveCount(0);
    const multipleDay = page.locator(`[data-date="${month}-02"]`);
    await expect(multipleDay.locator("[data-day-duration]")).toHaveText("10 min");
    await expect(multipleDay.locator("[data-run-count]")).toHaveText("2 Runs");
    await multipleDay.getByRole("button").click();
    await expect(multipleDay.getByRole("link")).toHaveText(["Extra run", "Synthetic run 2"]);
    await expect(multipleDay.getByRole("link", { name: "Synthetic run 2", exact: true })).toBeVisible();
    await expect(multipleDay.getByRole("link", { name: "Extra run", exact: true })).toBeVisible();
    await expect(multipleDay.locator("[data-zone-percent]")).toHaveCount(5);
    await expect(multipleDay.locator('[data-zone-percent="2"]')).toContainText("33.3%");
    await multipleDay.getByRole("link", { name: "Extra run", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(multipleDay.getByRole("button")).toBeFocused();
    await expect(multipleDay.getByRole("group")).toHaveCount(0);
    const missingHrDay = page.locator(`[data-date="${month}-03"]`);
    await missingHrDay.hover();
    await expect(missingHrDay.locator("[data-zone-bars]")).toHaveAttribute("aria-label", /Z1: Unavailable/);
    await expect(missingHrDay.locator('[data-zone-percent="1"]')).toContainText("—");
    await page.keyboard.press("Escape");
    await singleDay.getByRole("link").focus();
    await expect(singleDay.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Enter");
    const chart = page.locator("[data-activity-chart]").filter({ visible: true });
    await expect(chart).toBeVisible();
    const maximalEffort = page.getByRole("checkbox", { name: "Maximal effort", exact: true });
    await expect(maximalEffort).toBeChecked();
    await maximalEffort.uncheck();
    await expect(maximalEffort).not.toBeChecked();
    await expect(maximalEffort).toBeEnabled();
    await expect.poll(async () => (await query(`SELECT "maximalEffort" FROM "StravaActivity" WHERE "sourceId"=$1 AND "userId"=(SELECT id FROM "User" WHERE email=$2)`,
      [String(athlete * 100 + 1), email])).rows[0].maximalEffort).toBe(false);
    await maximalEffort.check();
    await expect(maximalEffort).toBeChecked();
    await expect(maximalEffort).toBeEnabled();
    await page.route("**/api/strava/activities/*", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 503, json: { error: "unavailable" } });
      else await route.continue();
    });
    await maximalEffort.click();
    await expect(maximalEffort).toBeChecked();
    await expect(page.getByRole("alert").filter({ hasText: "Unable to complete this request." })).toBeVisible();
    await page.unroute("**/api/strava/activities/*");
    const effortHelp = page.getByRole("button", { name: "Maximal effort · ?" });
    await effortHelp.hover();
    await expect(page.getByRole("tooltip")).toContainText("critical-speed and D′");
    await effortHelp.focus();
    await expect(page.getByRole("tooltip")).toContainText("Does not change HR zones or the planner");
    await expect(chart.getByRole("application", { name: "Heart rate / Pace · Elapsed time", exact: true })).toBeVisible();
    await expect(chart.locator(".recharts-reference-area")).toHaveCount(5);
    const hrLine = chart.locator('.recharts-line-curve[stroke="#be123c"]');
    const paceLine = chart.locator('.recharts-line-curve[stroke="#1d4ed8"]');
    await expect(hrLine).toHaveCount(1);
    await expect(paceLine).toHaveCount(1);
    await expect(paceLine).toHaveAttribute("d", /C/);
    await expect(chart.getByText("4:10", { exact: true })).toBeVisible();
    await expect(chart.getByText("5:33", { exact: true })).toBeVisible();
    await expect(chart.getByText("Z5", { exact: true })).toBeVisible();
    await expect(page.getByText("Pace: 4:10–5:33 min/km", { exact: true })).toBeVisible();
    await expect(page.getByText(/5555:33/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Distance", exact: true })).toHaveCount(0);
    await expect(page.getByText("min/km", { exact: true })).toBeVisible();
    await expect(page.getByText("Requires HR samples and manual settings.", { exact: false })).toHaveCount(0);
    const hrCheckbox = page.getByRole("checkbox", { name: "Heart rate", exact: true });
    const paceCheckbox = page.getByRole("checkbox", { name: "Pace", exact: true });
    await hrCheckbox.uncheck();
    await expect(hrLine).toHaveCount(0);
    await expect(paceLine).toHaveCount(1);
    await expect(chart.locator(".recharts-reference-area")).toHaveCount(0);
    await paceCheckbox.uncheck();
    await expect(chart.locator(".recharts-line-curve")).toHaveCount(0);
    await hrCheckbox.focus();
    await page.keyboard.press("Space");
    await expect(hrCheckbox).toBeChecked();
    await expect(hrLine).toHaveCount(1);
    await paceCheckbox.check();
    await expect(paceLine).toHaveCount(1);
    const interactiveChart = chart.getByRole("application");
    await interactiveChart.focus();
    await page.keyboard.press("ArrowRight");
    await expect(chart.locator(".recharts-tooltip-wrapper")).toBeVisible();
    await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText("Elapsed time");
    await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText("min/km");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowLeft");
    await expect(chart.locator(".recharts-tooltip-wrapper")).toContainText("bpm");
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(async () => (await chart.boundingBox())?.width ?? 0).toBeGreaterThan(700);
    await chart.screenshot({ path: test.info().outputPath("activity-chart-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await chart.screenshot({ path: test.info().outputPath("activity-chart-mobile.png") });
    await page.goto(`/activities?month=${month}`);
    await expect(page.getByRole("heading", { name: "Training calendar" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

    // Regression: November's first visible week includes October, and the cards
    // must use exactly the same range as those weekly totals.
    const boundaryStreams = { time: Array.from({ length: 361 }, (_, i) => i * 5),
      heartrate: Array(361).fill(180), velocity_smooth: Array(361).fill(3), distance: null };
    await query(`INSERT INTO "StravaActivity" (id,"userId","sourceId",name,sport,"startedAt","localDate",
      "distanceMeters","movingSeconds","elapsedSeconds","averageHr","maxHr",streams,"streamState","maximalEffort","updatedAt")
      SELECT id || '-boundary',"userId","sourceId" || '98','Boundary run',sport,'2026-10-31T10:00:00Z','2026-10-31',
      5400,1800,1800,180,185,$3::jsonb,'ready',false,"updatedAt"
      FROM "StravaActivity" WHERE "sourceId"=$1 AND "userId"=(SELECT id FROM "User" WHERE email=$2)`,
    [String(athlete * 100 + 2), email, JSON.stringify(boundaryStreams)]);
    await page.goto("/activities?month=2026-11");
    await expect(page.locator("[data-statistics-range]")).toHaveCount(0);
    const hrCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Time in heart-rate zones", exact: true }) });
    await expect(hrCard.getByRole("listitem").filter({ hasText: "Z5" })).toContainText("0 h 30 min");
    const thresholdCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Time above threshold (>90%)", exact: true }) });
    await expect(thresholdCard.getByRole("listitem").filter({ hasText: "> threshold" })).toContainText("0 h 30 min");
    const boundaryWeek = page.locator('[data-week="2026-10-26"]');
    await expect(boundaryWeek.getByRole("complementary")).toContainText("0 h 30 min");
    const weekSummary = boundaryWeek.getByRole("complementary");
    await weekSummary.getByRole("button").hover();
    const weekTooltip = weekSummary.getByRole("tooltip");
    await expect(weekTooltip.locator("[data-zone-percent]")).toHaveCount(5);
    await expect(weekTooltip.locator('[data-zone-percent="5"]')).toContainText("0 h 30 min");
    const expectedWeek = (await query(`SELECT SUM("distanceMeters") AS distance, SUM("movingSeconds") AS moving
      FROM "StravaActivity" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)
      AND "localDate">='2026-10-26' AND "localDate"<='2026-11-01'`, [email])).rows[0];
    await expect(weekTooltip.getByLabel("Distance", { exact: true })).toHaveText(`${(Number(expectedWeek.distance) / 1000).toFixed(1)} km`);
    const roundedMinutes = Math.round(Number(expectedWeek.moving) / 60);
    await expect(weekTooltip.getByLabel("Time", { exact: true })).toHaveText(`${Math.floor(roundedMinutes / 60)} h ${roundedMinutes % 60} min`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(weekTooltip).toHaveCount(0);
    await weekSummary.getByRole("button").focus();
    await expect(weekTooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Uses the account planner’s VDOT ranges.", { exact: false })).toHaveCount(0);
    await page.getByRole("link", { name: "Week", exact: true }).click();
    await expect(page).toHaveURL(/view=week&date=2026-11-01/);
    await expect(page.locator("[data-week]")).toHaveCount(1);
    await expect(page.locator('[data-week="2026-10-26"]')).toBeVisible();
    await expect(hrCard.getByRole("listitem").filter({ hasText: "Z5" })).toContainText("0 h 30 min");
    await page.getByRole("button", { name: "Next period" }).click();
    await expect(page).toHaveURL(/view=week&date=2026-11-02/);
    await expect(page.locator("[data-week]").filter({ visible: true })).toHaveCount(1);
    await expect(page.locator('[data-week="2026-11-02"]').filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next period" })).toBeDisabled();
    await page.getByRole("button", { name: "Previous period" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-week="2026-10-26"]')).toBeVisible();
    await expect(page.getByLabel("Week", { exact: true })).toHaveAttribute("max", new Date().toISOString().slice(0, 10));
    await page.getByLabel("Week", { exact: true }).fill("2026-01-01");
    await expect(page.locator('[data-week="2025-12-29"]')).toBeVisible();
    await page.getByRole("link", { name: "Month", exact: true }).click();
    await expect(page).toHaveURL(/month=2025-12/);
    await expect(page.locator("[data-week]")).toHaveCount(5);
    await page.getByRole("button", { name: "Next period" }).click();
    await expect(page).toHaveURL(/month=2026-01/);
    await page.getByRole("button", { name: "Previous period" }).click();
    await expect(page).toHaveURL(/month=2025-12/);
    await page.getByLabel("Month", { exact: true }).fill("2026-11");
    await expect(page.locator("[data-week]")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Next period" })).toBeDisabled();
    await expect(page.getByLabel("Month", { exact: true })).toHaveAttribute("max", "2026-11");
    const picker = page.getByLabel("Month", { exact: true });
    const pickerBounds = await picker.boundingBox();
    expect(pickerBounds?.height).toBeGreaterThanOrEqual(48);
    expect(pickerBounds?.width).toBeGreaterThan(150);
    for (const name of ["Previous period", "Next period"]) {
      const arrowBounds = await page.getByRole("button", { name }).boundingBox();
      expect(arrowBounds).not.toBeNull();
      if (pickerBounds && arrowBounds)
        expect(Math.abs(arrowBounds.y + arrowBounds.height / 2 - pickerBounds.y - pickerBounds.height / 2)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.getByRole("link", { name: "Year", exact: true }).click();
    await expect(page).toHaveURL(/view=year&year=2026/);
    await expect(page.locator("[data-year-month]")).toHaveCount(12);
    await expect(page.locator("[data-volume-chart] [data-volume-bucket]").filter({ visible: true })).toHaveCount(12);
    await expect(page.locator("[data-statistics-range]")).toHaveCount(0);
    await expect(hrCard.getByRole("listitem").filter({ hasText: "Z5" })).toContainText("0 h 30 min");
    await expect(page.locator('[data-year-month="2026-10"]')).toContainText("1 Runs");
    const october = page.locator('[data-year-month="2026-10"]');
    await expect(october.locator("[data-zone-bars]")).toHaveCount(1);
    await expect(october.locator('[data-zone-bar="5"]')).toHaveAttribute("style", /height: 100%/);
    await october.getByRole("link").hover();
    const monthTooltip = october.getByRole("tooltip");
    await expect(monthTooltip.locator('[data-zone-percent="5"]')).toContainText("0 h 30 min · 100.0%");
    await expect(monthTooltip.getByLabel("Average heart rate", { exact: true })).toContainText("180.0");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(monthTooltip).toHaveCount(0);
    await october.getByRole("link").focus();
    await expect(monthTooltip).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("year-zones-mobile.png") });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 900 });
    await october.getByRole("link").hover();
    await expect(monthTooltip).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("year-zones-desktop.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Next period" })).toBeDisabled();
    await expect(page.getByLabel("Year", { exact: true }).locator('option[value="2027"]')).toHaveCount(0);
    await expect(page.locator('[data-year-month="2026-12"]')).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator('[data-year-month="2026-12"]')).not.toHaveAttribute("href");
    await page.getByRole("button", { name: "Previous period" }).click();
    await expect(page.getByLabel("Year", { exact: true })).toHaveValue("2025");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.getByLabel("Year", { exact: true }).selectOption("2026");
    await page.locator('[data-year-month="2026-11"]').click();
    await expect(page).toHaveURL(/month=2026-11/);
    await expect(page.locator("[data-week]")).toHaveCount(6);
    await page.goto("/activities?view=year&year=2027");
    await expect(page).toHaveURL(/view=year&year=2026/);
    await page.goto("/activities?month=2027-01");
    await expect(page).toHaveURL(/month=2026-11/);
    await page.goto("/activities?view=week&date=2027-01-01");
    await expect(page).toHaveURL(new RegExp(`view=week&date=${new Date().toISOString().slice(0, 10)}`));
    await expect(page.locator("[data-week]").filter({ visible: true })).toHaveCount(1);
    await expect(page.locator('[data-week="2026-11-02"]').filter({ visible: true })).toBeVisible();
    await expect(page.locator("[data-volume-chart] [data-volume-bucket]").filter({ visible: true })).toHaveCount(7);
  });

  const second = await browser.newContext();
  const other = await second.newPage();
  try {
    await test.step("athlete uniqueness, row isolation, OAuth state/account/replay protection", async () => {
      await signIn(other, secondEmail);
      await connect(other, athlete);
      await expect(other.getByText("This Strava athlete is already linked to another Run Week account.")).toBeVisible();
      const id = (await query('SELECT a.id FROM "StravaActivity" a JOIN "User" u ON u.id=a."userId" WHERE u.email=$1 LIMIT 1', [email])).rows[0].id;
      expect((await other.request.patch(`/api/strava/activities/${id}`, { data: { maximalEffort: true }, headers: { Origin: APP_URL } })).status()).toBe(404);
      expect((await post(other, `/api/strava/activities/${id}`)).status()).toBe(404);
      expect((await (await other.request.get("/api/account")).json()).stravaActivities).toHaveLength(0);
      const start = await page.request.post("/api/strava/connect", { form: { consent: CONSENT }, headers: { Origin: APP_URL }, maxRedirects: 0 });
      expect(start.status()).toBe(303);
      const authorization = new URL(start.headers().location);
      const authCookie = (await page.context().cookies(`${APP_URL}/api/strava/callback`)).find((c) => c.name === "run-week-strava-auth");
      expect(authCookie?.httpOnly).toBeTruthy();
      expect(authCookie?.sameSite).toBe("Lax");
      if (!authCookie) throw new Error("No OAuth cookie");
      await second.addCookies([{ ...authCookie }]);
      const foreign = await other.request.get(`/api/strava/callback?code=fake&state=${authorization.searchParams.get("state")}&scope=activity:read_all`, { maxRedirects: 0 });
      expect(foreign.headers().location).toContain("strava=invalid");
      const invalid = await page.request.get(`/api/strava/callback?code=fake&state=${"x".repeat(43)}&scope=activity:read_all`, { maxRedirects: 0 });
      expect(invalid.headers().location).toContain("strava=invalid");
      const replay = await page.request.get(`/api/strava/callback?code=fake&state=${authorization.searchParams.get("state")}&scope=activity:read_all`, { maxRedirects: 0 });
      expect(replay.headers().location).toContain("strava=invalid");
    });
    await test.step("rate headers persist retries and disconnect cancels pending stream writes", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await control({ rate: true });
      const limited = await post(page, "/api/strava/sync");
      expect(limited.status()).toBe(429);
      expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
      expect((await post(page, "/api/strava/sync")).status()).toBe(429);
      await control({ rate: false, delay: 2000 });
      await query(`UPDATE "StravaConnection" SET "retryAt"=NULL WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
      await query(`UPDATE "StravaActivity" SET "streamState"='pending' WHERE "userId"=(SELECT id FROM "User" WHERE email=$1) AND "sourceId"=$2`, [email, String(athlete * 100 + 1)]);
      const inflight = post(page, "/api/strava/sync");
      await expect.poll(async () => (await query('SELECT "leaseId" FROM "StravaConnection" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email])).rows[0]?.leaseId).toBeTruthy();
      expect((await post(page, "/api/strava/disconnect")).status()).toBe(200);
      expect((await inflight).status()).toBe(409);
      const deleted = await (await page.request.get("/api/account")).json();
      expect(deleted.stravaActivities).toEqual([]);
      expect(deleted.stravaConnection).toBeNull();
      expect(deleted.runningAnalyticsSettings).toBeNull();
      await control({ delay: 0 });
      // A callback already exchanging its code cannot recreate a disconnected connection.
      await control({ tokenDelay: 2000 });
      const start = await page.request.post("/api/strava/connect", { form: { consent: CONSENT }, headers: { Origin: APP_URL }, maxRedirects: 0 });
      const authorize = await page.request.get(start.headers().location, { maxRedirects: 0 });
      const state = new URL(start.headers().location).searchParams.get("state");
      const callback = page.request.get(authorize.headers().location, { maxRedirects: 0 });
      await expect.poll(async () => (await query(`SELECT token FROM "VerificationToken" WHERE identifier=(SELECT 'strava-oauth:' || id FROM "User" WHERE email=$1)`, [email])).rows[0]?.token)
        .toBe(createHash("sha256").update(`${state}:claimed`).digest("hex"));
      expect((await post(page, "/api/strava/disconnect")).status()).toBe(200);
      expect((await callback).headers().location).toContain("strava=invalid");
      expect((await (await page.request.get("/api/account")).json()).stravaConnection).toBeNull();
      await control({ tokenDelay: 0 });
      // Freed athlete can connect to another account; account delete cascades new tables.
      await other.route("**/api/strava/sync", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
      await connect(other, athlete);
      expect((await post(other, "/api/strava/sync")).status()).toBe(200);
      expect((await other.request.delete("/api/account", { headers: { Origin: APP_URL } })).status()).toBe(204);
      expect((await query('SELECT count(*)::int n FROM "StravaActivity" a JOIN "User" u ON u.id=a."userId" WHERE u.email=$1', [secondEmail])).rows[0].n).toBe(0);
    });
  } finally { await control({ rate: false, delay: 0, tokenDelay: 0 }); await second.close(); }
});

test("one explicit sync request imports only the selected period, without background retries", async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("strava-history");
  const athlete = 8401;
  const previousYear = new Date().getUTCFullYear() - 2;
  const month = new Date().toISOString().slice(0, 7);
  await control({ history: true, latest: false, delay: 0 });
  try {
    const syncBodies: unknown[] = [];
    const activityReads: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "GET" && new URL(request.url()).pathname === "/api/strava/activities")
        activityReads.push(request.url());
    });
    await page.route("**/api/strava/sync", async (route) => {
      syncBodies.push(route.request().postDataJSON());
      await route.continue();
    });
    await page.goto("/planner");
    await signIn(page, email);
    await connect(page, athlete);
    await page.waitForTimeout(1500);
    expect(syncBodies).toHaveLength(0);
    const stored = async () => (await query(`SELECT a."sourceId", a."localDate", a."streamState"
      FROM "StravaActivity" a JOIN "User" u ON u.id=a."userId" WHERE u.email=$1`, [email])).rows;
    const ownCalls = async () => {
      const state = await (await fetch(`${MOCK}/__control`)).json();
      return state.calls.filter((call: { athlete: number }) => call.athlete === athlete);
    };
    const synchronize = page.getByRole("button", { name: "Synchronize Strava", exact: true });
    const syncing = page.getByRole("status").filter({ hasText: "Synchronizing Strava data" });
    await control({ rate: true });
    await synchronize.click();
    const syncError = page.getByRole("alert").filter({ hasText: "Unable to complete this request" });
    await expect(syncError).toBeVisible();
    await expect(syncing).toHaveCount(0);
    await expect(syncError).toHaveCount(0);
    expect(syncBodies).toEqual([{ view: "month", month }]);
    await control({ rate: false });
    await query(`UPDATE "StravaConnection" SET "retryAt"=NULL WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
    await page.reload();
    await page.waitForTimeout(1500);
    expect(syncBodies).toHaveLength(1);
    await synchronize.focus();
    await page.keyboard.press("Enter");
    await expect(syncing).toBeVisible();
    await page.getByRole("link", { name: "Year", exact: true }).click();
    await expect(page.getByLabel("Year", { exact: true })).toBeVisible();
    await page.getByLabel("Year", { exact: true }).selectOption(String(previousYear));
    await expect(syncing).toBeVisible();
    await expect(syncing).toHaveCount(0, { timeout: 60_000 });
    expect(syncBodies).toEqual([{ view: "month", month }, { view: "month", month }]);
    expect(await stored()).toHaveLength(21);
    expect((await stored()).every((row) => row.localDate.startsWith(month) && row.streamState !== "pending")).toBeTruthy();
    const summaryCalls = (await ownCalls()).filter((call: { path: string }) => call.path.endsWith("/athlete/activities"));
    expect(summaryCalls.at(-1).query.per_page).toBe("200");
    const start = Date.parse(`${month}-01T00:00:00Z`) / 1000 - 86400;
    expect(Number(summaryCalls.at(-1).query.after)).toBe(start);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(synchronize).toBeEnabled();
    await synchronize.click();
    await expect(syncing).toBeVisible();
    await expect(syncing).toHaveCount(0);
    expect(syncBodies.at(-1)).toEqual({ view: "year", year: String(previousYear) });
    expect(await stored()).toHaveLength(22);
    await expect(synchronize).toBeDisabled();
    await synchronize.locator("..").hover();
    await expect(page.getByRole("tooltip")).toContainText("Last summary sync");
    await page.mouse.move(0, 0);
    await expect(page.locator(`[data-year-month="${previousYear}-06"]`)).toContainText("1 Runs");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    const cache = createClient({ url: REDIS_URL });
    await cache.connect();
    try {
      const userId = (await query('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id;
      const index = `run-week:strava:v1:${createHash("sha256").update(userId).digest("hex")}`;
      const entries = await cache.sMembers(index);
      const snapshots = entries.filter((entry) => entry.includes(":dashboard:"));
      expect(snapshots.length).toBeGreaterThan(0);
      const snapshot = await cache.get(snapshots[0]);
      expect(snapshot).not.toContain("Synthetic");
      expect(snapshot).not.toContain("heartrate");
      expect(await cache.ttl(snapshots[0])).toBeGreaterThan(0);
      expect(await cache.ttl(snapshots[0])).toBeLessThanOrEqual(300);
      const callsBeforeCachedSync = (await ownCalls()).length;
      expect((await syncWithRetry(page, { view: "year", year: String(previousYear) })).status()).toBe(200);
      expect((await ownCalls()).length).toBe(callsBeforeCachedSync);
      const url = `/api/strava/activities?view=year&year=${previousYear}`;
      const overview = await page.request.get(url);
      expect(overview.status()).toBe(200);
      expect(overview.headers()["cache-control"]).toBe("no-store");
      const activity = (await overview.json()).activities[0];
      expect((await page.request.patch(`/api/strava/activities/${activity.id}`, {
        data: { maximalEffort: true }, headers: { Origin: APP_URL },
      })).status()).toBe(200);
      expect((await cache.sMembers(index)).filter((entry) => entry.includes(":dashboard:"))).toHaveLength(0);
      const updated = await (await page.request.get(url)).json();
      expect(updated.maximalEfforts.map((effort: { id: string }) => effort.id)).toContain(activity.id);
      const field = `sync:${previousYear}-01-01:${previousYear + 1}-01-01`;
      const marker = `${index}:sync:${createHash("sha256").update(field).digest("hex")}`;
      expect(await cache.exists(marker)).toBe(1);
      await cache.pExpire(marker, 1);
      await page.waitForTimeout(1100);
      expect((await syncWithRetry(page, { view: "year", year: String(previousYear) })).status()).toBe(200);
      expect((await ownCalls()).length).toBe(callsBeforeCachedSync);
    } finally { await cache.close(); }
    await page.waitForLoadState("networkidle");
    const readsBeforeNavigation = activityReads.length;
    await page.locator(`[data-year-month="${previousYear}-06"]`).click();
    await expect(page.getByLabel("Month", { exact: true })).toHaveValue(`${previousYear}-06`);
    await page.getByRole("link", { name: "Year", exact: true }).click();
    await expect(page.getByLabel("Year", { exact: true })).toHaveValue(String(previousYear));
    await page.waitForLoadState("networkidle");
    expect(activityReads).toHaveLength(readsBeforeNavigation);
    await page.locator(`[data-year-month="${previousYear}-06"]`).click();
    await expect(page.getByLabel("Month", { exact: true })).toHaveValue(`${previousYear}-06`);
    const beforeMonth = (await ownCalls()).length;
    await expect(synchronize).toBeDisabled();
    await query(`UPDATE "StravaConnection" SET "syncHistory"='[]' WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
    await page.reload();
    await expect(synchronize).toBeEnabled();
    await synchronize.click();
    await expect(syncing).toHaveCount(0);
    await expect.poll(() => syncBodies.length).toBe(4);
    expect(syncBodies.at(-1)).toEqual({ view: "month", month: `${previousYear}-06` });
    await expect(synchronize).toBeDisabled();
    expect((await ownCalls()).slice(beforeMonth)).toHaveLength(1);
    await page.getByRole("link", { name: "Week", exact: true }).click();
    const weekStart = new Date(`${previousYear}-06-01T00:00:00Z`);
    weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
    await expect(page.getByLabel("Week", { exact: true })).toHaveValue(weekStart.toISOString().slice(0, 10));
    await expect(synchronize).toBeEnabled();
    await synchronize.click();
    await expect.poll(() => syncBodies.length).toBe(5);
    await expect.poll(async () => (await (await page.request.get(
      `/api/strava/activities?view=week&date=${weekStart.toISOString().slice(0, 10)}`)).json()).periodSynchronized).toBe(true);
    await expect(synchronize).toBeDisabled();
    expect(syncBodies.at(-1)).toEqual({ view: "week", date: weekStart.toISOString().slice(0, 10) });
    const weekCalls = await ownCalls();
    const weekSummary = weekCalls.at(-1);
    expect(Number(weekSummary.query.after)).toBe(weekStart.getTime() / 1000 - 86400);
    expect(Number(weekSummary.query.before) - Number(weekSummary.query.after)).toBe(9 * 86400);
    expect(await stored()).toHaveLength(22);
    await query(`UPDATE "StravaActivity" SET "streamState"='pending' WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)
      AND "sourceId"=$2`, [email, String(athlete * 100 + 90)]);
    await query(`UPDATE "StravaConnection" SET "syncHistory"='[]' WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
    await page.reload();
    await control({ delay: 3000 });
    await expect(synchronize).toBeEnabled();
    await synchronize.click();
    await expect.poll(async () => (await ownCalls()).length).toBeGreaterThan(weekCalls.length + 1);
    await syncing.getByRole("button", { name: "Stop", exact: true }).click();
    await expect(syncing).toHaveCount(0);
    await page.waitForTimeout(3500);
    expect(syncBodies).toHaveLength(6);
    const afterStop = (await ownCalls()).length;
    await page.getByRole("button", { name: "Previous period" }).click();
    await page.reload();
    await page.waitForTimeout(1500);
    expect(syncBodies).toHaveLength(6);
    expect((await ownCalls()).length).toBe(afterStop);
    const finalCache = createClient({ url: REDIS_URL });
    await finalCache.connect();
    const userId = (await query('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id;
    const index = `run-week:strava:v1:${createHash("sha256").update(userId).digest("hex")}`;
    const entries = await finalCache.sMembers(index);
    await page.goto("/privacy");
    const disconnectButton = page.getByRole("button", { name: "Disconnect and delete imported data", exact: true });
    await disconnectButton.click();
    const disconnectDialog = page.getByRole("dialog", { name: "Disconnect and delete imported data", exact: true });
    await expect(disconnectDialog).toContainText("Strava activities remain unchanged.");
    await disconnectDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(disconnectDialog).toHaveCount(0);
    expect((await query('SELECT count(*)::int n FROM "StravaActivity" WHERE "userId"=$1', [userId])).rows[0].n).toBeGreaterThan(0);
    await disconnectButton.click();
    await page.route("**/api/strava/disconnect", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
    await disconnectDialog.getByRole("button", { name: "Disconnect and delete imported data", exact: true }).click();
    await expect(disconnectDialog.getByRole("alert")).toBeVisible();
    await expect(disconnectDialog.getByRole("alert")).toHaveClass(/text-red-700/);
    await page.unroute("**/api/strava/disconnect");
    await disconnectDialog.getByRole("button", { name: "Disconnect and delete imported data", exact: true }).click();
    await expect(disconnectDialog).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Strava imports, settings and tokens deleted." })).toBeVisible();
    try {
      expect(await finalCache.exists(index)).toBe(0);
      for (const entry of entries) expect(await finalCache.exists(entry)).toBe(0);
    } finally { await finalCache.close(); }
    expect((await query(`SELECT count(*)::int n FROM "StravaActivity" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email])).rows[0].n).toBe(0);
  } finally { await control({ history: false, latest: false, delay: 0 }); }
});
