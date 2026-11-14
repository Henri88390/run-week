import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DATABASE_URL } from "./env";
import { signIn, uniqueEmail } from "./helpers";
import { STRAVA_CONSENT_VERSION } from "../src/features/strava/types";
import { ACTIVITY_SUMMARY_MESSAGES } from "../src/features/strava/activity-summary-messages";
import { LOCALES } from "../src/features/i18n/locales";
import { STRAVA_MESSAGES } from "../src/features/strava/messages";

test("activity disclosures preserve chart and selection state on desktop and mobile", async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("activity-disclosures");
  await signIn(page, email);
  const id = randomUUID();
  const stream = {
    time: [0, 5, 10, 15, 20, 25, 30],
    distance: [0, 250, 500, 750, 1000, 1250, 1500],
    heartrate: [150, 150, 150, 150, 150, 150, 150],
    velocity_smooth: Array(7).fill(4), altitude: [10, 11, 12, 13, 14, 15, 16],
  };
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try {
    await client.query(`INSERT INTO "StravaConnection"
      ("userId","athleteKey",tokens,"consentVersion","consentAt","updatedAt","syncBefore","syncActive","lastSyncedAt",generation)
      SELECT id,$2,'unused-synthetic-fixture',$3,NOW(),NOW(),0,false,NOW(),$2 FROM "User" WHERE email=$1`,
    [email, id, STRAVA_CONSENT_VERSION]);
    await client.query(`INSERT INTO "StravaActivity"
      (id,"userId","sourceId",name,sport,"startedAt","localDate","distanceMeters","movingSeconds","elapsedSeconds",streams,"streamState","updatedAt")
      SELECT $2,id,$2,'Disclosure fixture','Run',NOW(),'2026-11-01',1500,30,30,$3::jsonb,'ready',NOW()
      FROM "User" WHERE email=$1`, [email, id, JSON.stringify(stream)]);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/activities/${id}`);
    await page.waitForLoadState("networkidle");
    const summary = page.locator("details").filter({ has: page.locator("[data-activity-summary]") }).first();
    const chartPanel = page.locator("[data-chart-panel]");
    const chart = page.locator("[data-activity-chart]");
    const heading = page.getByRole("heading", { name: "Disclosure fixture" });
    const effort = page.locator("[data-activity-effort]");
    const effortCheckbox = effort.getByRole("checkbox");
    const dateRow = page.locator("[data-activity-date-row]");
    const sourceLink = dateRow.getByRole("link");
    await expect(sourceLink).toHaveCount(1);
    await expect(page.getByRole("link", { name: "View on Strava" })).toHaveCount(1);
    const splits = page.locator("[data-kilometre-splits]");
    const zones = page.locator("[data-activity-zones]");
    const tracks = ["pace", "hr", "altitude"].map((metric) => chart.locator(`[data-chart-track="${metric}"]`));
    const split = splits.getByRole("button", { name: "Split 1", exact: true });
    const zone = zones.locator('[data-zone-button="2"]');
    const details = [summary, chartPanel, splits, zones, ...tracks];
    for (const item of details) await expect(item).toHaveAttribute("open", "");
    await split.click();
    await zone.click();
    await page.getByRole("button", { name: "Distance", exact: true }).click();
    await chart.focus();
    await page.keyboard.press("End");
    const readout = await chart.locator("[data-chart-readout]").textContent();
    expect(readout).not.toBeNull();

    for (const width of [1280, 390]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await expect(effortCheckbox).toBeVisible();
      await expect(effort.getByRole("button")).toBeVisible();
      const headingBox = await heading.boundingBox();
      const effortBox = await effort.boundingBox();
      const dateBox = await dateRow.locator("time").boundingBox();
      const sourceBox = await sourceLink.boundingBox();
      const dateRowBox = await dateRow.boundingBox();
      expect(headingBox).not.toBeNull();
      expect(effortBox).not.toBeNull();
      expect(dateBox).not.toBeNull();
      expect(sourceBox).not.toBeNull();
      expect(dateRowBox).not.toBeNull();
      if (headingBox && effortBox && dateBox && sourceBox && dateRowBox) {
        expect(Math.abs(effortBox.y - headingBox.y)).toBeLessThan(2);
        expect(effortBox.x).toBeGreaterThan(headingBox.x);
        expect(Math.abs(sourceBox.y - dateBox.y)).toBeLessThan(2);
        expect(sourceBox.x).toBeGreaterThanOrEqual(dateBox.x + dateBox.width);
        expect(sourceBox.x + sourceBox.width).toBeCloseTo(dateRowBox.x + dateRowBox.width, 0);
      }
      // Close every independent section, including all tracks, with native keyboard controls.
      for (const item of [summary, splits, zones, ...tracks, chartPanel]) {
        const control = item.locator(":scope > summary");
        await control.focus();
        await expect(control).toBeFocused();
        expect(await control.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
        await page.keyboard.press("Space");
        await expect(item).not.toHaveAttribute("open", "");
      }
      await expect(page.locator("[data-activity-summary]")).toBeHidden();
      await expect(chart).toBeHidden();
      await expect(split).toBeHidden();
      await expect(zone).toBeHidden();
      await expect(heading).toBeVisible();
      await expect(effortCheckbox).toBeVisible();
      await expect(sourceLink).toBeVisible();
      for (const item of [summary, chartPanel, ...tracks, splits, zones]) {
        const control = item.locator(":scope > summary");
        await control.focus();
        await page.keyboard.press("Enter");
        await expect(item).toHaveAttribute("open", "");
      }
      await expect(split).toHaveAttribute("aria-pressed", "true");
      await expect(zone).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("button", { name: "Distance", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(chart.locator("[data-chart-readout]")).toHaveText(readout ?? "");
      await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(3);
      await expect(chart.locator('[data-split-highlight="1"]')).toHaveCount(3);
      for (const track of tracks) {
        await expect.poll(async () => track.locator("svg.recharts-surface").evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(100);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    // The title-row control retains its pending and failed-save feedback.
    await page.route(`**/api/strava/activities/${id}`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({ status: 500, body: "{}" });
    });
    await effortCheckbox.check({ noWaitAfter: true });
    await expect(effortCheckbox).toBeDisabled();
    await expect(effortCheckbox).toBeEnabled();
    await expect(effortCheckbox).not.toBeChecked();
    await expect(effort.getByText(STRAVA_MESSAGES.en.error)).toBeVisible();
    await page.unroute(`**/api/strava/activities/${id}`);
    for (const locale of LOCALES) {
      await page.evaluate((value) => localStorage.setItem("run-week-locale", value), locale);
      await page.reload();
      await expect(summary.locator(":scope > summary")).toContainText(ACTIVITY_SUMMARY_MESSAGES[locale]);
      await expect(dateRow.getByRole("link")).toHaveText(STRAVA_MESSAGES[locale].source);
      for (const item of details) await expect(item).toHaveAttribute("open", "");
    }
    expect(errors).toEqual([]);
  } finally {
    await client.end();
  }
});
