import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DATABASE_URL } from "./env";
import { signIn, uniqueEmail } from "./helpers";
import { STRAVA_CONSENT_VERSION } from "../src/features/strava/types";

// Seeded directly (no OAuth/import), so the HRmax setting can be checked in well under a minute.
async function query(sql: string, params: unknown[]) {
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try { return await client.query(sql, params); } finally { await client.end(); }
}

async function storedMaxHr(email: string): Promise<unknown> {
  const { rows } = await query(`SELECT "maxHr" FROM "RunningAnalyticsSettings"
    WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)`, [email]);
  return rows[0]?.maxHr ?? null;
}

async function editMaxHr(page: Page, setting: Locator, value: string) {
  await setting.getByRole("button", { name: "Edit maximum heart rate" }).click();
  await setting.getByLabel("Maximum heart rate (bpm)").fill(value);
  await setting.getByRole("button", { name: "Save" }).click();
  await expect(setting.getByRole("status")).toHaveText("Maximum heart rate saved. Zones were updated.");
}

test("HRmax: activity chart and activities page edit/reset it and every zone and threshold total follows", async ({ page }) => {
  const email = uniqueEmail("max-hr");
  await signIn(page, email);
  const id = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  // 10 minutes at a constant 175 bpm: above threshold (>90%) with HRmax 190 (171), not with 200 (180).
  const time = Array.from({ length: 121 }, (_, i) => i * 5);
  const stream = { time, distance: time.map((t) => t * 3), heartrate: time.map(() => 175),
    velocity_smooth: time.map(() => 3), altitude: time.map(() => 10) };
  await query(`INSERT INTO "StravaConnection"
    ("userId","athleteKey",tokens,"consentVersion","consentAt","updatedAt","syncBefore","syncActive","lastSyncedAt",generation)
    SELECT id,$2,'unused-synthetic-fixture',$3,NOW(),NOW(),0,false,NOW(),$2 FROM "User" WHERE email=$1`,
  [email, id, STRAVA_CONSENT_VERSION]);
  await query(`INSERT INTO "StravaActivity"
    (id,"userId","sourceId",name,sport,"startedAt","localDate","distanceMeters","movingSeconds","elapsedSeconds","averageHr",streams,"streamState","updatedAt")
    SELECT $2,id,$2,'HRmax fixture','Run',NOW(),$3,1800,600,600,175,$4::jsonb,'ready',NOW()
    FROM "User" WHERE email=$1`, [email, id, today, JSON.stringify(stream)]);

  // Activity detail: line, zones, validation, keyboard and API checks.
  await page.goto(`/activities/${id}`);
  const hrTrack = page.locator("[data-activity-chart]").filter({ visible: true }).locator('[data-chart-track="hr"]');
  const detailSetting = hrTrack.locator("[data-max-hr-setting]");
  await expect(detailSetting.locator("[data-max-hr]")).toHaveText("HRmax: 190 bpm");
  await expect(detailSetting.locator("[data-max-hr-source]")).toHaveText("Default");
  await expect(hrTrack.locator('[data-max-hr-line="190"]')).toContainText("HRmax 190");
  await expect(page.locator('[data-zone-button="5"]')).toContainText("(171.0–≤240.0 bpm)");
  await expect(detailSetting.getByRole("button", { name: /Reset to default/ })).toHaveCount(0);
  const origin = { Origin: new URL(page.url()).origin };
  expect((await page.request.put("/api/strava/settings", { data: { maxHr: 200 } })).status()).toBe(403);
  expect((await page.request.put("/api/strava/settings", { data: { maxHr: 59 }, headers: origin })).status()).toBe(400);
  expect((await page.request.put("/api/strava/settings", { data: { maxHr: 200, zoneBounds: [] }, headers: origin })).status()).toBe(400);
  const edit = detailSetting.getByRole("button", { name: "Edit maximum heart rate" });
  const input = detailSetting.getByLabel("Maximum heart rate (bpm)");
  await edit.click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("190");
  await page.keyboard.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(edit).toBeFocused();
  await edit.click();
  await input.fill("300");
  await detailSetting.getByRole("button", { name: "Save" }).click();
  await expect(detailSetting.getByRole("alert")).toHaveText("Enter a whole number between 60 and 240.");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("200");
  await input.press("Enter");
  await expect(detailSetting.getByRole("status")).toHaveText("Maximum heart rate saved. Zones were updated.");
  await expect(detailSetting.locator("[data-max-hr]")).toHaveText("HRmax: 200 bpm");
  await expect(detailSetting.locator("[data-max-hr-source]")).toHaveText("Custom");
  await expect(hrTrack.locator('[data-max-hr-line="200"]')).toContainText("HRmax 200");
  await expect(page.locator('[data-zone-button="5"]')).toContainText("(180.0–≤240.0 bpm)");
  await expect(edit).toBeFocused();
  expect(await storedMaxHr(email)).toBe(200);
  await page.reload();
  await expect(detailSetting.locator("[data-max-hr]")).toHaveText("HRmax: 200 bpm");

  // Activities page: the threshold card edits the same value; weekly summaries follow without a reload.
  await page.goto(`/activities?month=${month}`);
  const thresholdCard = page.locator("[data-threshold-card]");
  const setting = thresholdCard.locator("[data-max-hr-setting]");
  const week = page.locator("aside").filter({ has: page.locator("[data-week-runs]", { hasText: "1" }) });
  const weekAbove = week.locator("[data-week-above]");
  await expect(page.getByText("HRMax: 200 bpm", { exact: true })).toBeVisible();
  await expect(setting.locator("[data-max-hr]")).toHaveText("HRmax: 200 bpm");
  await expect(setting.locator("[data-max-hr-source]")).toHaveText("Custom");
  await expect(weekAbove).toHaveText("0 min · 0.0%");
  await expect(thresholdCard).toContainText("0 h 0 min (0.0%)");
  // The zone-time chart uses the calendar's zone colors, in both themes.
  const zoneColorsMatch = async () => {
    for (let zone = 1; zone <= 5; zone++) {
      const chart = await page.locator(`[data-zone-chart] [data-zone-fill="${zone}"]`).evaluate((node) => getComputedStyle(node).backgroundColor);
      const calendar = await page.locator(`[data-zone-bar="${zone}"]`).first().evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(chart, `Z${zone}`).toBe(calendar);
    }
  };
  await zoneColorsMatch();
  await expect(page.locator('[data-zone-chart] [data-zone-fill="4"]')).toHaveAttribute("style", /width: 100%/);
  await page.evaluate(() => localStorage.setItem("run-week-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await zoneColorsMatch();
  expect(await page.locator('[data-zone-chart] [data-zone-fill="2"]').evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(102, 128, 107)");
  await page.evaluate(() => localStorage.setItem("run-week-theme", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await editMaxHr(page, setting, "190");
  await expect(setting.locator("[data-max-hr]")).toHaveText("HRmax: 190 bpm");
  await expect(page.getByText("HRMax: 190 bpm", { exact: true })).toBeVisible();
  await expect(weekAbove).toHaveText("10 min · 100.0%");
  await expect(thresholdCard).toContainText("0 h 10 min (100.0%)");
  await week.getByRole("button").hover();
  await expect(week.getByRole("tooltip").locator('[data-zone-percent="5"]')).toContainText("10 min · 100.0%");
  expect(await storedMaxHr(email)).toBe(190);

  await setting.getByRole("button", { name: "Reset to default (190 bpm)" }).click();
  await expect(setting.getByRole("status")).toHaveText("Default maximum heart rate restored.");
  await expect(setting.locator("[data-max-hr-source]")).toHaveText("Default");
  await expect(weekAbove).toHaveText("10 min · 100.0%");
  expect(await storedMaxHr(email)).toBeNull();

  await editMaxHr(page, setting, "200");
  await expect(weekAbove).toHaveText("0 min · 0.0%");
  await expect(week.getByRole("tooltip")).toHaveCount(0);
  await week.getByRole("button").hover();
  await expect(week.getByRole("tooltip").locator('[data-zone-percent="4"]')).toContainText("10 min · 100.0%");
  await page.reload();
  await expect(weekAbove).toHaveText("0 min · 0.0%");

  // The activity detail reflects the change made on the activities page; restore the default there.
  await page.goto(`/activities/${id}`);
  await expect(detailSetting.locator("[data-max-hr]")).toHaveText("HRmax: 200 bpm");
  await detailSetting.getByRole("button", { name: "Reset to default (190 bpm)" }).click();
  await expect(detailSetting.getByRole("status")).toHaveText("Default maximum heart rate restored.");
  await expect(detailSetting.locator("[data-max-hr]")).toHaveText("HRmax: 190 bpm");
  await expect(page.locator('[data-zone-button="5"]')).toContainText("(171.0–≤240.0 bpm)");
  expect(await storedMaxHr(email)).toBeNull();
  // Going back must not show weekly totals computed with the previous HRmax.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/activities\\?month=${month}$`));
  await expect(setting.locator("[data-max-hr]")).toHaveText("HRmax: 190 bpm");
  await expect(weekAbove).toHaveText("10 min · 100.0%");
  // Client-side navigation from the calendar to the detail and back follows the same rule.
  await week.locator("..").locator(`a[href="/activities/${id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/activities/${id}$`));
  await editMaxHr(page, detailSetting, "200");
  await page.goBack();
  await expect(setting.locator("[data-max-hr]")).toHaveText("HRmax: 200 bpm");
  await expect(weekAbove).toHaveText("0 min · 0.0%");
  // And the other way round: a change made on the activities page reaches the kept-alive activity page.
  await setting.getByRole("button", { name: "Reset to default (190 bpm)" }).click();
  await expect(weekAbove).toHaveText("10 min · 100.0%");
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/activities/${id}$`));
  await expect(detailSetting.locator("[data-max-hr]")).toHaveText("HRmax: 190 bpm");
  await expect(hrTrack.locator('[data-max-hr-line="190"]')).toContainText("HRmax 190");
  await expect(page.locator('[data-zone-button="5"]')).toContainText("(171.0–≤240.0 bpm)");
});
