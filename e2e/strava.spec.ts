import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { createHash } from "node:crypto";
import { APP_URL, DATABASE_URL, REDIS_URL } from "./env";
import { createClient } from "redis";
import { accountMenuButton, createWeek, signIn, uniqueEmail } from "./helpers";
import { syncStatusSchema } from "../src/features/strava/background-sync";
import { STRAVA_CONSENT_VERSION } from "../src/features/strava/types";
import { calculateVdot, formatPace } from "../src/features/running-programs/domain";

const MOCK = "http://127.0.0.1:3102";
const DELIVERY = "http://127.0.0.1:3103";
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
async function deliveryControl(values: { paused?: boolean; failDelivery?: boolean }) {
  expect((await fetch(`${DELIVERY}/__control`, { method: "POST", body: JSON.stringify(values) })).ok).toBe(true);
}
async function currentJob(page: Page) {
  const response = await page.request.get("/api/strava/sync");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  return syncStatusSchema.parse(await response.json()).job;
}
async function scheduleIncremental(page: Page, email: string) {
  await query(`UPDATE "StravaConnection" SET "lastSyncedAt"=CURRENT_TIMESTAMP - INTERVAL '2 days'
    WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
  expect((await fetch(`${DELIVERY}/__schedule`, { method: "POST" })).ok).toBe(true);
  const job = await currentJob(page);
  if (!job) throw new Error("Scheduled import job is missing");
  return job;
}
async function fullImport(page: Page, id: string) {
  // Only the worker advances checkpoints. Browser/API reads must never drive import steps.
  await expect.poll(async () => {
    const job = await currentJob(page);
    expect(job?.id).toBe(id);
    expect(job?.status).not.toBe("failed");
    expect(job?.status).not.toBe("cancelled");
    return job?.status;
  }, { timeout: 90_000 }).toBe("completed");
}
async function extendQueuedFixture(page: Page) {
  const harness = await fetch(`${DELIVERY}/__control`);
  expect(harness.ok).toBe(true);
  expect((await harness.json()).paused).toBe(true);
  const job = await currentJob(page);
  expect(job?.status).toBe("queued");
  if (!job) throw new Error("Missing OAuth history job");
  // Synthetic runs occur on days 1-21, including future days early in the month.
  // Change only this queued job in the disposable DB while delivery is paused.
  const end = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
  const updated = await query(`UPDATE "StravaSyncJob" SET before=$1,"end"=$2 WHERE id=$3 AND status='queued' RETURNING id`,
    [Math.floor(end.getTime() / 1000), end.toISOString().slice(0, 10), job.id]);
  expect(updated.rowCount).toBe(1);
  return job;
}

test.beforeEach(async () => {
  await deliveryControl({ paused: false, failDelivery: false });
  await control({ history: false, latest: false, rate: false, delay: 0, tokenDelay: 0 });
});
test.afterEach(async () => {
  await control({ history: false, latest: false, rate: false, delay: 0, tokenDelay: 0 });
  await deliveryControl({ paused: false, failDelivery: false });
});

test("simulator offers the highest eligible maximal-effort VDOT only when marked efforts exist", async ({ page }) => {
  test.setTimeout(150_000);
  const email = uniqueEmail("maximal-planner");
  await page.goto("/planner");
  await expect(page.locator("[data-maximal-performance-option]")).toHaveCount(0);
  await signIn(page, email);
  await deliveryControl({ paused: true });
  await connect(page, 8901);
  const job = await extendQueuedFixture(page);
  await deliveryControl({ paused: false });
  await fullImport(page, job.id);
  await page.goto("/planner");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-maximal-performance-option]")).toHaveCount(0);
  await query(`UPDATE "StravaActivity" SET "maximalEffort"=true, "distanceMeters"=5000, "elapsedSeconds"=1320
    WHERE "sourceId"=$1 AND "userId"=(SELECT id FROM "User" WHERE email=$2)`, ["890101", email]);
  await query(`UPDATE "StravaActivity" SET "maximalEffort"=true, "distanceMeters"=10000,
    "elapsedSeconds"=2700, "movingSeconds"=1200, "localDate"='2020-01-01'
    WHERE "sourceId"=$1 AND "userId"=(SELECT id FROM "User" WHERE email=$2)`, ["890102", email]);
  await page.reload();
  const useEfforts = page.getByRole("button", { name: "Use maximal-effort activities", exact: true });
  await expect(useEfforts).toBeVisible();
  await expect(page.getByLabel("Minutes", { exact: true })).toHaveValue("25");
  await page.setViewportSize({ width: 390, height: 844 });
  await useEfforts.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Minutes", { exact: true })).toHaveValue("45");
  await expect(page.getByLabel("Seconds", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Hours", { exact: true })).toHaveValue("0");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/planner") && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Create training week", exact: true }).click();
  expect((await saved).status()).toBe(200);
  const planner = (await (await page.request.get("/api/planner")).json()).planner;
  expect(planner.profile.distanceMeters).toBe(10000);
  expect(planner.profile.raceSeconds).toBe(2700);
  expect(planner.profile.vdot).toBeCloseTo(calculateVdot(10000, 2700), 8);
  await query(`UPDATE "StravaActivity" SET "maximalEffort"=false WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
  await page.reload();
  await page.locator("summary").first().click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-maximal-performance-option]")).toHaveCount(0);
});

test("calendar navigation reads stored coverage and disconnect clears cached data without sync controls", async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("strava-history");
  const previousYear = new Date().getUTCFullYear() - 2;
  await control({ history: true });
  await deliveryControl({ paused: true });
  await page.goto("/planner");
  await signIn(page, email);
  await connect(page, 8401);
  const job = await extendQueuedFixture(page);
  await deliveryControl({ paused: false });
  await fullImport(page, job.id);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/strava/sync" && request.method() !== "GET")
      mutations.push(request.method());
  });
  await page.goto(`/activities?view=year&year=${previousYear}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(`[data-year-month="${previousYear}-06"]`)).toContainText("1 Runs");
  await expect(page.getByRole("button", { name: /Synchronize Strava|Stop/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const userId = (await query('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id;
  const cache = createClient({ url: REDIS_URL });
  await cache.connect();
  try {
    const index = `run-week:strava:v1:${createHash("sha256").update(userId).digest("hex")}`;
    const entries = await cache.sMembers(index);
    const snapshots = entries.filter((entry) => entry.includes(":dashboard:"));
    expect(snapshots.length).toBeGreaterThan(0);
    const snapshot = await cache.get(snapshots[0]);
    expect(snapshot).not.toBeNull();
    expect(snapshot).not.toContain("Synthetic");
    expect(snapshot).not.toContain("heartrate");
    expect(await cache.ttl(snapshots[0])).toBeGreaterThan(0);
    expect(await cache.ttl(snapshots[0])).toBeLessThanOrEqual(300);
    await page.locator(`[data-year-month="${previousYear}-06"]`).click();
    await expect(page.getByLabel("Month", { exact: true })).toHaveValue(`${previousYear}-06`);
    await page.getByRole("link", { name: "Week", exact: true }).click();
    await expect(page.getByLabel("Week", { exact: true })).toBeVisible();
    await cache.flushDb();
    await page.reload();
    const coverage = (await query('SELECT "syncHistory" FROM "StravaConnection" WHERE "userId"=$1', [userId])).rows[0].syncHistory;
    expect(coverage.some((range: { start: string; end: string }) => range.start <= `${previousYear}-01-01`
      && range.end >= `${previousYear + 1}-01-01`)).toBe(true);
    expect(mutations).toEqual([]);
    await page.goto("/privacy");
    const button = page.getByRole("button", { name: "Disconnect and delete imported data", exact: true });
    await button.click();
    const dialog = page.getByRole("dialog", { name: "Disconnect and delete imported data", exact: true });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await query('SELECT count(*)::int n FROM "StravaActivity" WHERE "userId"=$1', [userId])).rows[0].n).toBeGreaterThan(0);
    await button.click();
    await page.route("**/api/strava/disconnect", (route) => route.fulfill({ status: 503, json: { error: "unavailable" } }));
    await dialog.getByRole("button", { name: "Disconnect and delete imported data", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await page.unroute("**/api/strava/disconnect");
    await dialog.getByRole("button", { name: "Disconnect and delete imported data", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await cache.exists(index)).toBe(0);
    expect((await query('SELECT count(*)::int n FROM "StravaActivity" WHERE "userId"=$1', [userId])).rows[0].n).toBe(0);
    expect(mutations).toEqual([]);
  } finally { await cache.close(); }
});

test("OAuth queues snapshot history durably; navigation only reads and unpublished delivery recovers", async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail("strava-auto");
  const athlete = 8601;
  const previousYear = new Date().getUTCFullYear() - 2;
  await control({ history: true });
  await deliveryControl({ paused: true, failDelivery: true });
  const mutations: string[] = [];
  const polls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname !== "/api/strava/sync") return;
    if (request.method() === "GET") polls.push(request.url());
    else mutations.push(request.method());
  });
  await page.goto("/planner");
  await signIn(page, email);
  const started = Math.floor(Date.now() / 1000);
  await connect(page, athlete);
  expect((await (await page.request.get("/api/strava/status")).json()).connected).toBe(true);
  const job = await currentJob(page);
  expect(job?.status).toBe("queued");
  if (!job) throw new Error("OAuth did not persist its history job");
  const stored = (await query('SELECT kind,start,"end",before,page,"publishedAt" FROM "StravaSyncJob" WHERE id=$1', [job.id])).rows[0];
  expect(stored.kind).toBe("history");
  expect(stored.start).toBe("1970-01-01");
  expect(stored.before).toBeGreaterThanOrEqual(started);
  expect(stored.before).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  expect(stored.end).toBe(new Date((stored.before + 86400) * 1000).toISOString().slice(0, 10));
  expect(stored.page).toBe(1);
  expect(stored.publishedAt).toBeNull();
  const empty = await page.request.get(`/api/strava/activities?view=year&year=${previousYear}`);
  expect(empty.status()).toBe(200);
  expect((await empty.json()).activities).toEqual([]);
  for (const url of ["/activities?month=2023-01", "/activities?view=week&date=2023-01-03", "/running-metrics?month=2020-01", "/planner"]) {
    await page.goto(url);
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
  }
  await page.reload();
  await expect.poll(() => polls.length).toBeGreaterThan(0);
  expect(mutations).toEqual([]);
  expect((await currentJob(page))?.id).toBe(job.id);
  expect((await query('SELECT count(*)::int n FROM "StravaSyncJob" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email])).rows[0].n).toBe(1);
  const ownCalls = async () => (await (await fetch(`${MOCK}/__control`)).json()).calls
    .filter((call: { athlete: number }) => call.athlete === athlete);
  expect((await ownCalls()).filter((call: { path: string }) => call.path.startsWith("/api/"))).toEqual([]);
  await deliveryControl({ failDelivery: false });
  expect((await fetch(`${DELIVERY}/__dispatch`, { method: "POST" })).ok).toBe(true);
  expect((await currentJob(page))?.id).toBe(job.id);
  await page.goto(`/activities?month=${previousYear}-06`);
  await expect(page.getByRole("banner").getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("banner")).not.toContainText("Running summaries");
  await expect(page.getByRole("button", { name: /Synchronize Strava|Stop/ })).toHaveCount(0);
  await deliveryControl({ paused: false });
  await fullImport(page, job.id);
  // No reload/manual sync: status polling invalidates the overview after worker progress.
  await expect(page.locator(`[data-date="${previousYear}-06-01"] a[href^="/activities/"]`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]);
  const imported = (await query('SELECT "startedAt" FROM "StravaActivity" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email])).rows;
  expect(imported.length).toBeGreaterThan(0);
  expect(imported.every((row) => new Date(row.startedAt).getTime() < stored.before * 1000)).toBe(true);
  const beforeSkip = (await ownCalls()).length;
  await page.goto(`/activities?view=year&year=${previousYear}`);
  await page.reload();
  expect((await ownCalls()).length).toBe(beforeSkip);
});

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
  await deliveryControl({ paused: true });
  await page.goto("/planner");
  await expect(page.getByRole("navigation", { name: "Run Week", exact: true }).getByRole("link", { name: "Activity overview", exact: true })).toBeVisible();
  await page.goto("/activities");
  await expect(page.getByRole("link", { name: "Sign in to view your running data" })).toBeVisible();
  expect((await post(page, "/api/strava/sync")).status()).toBe(405);
  expect((await page.request.get("/api/strava/sync")).status()).toBe(401);
  expect((await page.request.delete("/api/strava/sync", { headers: { Origin: APP_URL } })).status()).toBe(405);
  await signIn(page, email);
  await page.goto("/activities");
  await expect(page.getByRole("link", { name: "Connect with Strava", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Training calendar" })).toHaveCount(0);
  await page.goto("/running-metrics");
  await expect(page.getByRole("link", { name: "Connect with Strava", exact: true })).toBeVisible();
  expect((await page.request.post("/api/strava/sync", { data: {}, headers: { Origin: "https://foreign.example" } })).status()).toBe(405);
  await connect(page, athlete);
  await expect(page.getByText("Strava connected.", { exact: true }).filter({ visible: true })).toBeVisible();
  const initialJob = await extendQueuedFixture(page);
  const connection = await query('SELECT c.tokens, c."athleteKey" FROM "StravaConnection" c JOIN "User" u ON u.id=c."userId" WHERE u.email=$1', [email]);
  expect(connection.rows[0].tokens).not.toContain("synthetic");
  expect(connection.rows[0].athleteKey).toMatch(/^[a-f0-9]{64}$/);

  await test.step("pending activity details observe heart-rate streams imported by the durable job", async () => {
    expect((await currentJob(page))?.id).toBe(initialJob.id);
    await deliveryControl({ paused: false });
    await expect.poll(async () => (await currentJob(page))?.phase).toBe("streams");
    await deliveryControl({ paused: true });
    const pending = await query(`SELECT a.id FROM "StravaActivity" a JOIN "User" u ON u.id=a."userId"
      WHERE u.email=$1 AND a."sourceId"=$2`, [email, String(athlete * 100 + 1)]);
    const id = pending.rows[0].id;
    expect((await query('SELECT "streamState" FROM "StravaActivity" WHERE id=$1', [id])).rows[0].streamState).toBe("pending");
    const streamRequest = await post(page, `/api/strava/activities/${id}`);
    expect(streamRequest.status()).toBe(405);
    await page.goto(`/activities/${id}`);
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("banner")).not.toContainText("Running summaries");
    await deliveryControl({ paused: false });
    await expect(page.locator("[data-activity-summary] > div").filter({ hasText: "Elapsed time" }).locator("dd")).toHaveText("2 min");
    await expect(page.getByRole("application", { name: "Heart rate / Pace · Elapsed time", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("[data-activity-summary] > div").filter({ hasText: "Average heart rate" }).locator("dd")).toHaveText("155 bpm");
    await expect(page.getByRole("button", { name: "Continue import", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Recorded streams", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to overview", exact: true })).toHaveCount(0);
    await expect.poll(async () => (await query('SELECT "streamState" FROM "StravaActivity" WHERE id=$1', [id])).rows[0].streamState,
      { timeout: 60_000 }).toBe("ready");
    const stored = await query('SELECT streams, "streamState" FROM "StravaActivity" WHERE id=$1', [id]);
    expect(stored.rows[0].streamState).toBe("ready");
    expect(stored.rows[0].streams.heartrate).toEqual([140, 160, null, 170, 170]);
    expect((await page.request.post(`/api/strava/activities/${id}`, {
      headers: { Origin: "https://foreign.example" },
    })).status()).toBe(405);
    expect((await post(page, "/api/strava/activities/missing")).status()).toBe(405);
  });

  await test.step("scheduled imports share one durable job and remain idempotent", async () => {
    await fullImport(page, initialJob.id);
    await deliveryControl({ paused: true });
    const simultaneous = [await scheduleIncremental(page, email)];
    expect((await fetch(`${DELIVERY}/__schedule`, { method: "POST" })).ok).toBe(true);
    simultaneous.push((await currentJob(page)) ?? simultaneous[0]);
    expect(simultaneous[0].id).toBe(simultaneous[1].id);
    expect(simultaneous[0].id).not.toBe(initialJob.id);
    expect((await query(`SELECT count(*)::int n FROM "StravaSyncJob" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1) AND status IN ('queued','running','paused')`, [email])).rows[0].n).toBe(1);
    await deliveryControl({ paused: false });
    await fullImport(page, simultaneous[0].id);
    const exportResponse = await page.request.get("/api/account");
    expect(exportResponse.headers()["cache-control"]).toBe("no-store");
    const exported = await exportResponse.json();
    expect(exported.stravaActivities).toHaveLength(21);
    expect(new Set(exported.stravaActivities.map((a: { sourceId: string }) => a.sourceId)).size).toBe(21);
    expect(exported.stravaActivities.find((a: { sourceId: string }) => a.sourceId.endsWith("03")).streams.heartrate).toBeNull();
    expect(exported.stravaActivities.find((a: { sourceId: string }) => a.sourceId.endsWith("04")).streamState).toBe("unavailable");
    expect(JSON.stringify(exported)).not.toMatch(/synthetic-access|synthetic-refresh|athleteKey|latitude|longitude|latlng/);
    const repeatJob = await scheduleIncremental(page, email);
    await fullImport(page, repeatJob.id);
    const repeat = await (await page.request.get("/api/account")).json();
    expect(repeat.stravaActivities).toHaveLength(21);
    const calls = await (await fetch(`${MOCK}/__control`)).json();
    const own = calls.calls.filter((c: { athlete: number }) => c.athlete === athlete);
    expect(own.filter((c: { grant?: string }) => c.grant === "refresh_token")).toHaveLength(1);
    expect(own.filter((c: { path: string }) => c.path.endsWith("/athlete/activities"))
      .every((c: { query: { per_page: string } }) => c.query.per_page === "200")).toBe(true);
    expect((await query('SELECT page FROM "StravaSyncJob" WHERE id=$1', [initialJob.id])).rows[0].page).toBe(2);
    for (const c of own.filter((c: { path: string }) => c.path.endsWith("/streams"))) expect(c.query.keys).toBe("time,heartrate,velocity_smooth,distance");
  });

  await test.step("HR settings, measured charts, maximal confirmation and responsive keyboard UI", async () => {
    await page.goto("/planner");
    const syncRequests: number[] = [];
    await page.route("**/api/strava/sync", async (route) => {
      if (route.request().method() === "POST") syncRequests.push(Date.now());
      await route.continue();
    });
    await page.goto(`/activities?month=${month}`);
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    const imported = await query(`SELECT c."syncActive", (SELECT count(*)::int FROM "StravaActivity" a WHERE a."userId"=c."userId") total,
      (SELECT count(*)::int FROM "StravaActivity" a WHERE a."userId"=c."userId" AND a."streamState"='pending') pending
      FROM "StravaConnection" c JOIN "User" u ON c."userId"=u.id WHERE u.email=$1`, [email]);
    expect(imported.rows[0]).toEqual({ syncActive: false, total: 21, pending: 0 });
    expect(syncRequests).toHaveLength(0);
    await expect(page.getByRole("button", { name: "Synchronize Strava", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Import recent activities", exact: true })).toHaveCount(0);
    await page.unroute("**/api/strava/sync");
    await expect(page.getByRole("heading", { name: "Activity overview", exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    const monthBounds = await page.getByLabel("Month", { exact: true }).boundingBox();
    expect(monthBounds).not.toBeNull();
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
      expect(tick.trim()).toMatch(/^\d+$/);
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
    for (const value of await volumeChart.locator("[data-volume-value]").allTextContents()) {
      expect(value.trim()).not.toBe("0.0");
    }
    for (const tick of await volumeChart.locator("[data-volume-hours-tick]").allTextContents()) {
      expect(tick.trim()).toMatch(/^\d+$/);
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
    await expect(accountMenuButton(page)).toBeVisible();
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
    await expect(page.locator("[data-activity-summary] dt")).toHaveText([
      "Distance", "Elapsed time", "Average heart rate", "Average moving pace",
    ]);
    const hrAverage = chart.locator('.recharts-reference-line-line[stroke="#be123c"]');
    const paceAverage = chart.locator('.recharts-reference-line-line[stroke="#1d4ed8"]');
    await expect(hrAverage).toHaveCount(1);
    await expect(paceAverage).toHaveCount(1);
    await expect(hrAverage).toHaveAttribute("stroke-dasharray", "6 4");
    await expect(paceAverage).toHaveAttribute("stroke-dasharray", "6 4");
    const averages = (await query(`SELECT "averageHr", "movingSeconds", "distanceMeters" FROM "StravaActivity"
      WHERE id=$1`, [new URL(page.url()).pathname.split("/").at(-1)])).rows[0];
    await expect(hrAverage).toHaveAttribute("y1", await hrAverage.getAttribute("y2") ?? "");
    await expect(paceAverage).toHaveAttribute("y1", await paceAverage.getAttribute("y2") ?? "");
    await expect(chart).toContainText(`${averages.averageHr.toFixed(1)} bpm`);
    await expect(chart).toContainText(`${formatPace(averages.movingSeconds * 1000 / averages.distanceMeters)} min/km`);
    const hrLine = chart.locator('.recharts-line-curve[stroke="#be123c"]');
    const paceLine = chart.locator('.recharts-line-curve[stroke="#1d4ed8"]');
    await expect(hrLine).toHaveCount(1);
    await expect(paceLine).toHaveCount(1);
    await expect(paceLine).toHaveAttribute("d", /C/);
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
    await expect(hrAverage).toHaveCount(0);
    await expect(paceAverage).toHaveCount(1);
    await expect(hrLine).toHaveCount(0);
    await expect(paceLine).toHaveCount(1);
    await expect(chart.locator(".recharts-reference-area")).toHaveCount(0);
    await paceCheckbox.uncheck();
    await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(0);
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
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
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
      await expect(other.getByText(`This Strava account is already linked to the Run Week account ${email}. Disconnect it from that account first.`)).toBeVisible();
      expect(other.url()).not.toContain(email);
      const noticeCookie = (await second.cookies(`${APP_URL}/activities`)).find((cookie) => cookie.name === "run-week-strava-linked-account");
      expect(noticeCookie?.httpOnly).toBe(true);
      expect(noticeCookie?.value).not.toContain(email);
      const id = (await query('SELECT a.id FROM "StravaActivity" a JOIN "User" u ON u.id=a."userId" WHERE u.email=$1 LIMIT 1', [email])).rows[0].id;
      expect((await other.request.patch(`/api/strava/activities/${id}`, { data: { maximalEffort: true }, headers: { Origin: APP_URL } })).status()).toBe(404);
      expect((await post(other, `/api/strava/activities/${id}`)).status()).toBe(405);
      expect((await (await other.request.get("/api/account")).json()).stravaActivities).toHaveLength(0);
      const start = await page.request.post("/api/strava/connect", { form: { consent: STRAVA_CONSENT_VERSION }, headers: { Origin: APP_URL }, maxRedirects: 0 });
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
    await test.step("provider rate limits pause durable jobs and disconnect prevents pending stream writes", async () => {
      await control({ rate: true });
      const limited = await scheduleIncremental(page, email);
      await expect.poll(async () => (await currentJob(page))?.status).toBe("paused");
      const paused = await currentJob(page);
      expect(paused?.retryAt).not.toBeNull();
      expect(Date.parse(paused?.retryAt ?? "")).toBeGreaterThan(Date.now());
      await deliveryControl({ paused: true });
      const callsBefore = (await (await fetch(`${MOCK}/__control`)).json()).calls.length;
      expect((await currentJob(page))?.id).toBe(limited.id);
      expect((await (await fetch(`${MOCK}/__control`)).json()).calls.length).toBe(callsBefore);
      await control({ rate: false, delay: 2000 });
      await query('UPDATE "StravaSyncJob" SET "retryAt"=NULL WHERE id=$1', [limited.id]);
      await query(`UPDATE "StravaSyncQuota" SET "nextCallAt"=NOW() WHERE id='api'`);
      const target = (await query(`SELECT a.id, a."sourceId" FROM "StravaActivity" a
        JOIN "StravaSyncJob" j ON j."userId"=a."userId"
        WHERE j.id=$1 AND a."localDate">=j.start AND a."localDate"<j."end"
          AND a."streamState"='ready' ORDER BY a."startedAt" DESC LIMIT 1`, [limited.id])).rows[0];
      expect(target).toBeDefined();
      await query(`UPDATE "StravaActivity" SET "streamState"='pending' WHERE id=$1`, [target.id]);
      const ownStreamCalls = async () => (await (await fetch(`${MOCK}/__control`)).json()).calls
        .filter((call: { athlete: number; path: string }) => call.athlete === athlete && call.path.endsWith(`/activities/${target.sourceId}/streams`)).length;
      const beforeStream = await ownStreamCalls();
      await deliveryControl({ paused: false });
      await expect.poll(ownStreamCalls).toBeGreaterThan(beforeStream);
      expect((await post(page, "/api/strava/disconnect")).status()).toBe(200);
      await expect.poll(async () => (await (await fetch(`${DELIVERY}/__control`)).json()).working).toBe(false);
      expect((await query('SELECT count(*)::int n FROM "StravaSyncJob" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email])).rows[0].n).toBe(0);
      const deleted = await (await page.request.get("/api/account")).json();
      expect(deleted.stravaActivities).toEqual([]);
      expect(deleted.stravaConnection).toBeNull();
      expect(deleted.runningAnalyticsSettings).toBeNull();
      await control({ delay: 0 });
      // A callback already exchanging its code cannot recreate a disconnected connection.
      await control({ tokenDelay: 2000 });
      const start = await page.request.post("/api/strava/connect", { form: { consent: STRAVA_CONSENT_VERSION }, headers: { Origin: APP_URL }, maxRedirects: 0 });
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
      await deliveryControl({ paused: true });
      await connect(other, athlete);
      const otherJob = await currentJob(other);
      expect(otherJob?.status).toBe("queued");
      expect((await currentJob(other))?.id).toBe(otherJob?.id);
      expect((await other.request.delete("/api/account", { headers: { Origin: APP_URL } })).status()).toBe(204);
      expect((await query('SELECT count(*)::int n FROM "StravaActivity" a JOIN "User" u ON u.id=a."userId" WHERE u.email=$1', [secondEmail])).rows[0].n).toBe(0);
      expect((await query('SELECT count(*)::int n FROM "StravaSyncJob" WHERE id=$1', [otherJob?.id])).rows[0].n).toBe(0);
    });
  } finally { await control({ rate: false, delay: 0, tokenDelay: 0 }); await second.close(); }
});
