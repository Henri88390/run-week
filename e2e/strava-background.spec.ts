import { expect, test } from "@playwright/test";
import pg from "pg";
import { APP_URL, DATABASE_URL } from "./env";
import { signIn, signOut, uniqueEmail } from "./helpers";
import { dashboardSchema, STRAVA_CONSENT_VERSION } from "../src/features/strava/types";

const delivery = "http://127.0.0.1:3103";
async function sql(text: string, values: unknown[] = []) {
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try { return await client.query(text, values); }
  finally { await client.end(); }
}
async function control(values: { paused?: boolean; failDelivery?: boolean }) {
  expect((await fetch(`${delivery}/__control`, { method: "POST", body: JSON.stringify(values) })).ok).toBe(true);
}
test("import progress polls at a bounded cadence without refreshing the calendar route", async ({ page }) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("import-polling");
  await signIn(page, email);
  await sql(`INSERT INTO "StravaConnection"
    ("userId","athleteKey",tokens,"consentVersion","consentAt","updatedAt","syncBefore","syncActive",
     "lastSyncedAt",generation,"elevationVersion","sportsVersion")
    SELECT id,id,'unused-synthetic-fixture',$2,NOW(),NOW(),0,false,NOW(),id,1,1
    FROM "User" WHERE email=$1`, [email, STRAVA_CONSENT_VERSION]);
  await sql(`INSERT INTO "StravaActivity"
    (id,"userId","sourceId",name,sport,"startedAt","localDate","distanceMeters","movingSeconds","elapsedSeconds","streamState","updatedAt")
    SELECT 'poll-run',id,'poll-run','Initial run','Run',NOW(),$2,5000,1800,1800,'pending',NOW()
    FROM "User" WHERE email=$1`, [email, new Date().toISOString().slice(0, 10)]);
  let polls = 0;
  await page.route("**/api/strava/sync", (route) => route.fulfill({
    json: { job: { id: "00000000-0000-4000-8000-000000000001", status: "running", phase: "summaries",
      summaries: ++polls, recordings: 0, retryAt: null, errorCode: null }, revision: `poll-${polls}` },
  }));
  let activityResponses = 0;
  await page.route("**/api/strava/activities?*", async (route) => {
    const response = await route.fetch();
    const body = dashboardSchema.parse(await response.json());
    activityResponses++;
    body.activities = body.activities.map((activity) => ({ ...activity, distanceMeters: 5000 + 1000 * activityResponses }));
    body.weeks = body.weeks.map((week) => ({ ...week, days: week.days.map((day) => ({
      ...day, activities: day.activities.map((activity) => ({ ...activity, distanceMeters: 5000 + 1000 * activityResponses })),
    })) }));
    await route.fulfill({ response, json: body });
  });
  const calls = { activities: 0, session: 0, garmin: 0, strava: 0, route: 0, document: 0, failed: 0 };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/strava/activities") calls.activities++;
    if (url.pathname === "/api/auth/session") calls.session++;
    if (url.pathname === "/api/garmin/status") calls.garmin++;
    if (url.pathname === "/api/strava/status") calls.strava++;
    if (url.pathname === "/activities" && url.searchParams.has("_rsc")) calls.route++;
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) calls.document++;
  });
  page.on("requestfailed", (request) => {
    if (["/api/garmin/status", "/api/auth/session", "/api/strava/activities"].includes(new URL(request.url()).pathname)) calls.failed++;
  });
  await page.goto("/activities");
  await expect(page.locator("[data-week]").first()).toBeVisible();
  // Observe more than two full active polling intervals, including initial mounts.
  await page.waitForTimeout(12_000);
  expect(polls).toBeGreaterThanOrEqual(3);
  expect(polls).toBeLessThanOrEqual(4);
  expect(calls.activities).toBeGreaterThanOrEqual(2);
  expect(calls.activities).toBeLessThanOrEqual(4);
  await expect(page.locator('a[href="/activities/poll-run"]').first())
    .toHaveAttribute("aria-label", new RegExp(`${5 + activityResponses}\\.0 km`));
  // Strict Mode and the loading-to-authenticated transition can start Garmin
  // checks during initialization; neither should continue throughout polling.
  expect(calls.failed).toBeLessThanOrEqual(1);
  expect(calls.session).toBeLessThanOrEqual(4);
  expect(calls.garmin).toBeLessThanOrEqual(3);
  expect(calls.strava).toBe(0);
  expect(calls.document).toBe(1);
  expect(calls.route).toBe(0);
});

test("import refresh and session rerenders keep requests bounded and isolate accounts", async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("import-refresh");
  await signIn(page, email);
  await sql(`INSERT INTO "StravaConnection"
    ("userId","athleteKey",tokens,"consentVersion","consentAt","updatedAt","syncBefore","syncActive",
     "lastSyncedAt",generation,"elevationVersion","sportsVersion")
    SELECT id,id,'unused-synthetic-fixture',$2,NOW(),NOW(),0,false,NOW(),id,1,1
    FROM "User" WHERE email=$1`, [email, STRAVA_CONSENT_VERSION]);
  await sql(`INSERT INTO "StravaActivity"
    (id,"userId","sourceId",name,sport,"startedAt","localDate","distanceMeters","movingSeconds","elapsedSeconds","streamState","updatedAt")
    SELECT 'refresh-run',id,'refresh-run','Private fixture run','Run',NOW(),$2,5000,1800,1800,'pending',NOW()
    FROM "User" WHERE email=$1`, [email, new Date().toISOString().slice(0, 10)]);
  let polls = 0;
  await page.route("**/api/strava/sync", (route) => route.fulfill({
    json: { job: { id: "00000000-0000-4000-8000-000000000002", status: "running", phase: "streams",
      summaries: 1, recordings: ++polls, retryAt: null, errorCode: null }, revision: `refresh-${polls}` },
  }));
  await page.goto("/activities/refresh-run");
  const effort = page.getByRole("checkbox", { name: "Maximal effort" });
  await expect(effort).toBeVisible();
  await expect(page.getByRole("button", { name: "Account menu" })).toContainText(email);
  await page.waitForLoadState("networkidle");
  let refreshes = 0;
  let garmin = 0;
  let sessions = 0;
  let stravaStatus = 0;
  let failed = 0;
  let topRefreshes = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/activities/refresh-run" && url.searchParams.has("_rsc")) refreshes++;
    if (url.pathname === "/top-performances" && url.searchParams.has("_rsc")) topRefreshes++;
    if (url.pathname === "/api/garmin/status") garmin++;
    if (url.pathname === "/api/auth/session") sessions++;
    if (url.pathname === "/api/strava/status") stravaStatus++;
  });
  page.on("requestfailed", (request) => {
    if (["/api/garmin/status", "/api/auth/session", "/api/strava/activities", "/api/strava/status"].includes(new URL(request.url()).pathname)) failed++;
  });
  await effort.check();
  await expect(effort).toBeEnabled();
  await effort.uncheck();
  await expect(effort).toBeEnabled();
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const channel = new BroadcastChannel("next-auth");
      channel.postMessage({ event: "session", data: { trigger: "getSession" } });
      channel.close();
    });
    await expect.poll(() => sessions).toBeGreaterThan(i);
  }
  await page.getByRole("button", { name: "Account menu" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu", { name: "Account menu" })).toBeVisible();
  const beforePolls = polls;
  const beforeRefreshes = refreshes;
  await page.waitForTimeout(12_000);
  expect(polls - beforePolls).toBeGreaterThanOrEqual(2);
  expect(polls - beforePolls).toBeLessThanOrEqual(3);
  expect(refreshes - beforeRefreshes).toBeGreaterThanOrEqual(2);
  expect(refreshes - beforeRefreshes).toBeLessThanOrEqual(3);
  expect(garmin).toBe(0);
  expect(sessions).toBe(2);
  expect(failed).toBe(0);
  expect(stravaStatus).toBeGreaterThanOrEqual(2);
  expect(stravaStatus).toBeLessThanOrEqual(4);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Account menu" })).toBeHidden();
  await page.getByRole("link", { name: "Top performances", exact: true }).click();
  await expect(page).toHaveURL(/\/top-performances$/);
  const beforeTop = topRefreshes;
  await page.waitForTimeout(11_000);
  expect(topRefreshes - beforeTop).toBeGreaterThanOrEqual(2);
  expect(topRefreshes - beforeTop).toBeLessThanOrEqual(3);
  await page.getByRole("button", { name: "Account menu" }).focus();
  await page.keyboard.press("Enter");
  await signOut(page);
  await signIn(page, uniqueEmail("other-import-account"));
  await page.goto("/activities");
  await expect(page.getByRole("link", { name: "Connect with Strava", exact: true })).toBeVisible();
  await expect(page.locator('a[href="/activities/refresh-run"]')).toHaveCount(0);
});

test("automatic history import survives navigation and scheduled updates reuse stored streams", async ({ page }) => {
  test.setTimeout(180_000);
  await control({ paused: true, failDelivery: false });
  await fetch("http://127.0.0.1:3102/__control", { method: "POST", body: JSON.stringify({ history: true, rate: false, delay: 0 }) });
  const email = uniqueEmail("background");
  try {
    await page.goto("/planner");
    await signIn(page, email);
    await page.waitForLoadState("networkidle");
    await page.context().addCookies([{ name: "strava_e2e_athlete", value: "8801", url: "http://127.0.0.1:3102" }]);
    let releaseSession = () => {};
    let sessionRequested = () => {};
    const sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
    const sessionStarted = new Promise<void>((resolve) => { sessionRequested = resolve; });
    await page.route(/\/api\/auth\/session(?:\?|$)/, async (route) => {
      sessionRequested();
      await sessionGate;
      await route.continue();
    });
    await page.goto("/strava/consent");
    const consent = page.getByRole("checkbox");
    try {
      await sessionStarted;
      await expect(consent).toBeDisabled();
      await expect(page.getByRole("button", { name: "Authorize import", exact: true })).toBeDisabled();
    } finally { releaseSession(); }
    await expect(consent).toBeEnabled();
    await consent.check();
    await expect(consent).toBeChecked();
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    await expect(consent).toBeChecked();
    await page.getByRole("button", { name: "Authorize import", exact: true }).click();
    await page.waitForURL(/\/activities\?strava=connected/);
    const status = async () => (await (await page.request.get("/api/strava/sync")).json()).job;
    await expect.poll(async () => (await status())?.status).toBe("queued");
    expect((await page.request.post("/api/strava/sync", { data: {}, headers: { Origin: APP_URL } })).status()).toBe(405);
    expect((await page.request.delete("/api/strava/sync", { headers: { Origin: APP_URL } })).status()).toBe(405);
    await expect(page.getByRole("button", { name: /Synchronize Strava|Stop/ })).toHaveCount(0);
    const empty = await page.request.get("/api/strava/activities?view=year&year=2024");
    expect(empty.status()).toBe(200);
    expect((await empty.json()).activities).toEqual([]);
    await page.goto("/planner");
    await control({ paused: false });
    await expect.poll(async () => Number((await sql(`SELECT count(*) n FROM "StravaActivity" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email])).rows[0].n)).toBeGreaterThan(0);
    await page.reload();
    await expect.poll(async () => (await status()).status, { timeout: 90_000 }).toBe("completed");
    const imported = await page.request.get("/api/strava/activities?view=year&year=2024");
    expect((await imported.json()).activities).toHaveLength(1);
    const coverage = (await sql(`SELECT "syncHistory" FROM "StravaConnection" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email])).rows[0].syncHistory;
    expect(coverage.some((range: { start: string; end: string }) => range.start <= "2024-01-01" && range.end >= "2025-01-01")).toBe(true);
    const elevation = (await sql(`SELECT "elevationGainMeters", streams, "elevationStreamState"
      FROM "StravaActivity" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1) AND "localDate"<'2025-01-01'`, [email])).rows[0];
    expect(elevation.elevationGainMeters).toBe(80);
    expect(elevation.streams.altitude).toEqual([-5, 0, 4, null, 2]);
    expect(elevation.elevationStreamState).toBe("ready");
    // Simulate a pre-elevation installation, without aging lastSyncedAt or losing existing HR samples.
    await sql(`UPDATE "StravaActivity" SET "elevationGainMeters"=NULL,
      streams=streams - 'altitude', "elevationStreamState"='pending'
      WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
    // This regression isolates elevation catch-up. All-sport version catch-up is
    // exercised independently in strava.spec.ts.
    await sql(`UPDATE "StravaConnection" SET "elevationVersion"=0,"sportsVersion"=1 WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
    const beforeBackfill = (await status()).id;
    expect((await fetch(`${delivery}/__schedule`, { method: "POST" })).ok).toBe(true);
    await expect.poll(async () => (await status()).id).not.toBe(beforeBackfill);
    await expect.poll(async () => (await status()).status, { timeout: 90_000 }).toBe("completed");
    const exported = await (await page.request.get("/api/account")).json();
    const restored = exported.stravaActivities.find((activity: { localDate: string }) => activity.localDate < "2025-01-01");
    expect(restored.elevationGainMeters).toBe(80);
    expect(restored.streams.altitude).toEqual([-5, 0, 4, null, 2]);
    expect(restored.streams.heartrate).toEqual(elevation.streams.heartrate);
    const backfilledId = (await status()).id;
    expect((await fetch(`${delivery}/__schedule`, { method: "POST" })).ok).toBe(true);
    expect((await status()).id).toBe(backfilledId);
    const calls = (await (await fetch("http://127.0.0.1:3102/__control")).json()).calls;
    const streamCount = calls.filter((call: { athlete: number; path: string }) => call.athlete === 8801 && call.path.endsWith("/streams")).length;
    await sql(`UPDATE "StravaConnection" SET "lastSyncedAt"=CURRENT_TIMESTAMP - INTERVAL '2 days' WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
    expect((await fetch(`${delivery}/__schedule`, { method: "POST" })).ok).toBe(true);
    await expect.poll(async () => (await status()).status, { timeout: 45_000 }).toBe("completed");
    const after = (await (await fetch("http://127.0.0.1:3102/__control")).json()).calls;
    expect(after.filter((call: { athlete: number; path: string }) => call.athlete === 8801 && call.path.endsWith("/streams"))).toHaveLength(streamCount);
    const events = (await (await fetch(`${delivery}/__control`)).json()).events;
    for (const event of events) expect(Object.keys(event.data).sort()).toEqual(["jobId", "version"]);
    expect(JSON.stringify(events)).not.toContain(email);
    expect(JSON.stringify(events)).not.toContain("synthetic-access");
    await control({ paused: true });
    await sql(`UPDATE "StravaConnection" SET "lastSyncedAt"=CURRENT_TIMESTAMP - INTERVAL '2 days' WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
    expect((await fetch(`${delivery}/__schedule`, { method: "POST" })).ok).toBe(true);
    await expect.poll(async () => (await status()).status).toBe("queued");
    expect((await page.request.post("/api/strava/disconnect", { headers: { Origin: APP_URL } })).status()).toBe(200);
    await control({ paused: false });
    await expect.poll(async () => (await (await fetch(`${delivery}/__control`)).json()).pending.length).toBe(0);
    expect((await sql('SELECT count(*) n FROM "StravaSyncJob" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)', [email])).rows[0].n).toBe("0");
  } finally { await control({ paused: false, failDelivery: false }); }
});
