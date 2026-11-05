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
    await page.context().addCookies([{ name: "strava_e2e_athlete", value: "8801", url: "http://127.0.0.1:3102" }]);
    await page.goto("/strava/consent");
    await page.getByRole("checkbox").check();
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
