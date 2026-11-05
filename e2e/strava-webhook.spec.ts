import { expect, test } from "@playwright/test";
import pg from "pg";
import { DATABASE_URL } from "./env";
import { signIn, uniqueEmail } from "./helpers";

const provider = "http://127.0.0.1:3102";
const delivery = "http://127.0.0.1:3103";
async function sql(text: string, values: unknown[] = []) {
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try { return await client.query(text, values); }
  finally { await client.end(); }
}
async function control(origin: string, values: Record<string, unknown>) {
  expect((await fetch(`${origin}/__control`, { method: "POST", body: JSON.stringify(values) })).ok).toBe(true);
}

test("public webhooks durably drive targeted updates, browser refresh, deletion and verified revocation", async ({ page, request }) => {
  test.setTimeout(300_000);
  const athlete = 8991;
  const sourceId = athlete * 100 + 95;
  const email = uniqueEmail("webhooks");
  await control(delivery, { paused: true, failDelivery: false });
  await control(provider, { details: {}, revoked: [], rate: false, delay: 0, tokenDelay: 0, detailDelay: 0, streamVersion: 0 });
  let eventTime = Math.floor(Date.now() / 1000);
  const event = (changes: Record<string, unknown> = {}) => ({
    subscription_id: 12345, owner_id: athlete, object_id: sourceId,
    object_type: "activity", aspect_type: "create", event_time: ++eventTime, updates: {}, ...changes,
  });
  const notify = async (data: Record<string, unknown>) => {
    // This request has no browser session or same-origin cookies.
    const response = await request.post("/api/strava/webhook", { data, headers: { Origin: "https://strava.example" } });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    return response;
  };
  const activityRows = async () => (await sql(`SELECT * FROM "StravaActivity" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email])).rows;
  const targetJob = async () => (await sql(`SELECT * FROM "StravaSyncJob" WHERE "sourceId"=$1
    AND "userId"=(SELECT id FROM "User" WHERE email=$2)`, [String(sourceId), email])).rows[0];
  const completed = async () => expect.poll(async () => (await targetJob())?.status, { timeout: 30_000 }).toBe("completed");
  try {
    const handshake = await request.get("/api/strava/webhook", { params: {
      "hub.mode": "subscribe", "hub.challenge": "synthetic-challenge",
      "hub.verify_token": "e2e-webhook-verify-secret-0123456789",
    } });
    expect(handshake.status()).toBe(200);
    expect(await handshake.json()).toEqual({ "hub.challenge": "synthetic-challenge" });
    expect((await request.get("/api/strava/webhook?hub.mode=subscribe&hub.challenge=abc&hub.verify_token=wrong")).status()).toBe(403);
    expect((await request.post("/api/strava/webhook", { data: event({ subscription_id: 9 }) })).status()).toBe(403);
    expect((await request.post("/api/strava/webhook", { data: "x".repeat(8193), headers: { "Content-Type": "application/json" } })).status()).toBe(413);
    expect((await request.post("/api/strava/webhook", { data: event({ owner_id: 0 }) })).status()).toBe(400);

    await page.goto("/planner");
    await signIn(page, email);
    await page.context().addCookies([{ name: "strava_e2e_athlete", value: String(athlete), url: provider }]);
    await page.goto("/strava/consent");
    await expect(page.getByRole("main").getByText("Strava notifications queue automatic, verified activity updates.", { exact: false })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const consent = page.getByRole("checkbox");
    await expect(consent).toBeEnabled();
    await consent.focus();
    await page.keyboard.press("Space");
    await expect(consent).toBeChecked();
    await page.getByRole("button", { name: "Authorize import", exact: true }).click();
    await page.waitForURL(/\/activities\?strava=connected/);
    // Keep history active to verify targeted jobs can coexist under the DB indexes.
    await sql(`UPDATE "StravaConnection" SET "syncActive"=false, "lastSyncedAt"=CURRENT_TIMESTAMP, "elevationVersion"=1
      WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
    eventTime = Math.floor(Date.now() / 1000);
    await page.goto("/activities");
    await page.waitForLoadState("networkidle");
    const baseline = (await (await page.request.get("/api/strava/sync")).json()).revision;
    const created = event();
    const callsBefore = (await (await fetch(`${provider}/__control`)).json()).calls.length;
    await notify(created);
    expect((await targetJob()).status).toBe("queued");
    expect(await activityRows()).toHaveLength(0);
    expect((await (await fetch(`${provider}/__control`)).json()).calls).toHaveLength(callsBefore);
    const pending = await (await page.request.get("/api/strava/sync")).json();
    expect(pending.job.status).toBe("queued");
    expect(pending.revision).not.toBe(baseline);
    const version = (await targetJob()).version;
    await notify(created);
    expect((await targetJob()).version).toBe(version);
    expect((await sql(`SELECT count(*) n FROM "StravaSyncJob" WHERE status='queued'
      AND "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email])).rows[0].n).toBe("2");
    // Full-history import is covered separately; only targeted work should fetch here.
    await sql(`UPDATE "StravaSyncJob" SET status='completed'
      WHERE kind IN ('history','incremental','elevation') AND "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
    await control(delivery, { paused: false });
    await completed();
    expect(await activityRows()).toHaveLength(1);
    const row = (await activityRows())[0];
    const calendarLink = page.locator(`a[href="/activities/${row.id}"]`);
    await expect(calendarLink).toBeVisible({ timeout: 75_000 });
    await calendarLink.click();
    await expect(page.getByRole("heading", { name: "Webhook run", exact: true })).toBeVisible();
    expect(row.streams.velocity_smooth[0]).toBe(3);
    await sql(`UPDATE "StravaActivity" SET "maximalEffort"=true WHERE id=$1`, [row.id]);
    await control(provider, { details: { [sourceId]: { name: "Webhook edited run", distance: 6200 } }, streamVersion: 1 });
    const edit = event({ aspect_type: "update", updates: { title: "Do not trust this title" } });
    await notify(edit);
    await completed();
    const edited = (await activityRows())[0];
    expect(edited.id).toBe(row.id);
    expect(edited.maximalEffort).toBe(true);
    expect(edited.distanceMeters).toBe(6200);
    expect(edited.streams.velocity_smooth[0]).toBe(4);
    await expect(page.getByRole("heading", { name: "Webhook edited run", exact: true })).toBeVisible({ timeout: 75_000 });
    await page.goto("/activities");
    await page.waitForLoadState("networkidle");
    await notify(created); // delayed/out-of-order notification is ignored
    expect((await targetJob()).webhookEventTime).toBe(edit.event_time);
    await notify(event({ aspect_type: "delete" })); // unsigned forged delete is only a hint
    await completed();
    expect(await activityRows()).toHaveLength(1);
    await control(provider, { details: { [sourceId]: { sport_type: "Ride", type: "Ride" } } });
    await notify(event({ aspect_type: "update", updates: { type: "Ride" } }));
    await completed();
    expect(await activityRows()).toHaveLength(0);
    expect((await targetJob()).webhookDeleted).toBe(true);
    await expect(calendarLink).toHaveCount(0, { timeout: 75_000 });
    await control(provider, { details: {} });

    // Delivery outage: acknowledge after DB commit, then recover with existing outbox.
    await control(delivery, { paused: true, failDelivery: true });
    await notify(event({ aspect_type: "create" }));
    await expect.poll(async () => (await targetJob()).publishedAt).toBe(null);
    await control(delivery, { failDelivery: false });
    expect((await fetch(`${delivery}/__dispatch`, { method: "POST" })).ok).toBe(true);
    await control(delivery, { paused: false });
    await completed();
    expect(await activityRows()).toHaveLength(1);
    await control(provider, { details: { [sourceId]: { missing: true } } });
    await notify(event({ aspect_type: "delete" }));
    await completed();
    expect(await activityRows()).toHaveLength(0);
    const calls = (await (await fetch(`${provider}/__control`)).json()).calls.slice(callsBefore);
    expect(calls.some((call: { path: string }) => call.path.includes("/athlete/activities"))).toBe(false);

    await notify(event({ object_type: "athlete", object_id: athlete, aspect_type: "update", updates: { authorized: "false" } }));
    await expect.poll(async () => (await (await page.request.get("/api/strava/sync")).json()).job?.status).toBe("completed");
    expect((await (await page.request.get("/api/strava/status")).json()).connected).toBe(true);
    await control(provider, { revoked: [athlete] });
    await notify(event({ object_type: "athlete", object_id: athlete, aspect_type: "update", updates: { authorized: "false" } }));
    await expect.poll(async () => (await (await page.request.get("/api/strava/status")).json()).connected, { timeout: 30_000 }).toBe(false);
    expect((await sql(`SELECT count(*) n FROM "StravaSyncJob" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email])).rows[0].n).toBe("0");
    await notify(event());
    expect(await activityRows()).toHaveLength(0);
    expect((await (await page.request.get("/api/strava/sync")).json()).revision).toBe("none");
  } finally {
    await control(delivery, { paused: false, failDelivery: false });
    await control(provider, { details: {}, revoked: [], detailDelay: 0, streamVersion: 0, rate: false });
  }
});
