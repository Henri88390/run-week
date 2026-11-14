import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DATABASE_URL } from "./env";
import { signIn, uniqueEmail } from "./helpers";
import { STRAVA_CONSENT_VERSION } from "../src/features/strava/types";
import { ACTIVITY_CHART_MESSAGES } from "../src/features/strava/activity-chart-messages";
import { STRAVA_MESSAGES } from "../src/features/strava/messages";
import { LOCALES } from "../src/features/i18n/locales";
import type { ChartPoint } from "../src/features/strava/activity-chart-data";
import { STREAM_MESSAGES } from "../src/features/strava/stream-messages";
import { ACTIVITY_ZONES_MESSAGES } from "../src/features/strava/activity-zones-messages";

test.use({ hasTouch: true });

// Independent RGB oracle: equality between two unresolved/gray colors is not a palette check.
const EXPECTED_ZONE_RGB = {
  light: [[54, 133, 181], [102, 128, 107], [196, 162, 28], [200, 121, 60], [188, 96, 121]],
  dark: [[112, 172, 208], [135, 166, 140], [208, 185, 79], [215, 154, 101], [213, 138, 158]],
} as const;

test("zone selection: raw holds and distance mapping, combined kilometres, keyboard, themes and memoized geometry", async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("zone-selection");
  await signIn(page, email);
  const id = randomUUID();
  const stream = {
    time: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 80, 85, 90, 95],
    distance: [2.2, 100, 300, 500, 750, 1000, 1000, 1100, 1300, 1400, 1500, 1600, 2000, 2050, 2200, 2375.5],
    heartrate: [30, 132, 133, 152, 161.5, 171, 190, 200, 240, 240, null, 132, 132, 133, 133, 150],
    velocity_smooth: Array(16).fill(4), altitude: Array(16).fill(10),
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
      SELECT $2,id,$2,'Zone fixture','Run',NOW(),'2026-11-01',2375.5,70,95,$3::jsonb,'ready',NOW()
      FROM "User" WHERE email=$1`, [email, id, JSON.stringify(stream)]);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/activities/${id}`);
    await page.waitForLoadState("networkidle");
    const chart = page.locator("[data-activity-chart]").filter({ visible: true });
    const zones = page.locator("[data-activity-zones]");
    const button = (zone: number) => zones.locator(`[data-zone-button="${zone}"]`);
    const paths = chart.locator("[data-zone-highlight]");
    const split = page.locator("[data-kilometre-splits]").getByRole("button", { name: "Split 1", exact: true });
    const expectSpans = async (bounds: [number, number][], axis: "time" | "distance") => {
      const selectedCount = await zones.locator('[aria-pressed="true"]').count();
      await expect(paths).toHaveCount(bounds.length ? selectedCount * 2 : 0);
      await expect(chart.locator('[data-chart-track="hr"] [data-zone-highlight]')).toHaveCount(0);
      if (!bounds.length) return;
      // Inspect actual SVG geometry in plot coordinates, independent of implementation-derived intervals.
      const spans = await chart.locator('[data-chart-track="pace"], [data-chart-track="altitude"]').evaluateAll((tracks, domain) => tracks.map((track) => {
        const line = track.querySelector(".recharts-cartesian-grid-horizontal line");
        const left = Number(line?.getAttribute("x1")), right = Number(line?.getAttribute("x2"));
        const d = [...track.querySelectorAll("[data-zone-highlight]")].map((el) => el.getAttribute("d") ?? "").join("");
        return [...d.matchAll(/M([^,]+),[^H]+H([^V]+)/g)].map((match) => [
          domain[0] + (Number(match[1]) - left) / (right - left) * (domain[1] - domain[0]),
          domain[0] + (Number(match[2]) - left) / (right - left) * (domain[1] - domain[0]),
        ]).sort((a, b) => a[0] - b[0]);
      }), axis === "time" ? [0, 95] : [2.2, 2375.5]);
      expect(spans).toHaveLength(2);
      for (const track of spans) {
        expect(track).toHaveLength(bounds.length);
        for (let i = 0; i < bounds.length; i++) {
          expect(track[i][0]).toBeCloseTo(bounds[i][0], 5);
          expect(track[i][1]).toBeCloseTo(bounds[i][1], 5);
        }
      }
    };
    await expect(button(5)).toContainText("≥90%");
    await expect(button(5)).toContainText("0 min 25 sec");
    for (const width of [1280, 390]) for (const theme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await expectSpans([], "time");
      await page.evaluate(() => performance.clearMarks());
      const expectedColors = EXPECTED_ZONE_RGB[theme].map((rgb) => `rgb(${rgb.join(", ")})`);
      // Check the unselected rows too: opaque bars and row accents must already be colored.
      for (const zone of [1, 2, 3, 4, 5]) {
        await expect(zones.locator(`[data-zone-bar="${zone}"]`)).toHaveCSS("background-color", expectedColors[zone - 1]);
        await expect(button(zone)).toHaveCSS("border-inline-start-color", expectedColors[zone - 1]);
      }
      await button(1).focus();
      await page.keyboard.press("Space");
      await expect(button(1)).toHaveAttribute("aria-pressed", "true");
      expect(await button(1).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      const selectedStyle = await button(1).evaluate((el) => ({
        color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor,
      }));
      expect(selectedStyle.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(selectedStyle.color).not.toBe(selectedStyle.background);
      await expectSpans([[0, 10], [80, 85]], "time");
      const zoneWork = await page.evaluate(() => performance.getEntriesByType("mark")
        .filter((entry) => entry.name.startsWith("activity-chart:zone-path:")).map((entry) => entry.name));
      expect(zoneWork).toContain("activity-chart:zone-path:pace");
      expect(zoneWork).toContain("activity-chart:zone-path:altitude");
      expect(zoneWork).not.toContain("activity-chart:zone-path:hr");
      await expect(chart.locator('[data-zone-range="1"]')).toHaveAttribute("data-min", "30");
      await expect(chart.locator('[data-zone-range="1"]')).toHaveAttribute("data-max", "133");
      await page.keyboard.press("Tab");
      await expect(button(2)).toBeFocused();
      await page.keyboard.press("Enter");
      await expectSpans([[0, 10], [10, 15], [80, 85], [85, 95]], "time");
      await button(5).locator("span").first().tap();
      await expectSpans([[0, 10], [10, 15], [25, 50], [80, 85], [85, 95]], "time");
      await expect(chart.locator('[data-zone-range="5"]')).toHaveAttribute("data-max", "240");
      await button(3).click();
      await button(4).click();
      await expect(paths).toHaveCount(10);
      const colors: string[] = [];
      for (const zone of [1, 2, 3, 4, 5]) {
        const barColor = await zones.locator(`[data-zone-bar="${zone}"]`).evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(barColor).toBe(expectedColors[zone - 1]);
        const rgb = EXPECTED_ZONE_RGB[theme][zone - 1];
        expect((Math.max(...rgb) - Math.min(...rgb)) / Math.max(...rgb)).toBeGreaterThan(.15);
        colors.push(barColor);
        const range = chart.locator(`[data-zone-range="${zone}"]`);
        expect(await range.evaluate((el) => getComputedStyle(el).fill)).toBe(barColor);
        await expect(range).toHaveCSS("stroke", barColor);
        await expect(range).toHaveCSS("fill-opacity", "0.28");
        const verticals = chart.locator(`[data-zone-highlight="${zone}"]`);
        await expect(verticals).toHaveCount(2);
        expect(await verticals.evaluateAll((els) => els.map((el) => ({
          fill: getComputedStyle(el).fill, stroke: getComputedStyle(el).stroke,
        })))).toEqual(Array(2).fill({ fill: barColor, stroke: barColor }));
        expect(await button(zone).evaluate((el) => getComputedStyle(el).borderInlineStartColor)).toBe(barColor);
        // Resolve color-mix to actual sRGB pixels; assert the selected tint, not just nontransparent.
        const tint = await button(zone).evaluate((el) => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Missing color conversion context");
          ctx.fillStyle = getComputedStyle(el).backgroundColor;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        });
        const background = theme === "dark" ? [20, 18, 16] : [243, 242, 237];
        for (let channel = 0; channel < 3; channel++) {
          expect(Math.abs(tint[channel] - Math.round(rgb[channel] * .12 + background[channel] * .88))).toBeLessThanOrEqual(1);
        }
        await button(zone).hover();
        await expect(zones.locator(`[data-zone-bar="${zone}"]`)).toHaveCSS("background-color", barColor);
        await expect(range).toHaveCSS("fill", barColor);
        expect(await verticals.evaluateAll((els) => els.map((el) => getComputedStyle(el).fillOpacity)))
          .toEqual(["0.22", "0.22"]);
        // Keep readable theme foreground, rather than low-contrast zone-colored text.
        const contrast = await button(zone).evaluate((el) => {
          const style = getComputedStyle(el);
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Missing color conversion context");
          const luminance = (color: string) => {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => {
              const c = v / 255;
              return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
            });
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
          };
          const foreground = luminance(style.color), background = luminance(style.backgroundColor);
          return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
      expect(new Set(colors).size).toBe(5);
      expect(await chart.locator('[data-chart-track="hr"] .recharts-reference-area path')
        .evaluateAll((els) => els.map((el) => getComputedStyle(el).fill))).toEqual(expectedColors);
      // A filter on any ancestor can turn correct computed fills gray on screen.
      expect(await page.locator("[data-zone-bar], [data-zone-highlight], [data-zone-range]").evaluateAll((els) =>
        els.every((el) => {
          for (let node: Element | null = el; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.filter !== "none" || style.opacity !== "1" || style.mixBlendMode !== "normal") return false;
          }
          return true;
        }))).toBe(true);
      await test.info().attach(`zone-palette-${theme}-${width}`, {
        body: JSON.stringify({ theme, width, renderedRGB: colors }), contentType: "application/json",
      });
      const screenshotPath = test.info().outputPath(`zone-colors-${theme}-${width}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await test.info().attach(`zone-colors-${theme}-${width}`, {
        path: screenshotPath, contentType: "image/png",
      });
      await button(3).click();
      await button(4).click();
      await split.click();
      await expect(chart.locator("[data-split-highlight]")).toHaveCount(3);
      await expect(chart.locator('[data-chart-track="hr"] [data-split-highlight="1"]')).toHaveCount(1);
      await expect(chart.locator('[data-chart-track="hr"] [data-split-highlight="1"]')).toHaveAttribute("data-start", "0");
      await expect(chart.locator('[data-chart-track="hr"] [data-split-highlight="1"]')).toHaveAttribute("data-end", "25");
      await page.getByRole("button", { name: "Distance", exact: true }).click();
      await expectSpans([[2.2, 300], [300, 500], [1000, 1500], [2000, 2050], [2050, 2375.5]], "distance");
      await button(1).click();
      await expectSpans([[300, 500], [1000, 1500], [2050, 2375.5]], "distance");
      await expect(chart.locator("[data-split-highlight]")).toHaveCount(3);
      await chart.focus();
      await page.keyboard.press("Home");
      await page.waitForTimeout(200);
      const geometry = await paths.evaluateAll((els) => els.map((el) => el.getAttribute("d")));
      await page.evaluate(() => performance.clearMarks());
      for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
      expect(await paths.evaluateAll((els) => els.map((el) => el.getAttribute("d")))).toEqual(geometry);
      expect(await page.evaluate(() => performance.getEntriesByType("mark")
        .filter((entry) => entry.name.startsWith("activity-chart:")).map((entry) => entry.name))).toEqual([]);
      await page.getByRole("button", { name: "Elapsed time", exact: true }).click();
      await expectSpans([[10, 15], [25, 50], [85, 95]], "time");
      await button(2).click();
      await button(5).click();
      await expectSpans([], "time");
      await expect(chart.locator("[data-zone-range]")).toHaveCount(0);
      await expect(chart.locator("[data-split-highlight]")).toHaveCount(3);
      await split.click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    for (const locale of LOCALES) {
      await page.evaluate((value) => localStorage.setItem("run-week-locale", value), locale);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(zones.getByText(ACTIVITY_ZONES_MESSAGES[locale].selectionHelp, { exact: true })).toBeVisible();
      await button(5).focus();
      await page.keyboard.press("Space");
      await expect(button(5)).toHaveAttribute("aria-pressed", "true");
      await expectSpans([[25, 50]], "time");
    }
    // High-frequency disjoint raw holds create one SVG path, not thousands of DOM overlays.
    const many = Array.from({ length: 6001 }, (_, i) => i);
    await client.query('UPDATE "StravaActivity" SET streams=$2::jsonb,"elapsedSeconds"=6000 WHERE id=$1',
      [id, JSON.stringify({ time: many, distance: many.map((t) => t * 4),
        heartrate: many.map((t) => t % 2 ? 200 : 132), velocity_smooth: many.map(() => 4), altitude: many.map(() => 10) })]);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await button(5).click();
    await expect(paths).toHaveCount(2);
    await expect(chart.locator('[data-chart-track="hr"] [data-zone-highlight]')).toHaveCount(0);
    for (const metric of ["pace", "altitude"]) {
      await expect(chart.locator(`[data-chart-track="${metric}"] [data-zone-highlight="5"]`))
        .toHaveAttribute("data-interval-count", "3000");
    }
    await chart.focus();
    await page.keyboard.press("Home");
    await page.waitForTimeout(200);
    await page.evaluate(() => performance.clearMarks());
    const box = await chart.locator(".recharts-wrapper").first().boundingBox();
    if (!box) throw new Error("Missing chart plot");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width * .7, box.y + box.height / 2);
    await page.keyboard.press("ArrowRight");
    expect(await page.evaluate(() => performance.getEntriesByType("mark")
      .filter((entry) => entry.name.startsWith("activity-chart:")).map((entry) => entry.name))).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await client.query('DELETE FROM "User" WHERE email=$1', [email]);
    await client.end();
  }
});

test("kilometre selection: raw boundaries, stops, multiple toggles, mobile keyboard, themes and activity reset", async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("split-selection");
  await signIn(page, email);
  const id = randomUUID(), otherId = randomUUID();
  const stream = {
    time: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50.5, 55.5],
    distance: [0, 250, 500, 750, 1000, 1000, 1000, 1250, 1750, 2250, 2375.5, 2375.5],
    heartrate: Array(12).fill(160), velocity_smooth: Array(12).fill(4), altitude: Array(12).fill(10),
  };
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try {
    await client.query(`INSERT INTO "StravaConnection"
      ("userId","athleteKey",tokens,"consentVersion","consentAt","updatedAt","syncBefore","syncActive","lastSyncedAt",generation)
      SELECT id,$2,'unused-synthetic-fixture',$3,NOW(),NOW(),0,false,NOW(),$2 FROM "User" WHERE email=$1`,
    [email, id, STRAVA_CONSENT_VERSION]);
    for (const activityId of [id, otherId]) await client.query(`INSERT INTO "StravaActivity"
      (id,"userId","sourceId",name,sport,"startedAt","localDate","distanceMeters","movingSeconds","elapsedSeconds",streams,"streamState","updatedAt")
      SELECT $2,id,$2,'Split fixture','Run',NOW(),'2026-11-01',2375.5,40,55.5,$3::jsonb,'ready',NOW()
      FROM "User" WHERE email=$1`, [email, activityId, JSON.stringify(stream)]);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/activities/${id}`);
    await page.waitForLoadState("networkidle");
    const chart = page.locator("[data-activity-chart]").filter({ visible: true });
    const table = page.locator("[data-kilometre-splits]");
    const zones = page.locator("[data-activity-zones]");
    await expect(page.locator("[data-activity-summary]")).toContainText("0 min 56 sec");
    await expect(zones).toContainText("Z3 80–85%");
    await expect(zones).toContainText("0 min 56 sec");
    await expect(zones).toContainText("Unclassified or missing");
    const splitButton = (number: number) => table.getByRole("button", { name: `Split ${number}`, exact: true });
    const highlights = chart.locator("[data-split-highlight]");
    const expectIntervals = async (bounds: [number, number, number][]) => {
      await expect(highlights).toHaveCount(bounds.length * 3);
      expect(await chart.locator("[data-chart-track]").evaluateAll((tracks) => tracks.map((track) =>
        [...track.querySelectorAll("[data-split-highlight]")].map((rect) => [
          Number(rect.getAttribute("data-split-highlight")), Number(rect.getAttribute("data-start")), Number(rect.getAttribute("data-end")),
        ])))).toEqual([bounds, bounds, bounds]);
      for (const number of bounds.map(([number]) => number)) {
        const positions = await chart.locator(`[data-split-highlight="${number}"]`).evaluateAll((rects) =>
          rects.map((rect) => ({ x: rect.getBoundingClientRect().x, width: rect.getBoundingClientRect().width })));
        expect(Math.max(...positions.map((r) => r.x)) - Math.min(...positions.map((r) => r.x))).toBeLessThan(1);
        expect(Math.max(...positions.map((r) => r.width)) - Math.min(...positions.map((r) => r.width))).toBeLessThan(1);
        expect(positions.every((r) => r.width > 0)).toBe(true);
      }
    };
    await expect(table.locator("tbody tr")).toHaveCount(3);
    await expect(table.locator("tbody tr").first()).toContainText("0:20");
    await expect(table.locator("tbody tr").first()).not.toContainText("Unavailable");
    await expect(table.locator("tbody tr").last()).toContainText("0.376");
    for (const width of [1280, 390]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await expectIntervals([]);
      await splitButton(1).focus();
      await page.keyboard.press("Space");
      await expect(splitButton(1)).toHaveAttribute("aria-pressed", "true");
      await expect(table.locator('tr[data-selected="true"]')).toHaveCount(1);
      await expectIntervals([[1, 0, 20]]);
      const selectedStyle = await table.locator("tbody tr").first().evaluate((row) => ({
        color: getComputedStyle(row).color, background: getComputedStyle(row).backgroundColor,
      }));
      expect(selectedStyle.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(selectedStyle.color).not.toBe(selectedStyle.background);
      expect(await splitButton(1).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
      await page.keyboard.press("Tab");
      await expect(splitButton(2)).toBeFocused();
      await page.keyboard.press("Enter");
      await expectIntervals([[1, 0, 20], [2, 20, 42.5]]);
      await table.locator("tbody tr").nth(2).locator("td").first().tap();
      await expectIntervals([[1, 0, 20], [2, 20, 42.5], [3, 42.5, 55.5]]);
      await page.getByRole("button", { name: "Distance", exact: true }).click();
      await expectIntervals([[1, 0, 1000], [2, 1000, 2000], [3, 2000, 2375.5]]);
      await chart.focus();
      await page.keyboard.press("Home");
      await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(3);
      await table.locator("tbody tr").nth(1).locator("td").first().click();
      await expect(splitButton(2)).toHaveAttribute("aria-pressed", "false");
      await expectIntervals([[1, 0, 1000], [3, 2000, 2375.5]]);
      await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(3);
      await page.getByRole("button", { name: "Elapsed time", exact: true }).click();
      await expectIntervals([[1, 0, 20], [3, 42.5, 55.5]]);
      // Row selection and cursor movement must not trigger static chart work.
      await splitButton(1).scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.evaluate(() => performance.clearMarks());
      await splitButton(1).click();
      await splitButton(3).click();
      await expectIntervals([]);
      expect(await page.evaluate(() => performance.getEntriesByType("mark")
        .filter((entry) => entry.name.startsWith("activity-chart:")).map((entry) => entry.name))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    for (const locale of LOCALES) {
      await page.evaluate((value) => localStorage.setItem("run-week-locale", value), locale);
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(table.getByText(STREAM_MESSAGES[locale].selectionHelp, { exact: true })).toBeVisible();
      await expect(zones.getByText(ACTIVITY_ZONES_MESSAGES[locale].title, { exact: true })).toBeVisible();
      const button = table.getByRole("button", { name: `${STREAM_MESSAGES[locale].split} 1`, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expectIntervals([[1, 0, 20]]);
    }
    await page.evaluate(() => localStorage.setItem("run-week-locale", "en"));
    await page.goto(`/activities/${otherId}`);
    await expect(splitButton(1)).toHaveAttribute("aria-pressed", "false");
    await expectIntervals([]);
    // The graph may have pace measurements but no raw initial distance boundary.
    await client.query('UPDATE "StravaActivity" SET streams=$2::jsonb WHERE id=$1',
      [otherId, JSON.stringify({ ...stream, distance: [null, ...stream.distance.slice(1)] })]);
    await page.reload();
    await expect(chart.locator("[data-chart-track]")).toHaveCount(3);
    await expect(table.locator("tbody tr").first()).toContainText("Unavailable");
    await splitButton(1).click();
    await expect(splitButton(1)).toHaveAttribute("aria-pressed", "true");
    await expectIntervals([]); // No fabricated time boundary.
    await splitButton(2).click();
    await expectIntervals([[2, 20, 42.5]]);
    // Misaligned legacy/raw streams are not repaired with a guessed offset.
    await client.query('UPDATE "StravaActivity" SET streams=$2::jsonb WHERE id=$1',
      [otherId, JSON.stringify({ ...stream, distance: stream.distance.slice(1) })]);
    await page.reload();
    await expect(table.locator("tbody tr")).toHaveCount(0);
    await expect(chart.locator("[data-chart-track]")).toHaveCount(3);
    await expectIntervals([]);
    expect(errors).toEqual([]);
  } finally { await client.end(); }
});

test("synchronized activity charts: time/distance axes, readouts, gaps, keyboard, tap, themes and locales", async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("activity-charts");
  await signIn(page, email);
  const id = randomUUID();
  const stream = {
    time: [0, 5, 10, 15, 45, 50, 55.5], distance: [0, 20, 40, 40, 140, 160, 180],
    heartrate: [150, 160, null, 165, 175, 180, 180],
    velocity_smooth: [4, 4, 0, 4, 4, 4, 4], altitude: [-5, -3, null, 1, 2, 3, 4],
  };
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try {
    // Account-owned synthetic fixtures only. No OAuth, usable tokens or upstream requests.
    await client.query(`INSERT INTO "StravaConnection"
      ("userId","athleteKey",tokens,"consentVersion","consentAt","updatedAt","syncBefore","syncActive","lastSyncedAt",generation)
      SELECT id,$2,'unused-synthetic-fixture',$3,NOW(),NOW(),0,false,NOW(),$2 FROM "User" WHERE email=$1`,
    [email, id, STRAVA_CONSENT_VERSION]);
    await client.query(`INSERT INTO "StravaActivity"
      (id,"userId","sourceId",name,sport,"startedAt","localDate","distanceMeters","movingSeconds","elapsedSeconds",streams,"streamState","updatedAt")
      SELECT $2,id,'123456','Chart fixture','Run',NOW(),'2026-11-01',180,50,56,$3::jsonb,'ready',NOW()
      FROM "User" WHERE email=$1`, [email, id, JSON.stringify(stream)]);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/activities/${id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toBeVisible();
    const chart = page.locator("[data-activity-chart]").filter({ visible: true });
    const readout = chart.locator("[data-chart-readout]");
    const axisGroup = page.getByRole("group", { name: "Elapsed time / Distance", exact: true });
    const distanceButton = axisGroup.getByRole("button", { name: "Distance", exact: true });
    const timeButton = axisGroup.getByRole("button", { name: "Elapsed time", exact: true });
    const expectAxis = async (axis: "time" | "distance") => {
      expect(await chart.locator("[data-chart-track]").evaluateAll((tracks) =>
        tracks.map((track) => track.getAttribute("data-chart-axis")))).toEqual([axis, axis, axis]);
    };
    await expect(axisGroup).toBeVisible();
    await expect(timeButton).toHaveAttribute("aria-pressed", "true");
    await expect(timeButton).toHaveClass(/button-primary/);
    await expect(distanceButton).toHaveClass(/button-secondary/);
    await expect(page.locator("[data-chart-panel]").locator('input[type="checkbox"]')).toHaveCount(0);
    await timeButton.focus();
    await expect(timeButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(distanceButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(chart).toBeFocused();
    await expect(chart.locator('[tabindex="0"]')).toHaveCount(0); // Decorative SVGs add no hidden tab stops.
    for (const width of [1280, 390]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await expect(chart.locator("[data-chart-track]")).toHaveCount(3);
      await expectAxis("time");
      await expect(chart.locator(".recharts-area-area")).toHaveCount(3);
      await expect(chart.getByText("0 min 55.5 sec", { exact: true }).first()).toBeVisible();
      const timeTicks = await chart.locator("[data-chart-track]").evaluateAll((tracks) =>
        tracks.flatMap((track) => [...track.querySelectorAll(".recharts-cartesian-axis-tick-label")]
          .map((tick) => tick.textContent?.trim() ?? "").filter((value) => value.endsWith("min") || value.endsWith("sec"))));
      expect(timeTicks.every((value) => value === "0 min" || value === "0 min 55.5 sec")).toBe(true);
      expect(timeTicks).toContain("0 min 55.5 sec");
      const timeTickCoordinates = await chart.locator("[data-chart-track]").evaluateAll((tracks) =>
        tracks.map((track) => [...track.querySelectorAll(".recharts-cartesian-axis-tick-label")]
          .filter((tick) => /(?:min|sec)$/.test(tick.textContent?.trim() ?? ""))
          .map((tick) => tick.getAttribute("transform"))));
      expect(timeTickCoordinates[0]?.length).toBeGreaterThan(0);
      expect(timeTickCoordinates.every((coordinates) => JSON.stringify(coordinates) === JSON.stringify(timeTickCoordinates[0]))).toBe(true);
      await chart.focus();
      await page.keyboard.press("Home");
      expect(await chart.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
      await expect(readout).toContainText("-5.0 m");
      await expect(readout).toContainText("4:10 min/km");
      await expect(chart.locator('[data-chart-track="pace"] [data-chart-track-readout]')).toHaveText("4:10 min/km");
      await expect(chart.locator('[data-chart-track="hr"] [data-chart-track-readout]')).toHaveText("155 bpm");
      await expect(chart.locator('[data-chart-track="altitude"] [data-chart-track-readout]')).toHaveText("-5.0 m");
      await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(3);
      const positions = await chart.locator(".recharts-reference-line-line").evaluateAll((lines) =>
        lines.map((line) => line.getBoundingClientRect().x));
      expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(1);
      await distanceButton.click();
      await expect(distanceButton).toHaveAttribute("aria-pressed", "true");
      await expect(distanceButton).toHaveClass(/button-primary/);
      await expect(timeButton).toHaveClass(/button-secondary/);
      await expectAxis("distance");
      const distanceTicks = await chart.locator("[data-chart-track]").evaluateAll((tracks) =>
        tracks.flatMap((track) => [...track.querySelectorAll(".recharts-cartesian-axis-tick-label")]
          .map((tick) => tick.textContent?.trim() ?? "").filter((value) => value.endsWith("km"))));
      expect(distanceTicks.every((value) => /^\d+ km$/.test(value))).toBe(true);
      const axisTickCoordinates = await chart.locator("[data-chart-track]").evaluateAll((tracks) =>
        tracks.map((track) => [...track.querySelectorAll(".recharts-cartesian-axis-tick-label")]
          .filter((tick) => tick.textContent?.trim().endsWith("km"))
          .map((tick) => tick.getAttribute("transform"))));
      expect(axisTickCoordinates[0]?.length).toBeGreaterThan(0);
      expect(axisTickCoordinates.every((coordinates) => JSON.stringify(coordinates) === JSON.stringify(axisTickCoordinates[0]))).toBe(true);
      await chart.focus();
      await page.keyboard.press("Home");
      await expect(readout.locator("dd").nth(1)).toHaveText("0.00 km");
      const distancePositions = await chart.locator(".recharts-reference-line-line").evaluateAll((lines) =>
        lines.map((line) => line.getBoundingClientRect().x));
      expect(Math.max(...distancePositions) - Math.min(...distancePositions)).toBeLessThan(1);
      await page.keyboard.press("ArrowRight");
      await expect(readout.locator("dd").nth(0)).toContainText("5.0 sec");
      await expect(readout.locator("dd").nth(1)).toHaveText("0.02 km");
      await timeButton.click();
      await expect(timeButton).toHaveAttribute("aria-pressed", "true");
      await expect(timeButton).toHaveClass(/button-primary/);
      await expect(distanceButton).toHaveClass(/button-secondary/);
      await expectAxis("time");
      await chart.focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowRight");
      await expect(readout).toContainText("5.0 sec");
      await page.keyboard.press("ArrowRight");
      await expect(readout.locator("dd")).toHaveText(["0 min 10.0 sec", "0.04 km", "Unavailable", "Unavailable", "Unavailable"]);
      await expect(chart.locator("[data-chart-track-readout]")).toHaveText(["Unavailable", "Unavailable", "Unavailable"]);
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await expect(readout.locator("dd")).toHaveText(["0 min 30.0 sec", "Unavailable", "Unavailable", "Unavailable", "Unavailable"]);
      await page.keyboard.press("End");
      await expect(readout).toContainText("0.18 km");
      await expect(readout).toContainText("55.5 sec");
      await page.keyboard.press("Escape");
      await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(0);
      await expect(chart.locator("[data-chart-track-readout]")).toHaveText(["Unavailable", "Unavailable", "Unavailable"]);
      const track = chart.locator('[data-chart-track="hr"] .recharts-wrapper');
      await track.scrollIntoViewIfNeeded();
      const bounds = await track.boundingBox();
      if (!bounds) throw new Error("Missing chart bounds");
      await page.touchscreen.tap(bounds.x + bounds.width * .7, bounds.y + bounds.height * .5);
      await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(3);
      const tappedValues = await readout.locator("dd").allTextContents();
      await expect(chart.locator("[data-chart-track-readout]")).toHaveText(tappedValues.slice(2));
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await chart.screenshot({ path: test.info().outputPath(`activity-chart-${width}-${theme}.png`) });
    }
    // Hover also drives the same shared readout/cursor.
    await chart.locator('[data-chart-track="pace"] .recharts-wrapper').hover();
    await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(3);
    await expect(page.locator("[data-chart-panel]").locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(chart.locator("[data-chart-track]")).toHaveCount(3);
    for (const locale of LOCALES) {
      await page.evaluate((value) => {
        localStorage.setItem("run-week-locale", value);
        window.dispatchEvent(new StorageEvent("storage", { key: "run-week-locale" }));
      }, locale);
      await expect(page.getByText(ACTIVITY_CHART_MESSAGES[locale].help, { exact: true })).toBeVisible();
      await expect(page.getByText(ACTIVITY_CHART_MESSAGES[locale].zones, { exact: true })).toBeVisible();
      await expect(page.getByRole("group", { name: `${STRAVA_MESSAGES[locale].time} / ${STRAVA_MESSAGES[locale].distance}`, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: STRAVA_MESSAGES[locale].time, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: STRAVA_MESSAGES[locale].distance, exact: true })).toBeVisible();
      await chart.focus();
      await page.keyboard.press("Home");
      // Each localized track uses the same metric formatter as the global readout.
      const globalValues = await readout.locator("dd").allTextContents();
      await expect(chart.locator("[data-chart-track-readout]")).toHaveText(globalValues.slice(2));
      await page.keyboard.press("Escape");
      const unavailableValues = await readout.locator("dd").allTextContents();
      await expect(chart.locator("[data-chart-track-readout]")).toHaveText(unavailableValues.slice(2));
    }
    await page.evaluate(() => localStorage.setItem("run-week-locale", "en"));
    for (const distance of [null, [0, 20, null, 40, 140, 160, 180], [0, 20, 10, 40, 140, 160, 180]]) {
      await client.query('UPDATE "StravaActivity" SET streams=$2::jsonb WHERE id=$1',
        [id, JSON.stringify({ ...stream, distance })]);
      await page.reload();
      await expect(axisGroup).toHaveCount(0);
      await expect(chart.locator("[data-chart-track]")).toHaveCount(3);
      await expect(readout.locator("dd").nth(1)).toHaveText("Unavailable");
      await expectAxis("time");
    }
    await client.query('UPDATE "StravaActivity" SET streams=$2::jsonb WHERE id=$1',
      [id, JSON.stringify({ ...stream, altitude: null, heartrate: null, distance: null })]);
    await page.reload();
    await expect(chart.locator("[data-chart-track]")).toHaveCount(1);
    await expect(chart.locator('[data-chart-track="pace"]')).toBeVisible();
    await client.query('UPDATE "StravaActivity" SET streams=NULL WHERE id=$1', [id]);
    await page.reload();
    await expect(chart.locator("[data-chart-track]")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await client.end();
  }
});

test("activity chart selection keeps static chart work cached during rapid sweeps", async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail("chart-performance");
  await signIn(page, email);
  const id = randomUUID();
  const count = 3600;
  const points: ChartPoint[] = Array.from({ length: count }, (_, i) => ({
    time: i * 2, distance: i * 7, pace: 280 + 25 * Math.sin(i / 80),
    hr: i % 799 === 0 ? null : 155 + 15 * Math.sin(i / 120),
    altitude: i % 997 === 0 ? null : 25 + 20 * Math.sin(i / 200), gap: false,
  }));
  const stream = {
    time: points.map((p) => p.time), distance: points.map((p) => p.distance),
    heartrate: points.map((p) => p.hr), velocity_smooth: points.map((p) => 1000 / (p.pace ?? 280)),
    altitude: points.map((p) => p.altitude),
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
      SELECT $2,id,'654321','Performance fixture','Run',NOW(),'2026-11-01',25200,7200,7200,$3::jsonb,'ready',NOW()
      FROM "User" WHERE email=$1`, [email, id, JSON.stringify(stream)]);
    await page.setViewportSize({ width: 1280, height: 1200 });
    await page.goto(`/activities/${id}`);
    await page.waitForLoadState("networkidle");
    const chart = page.locator("[data-activity-chart]").filter({ visible: true });
    await expect(chart.locator(".recharts-area-area")).toHaveCount(3);
    const geometryBefore = await chart.locator(".recharts-area-curve").evaluateAll((paths) =>
      paths.map((path) => path.getAttribute("d")));
    expect(geometryBefore).toHaveLength(3);
    expect(geometryBefore.every((path) => path !== null && path.length > 0)).toBe(true);
    const evidence = [];
    for (const axis of ["time", "distance"] as const) {
      await page.getByRole("button", { name: axis === "time" ? "Elapsed time" : "Distance", exact: true }).click();
      const axisButton = page.getByRole("button", { name: axis === "time" ? "Elapsed time" : "Distance", exact: true });
      await expect(axisButton).toHaveAttribute("aria-pressed", "true");
      let endTimeLabel = "";
      if (axis === "time") {
        await chart.focus();
        await page.keyboard.press("End");
        endTimeLabel = (await chart.locator("[data-chart-readout] dd").first().textContent())?.trim() ?? "";
        expect(endTimeLabel).toMatch(/^\d+ min \d+\.\d sec$/);
        await expect(chart.getByText(endTimeLabel, { exact: true }).first()).toBeVisible();
        await page.keyboard.press("Escape");
      }
      const tickLabels = await chart.locator("[data-chart-track]").evaluateAll((tracks, axisMode) =>
        tracks.flatMap((track) => [...track.querySelectorAll(".recharts-cartesian-axis-tick-label")]
          .map((tick) => tick.textContent?.trim() ?? "").filter((value) =>
            axisMode === "time" ? value.endsWith("min") || value.endsWith("sec") : value.endsWith("km"))), axis);
      if (axis === "distance") {
        expect(tickLabels.every((value) => /^\d+ km$/.test(value))).toBe(true);
        const coordinates = await chart.locator("[data-chart-track]").evaluateAll((tracks) =>
          tracks.map((track) => [...track.querySelectorAll(".recharts-cartesian-axis-tick-label")]
            .filter((tick) => tick.textContent?.trim().endsWith("km"))
            .map((tick) => tick.getAttribute("transform"))));
        expect(coordinates[0]?.length).toBeGreaterThan(0);
        expect(coordinates.every((ticks) => JSON.stringify(ticks) === JSON.stringify(coordinates[0]))).toBe(true);
      } else {
        expect(tickLabels).toContain(endTimeLabel);
        expect(tickLabels.every((value) => value === endTimeLabel || /^\d+ min$/.test(value))).toBe(true);
        const coordinates = await chart.locator("[data-chart-track]").evaluateAll((tracks) =>
          tracks.map((track) => [...track.querySelectorAll(".recharts-cartesian-axis-tick-label")]
            .filter((tick) => /(?:min|sec)$/.test(tick.textContent?.trim() ?? ""))
            .map((tick) => tick.getAttribute("transform"))));
        expect(coordinates[0]?.length).toBeGreaterThan(0);
        expect(coordinates.every((ticks) => JSON.stringify(ticks) === JSON.stringify(coordinates[0]))).toBe(true);
      }
      for (const sweep of [1, 2]) {
        await chart.focus();
        await page.keyboard.press("Home");
        await expect(chart.locator(".recharts-reference-line-line")).toHaveCount(3);
        for (const metric of ["pace", "hr", "altitude"]) {
          const track = chart.locator(`[data-chart-track="${metric}"] .recharts-wrapper`);
          await track.scrollIntoViewIfNeeded();
          await track.hover();
          // Responsive layout must settle before clearing the development-only work marks.
          await page.waitForTimeout(200);
          const result = await track.evaluate(async (element) => {
            performance.clearMarks();
            const bounds = element.getBoundingClientRect();
            const latencies: number[] = [], frames: number[] = [];
            let lastEvent = 0, previousFrame = 0, updates = 0;
            const chartElement = element.closest("[data-activity-chart]");
            const readout = chartElement?.querySelector("[data-chart-readout]");
            if (!chartElement || !readout) throw new Error("Missing chart readout");
            const geometry = () => [...chartElement.querySelectorAll(".recharts-area-curve")]
              .map((path) => path.getAttribute("d"));
            const geometryAtStart = geometry();
            const observer = new MutationObserver(() => {
              if (lastEvent) { latencies.push(performance.now() - lastEvent); updates++; }
            });
            observer.observe(readout, { subtree: true, childList: true, characterData: true });
            for (let frame = 0; frame < 90; frame++) {
              const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
              if (previousFrame) frames.push(now - previousFrame);
              previousFrame = now;
              // Four events per display frame; alternating rapid sweeps through actual SVG hit testing.
              for (let step = 0; step < 4; step++) {
                const fraction = ((frame * 4 + step) % 120) / 119;
                const x = bounds.x + 65 + fraction * (bounds.width - 78);
                lastEvent = performance.now();
                element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: bounds.y + 70 }));
              }
            }
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            observer.disconnect();
            const summary = (values: number[]) => {
              const ordered = [...values].sort((a, b) => a - b);
              return { p95: ordered[Math.floor(ordered.length * .95)] ?? 0, max: ordered.at(-1) ?? 0 };
            };
            return {
              updates, latencyMs: summary(latencies), frameMs: summary(frames),
              geometryUnchanged: JSON.stringify(geometryAtStart) === JSON.stringify(geometry()),
              staticWork: performance.getEntriesByType("mark")
                .filter((entry) => entry.name.startsWith("activity-chart:")).map((entry) => entry.name),
            };
          });
          expect(result.updates).toBeGreaterThan(30);
          expect(result.geometryUnchanged).toBe(true);
          expect(result.staticWork).toEqual([]);
          const globalValues = await chart.locator("[data-chart-readout] dd").allTextContents();
          await expect(chart.locator("[data-chart-track-readout]")).toHaveText(globalValues.slice(2));
          evidence.push({ sweep, axis, metric, inputSamples: count, ...result });
        }
      }
    }
    console.log("Activity chart measured browser sweeps:", JSON.stringify(evidence));
    await test.info().attach("chart-performance", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
    // Keyboard selection has the same cache guarantee, including clearing the cursor.
    await page.evaluate(() => performance.clearMarks());
    await chart.focus();
    for (const key of ["Home", "ArrowRight", "End", "ArrowLeft", "Escape"]) await page.keyboard.press(key);
    expect(await page.evaluate(() => performance.getEntriesByType("mark").filter((entry) => entry.name.startsWith("activity-chart:")).length)).toBe(0);
  } finally { await client.end(); }
});
