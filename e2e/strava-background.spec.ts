import { expect, test } from "@playwright/test";
import pg from "pg";
import { APP_URL, DATABASE_URL } from "./env";
import { signIn, uniqueEmail } from "./helpers";

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
    await sql(`UPDATE "StravaConnection" SET "elevationVersion"=0 WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
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
