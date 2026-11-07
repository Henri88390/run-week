// Regenerates the README screenshots with synthetic data: `npm run screenshots` (needs Docker).
import { expect, test, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { createClient } from "redis";
import { randomUUID } from "node:crypto";
import { DATABASE_URL, REDIS_URL } from "./env";
import { createWeek, signIn, uniqueEmail } from "./helpers";
import { syncStatusSchema } from "../src/features/strava/background-sync";

const OUT = "docs/screenshots";
const DESKTOP = { width: 1280, height: 800 };
const DAY = 86_400_000;

type Segment = { seconds: number; pace: number; hr: number };
type Run = { name: string; segments: Segment[]; maximalEffort?: boolean; interval?: boolean };

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const rand = random(20261107);
const between = (min: number, max: number) => min + rand() * (max - min);
const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

function easy(name: string, minutes: number, pace = between(335, 360), hr = between(138, 148)): Run {
  return { name, segments: [{ seconds: minutes * 60, pace, hr }] };
}
function intervals(reps: number, work: number): Run {
  const pace = between(232, 248);
  const segments: Segment[] = [{ seconds: 900, pace: 350, hr: 140 }];
  for (let i = 0; i < reps; i++)
    segments.push({ seconds: work * 60, pace: pace - i, hr: 172 + i }, { seconds: 120, pace: 400, hr: 150 });
  segments.push({ seconds: 600, pace: 360, hr: 140 });
  return { name: `Intervals ${reps}×${work} min`, segments, interval: true };
}
function tempo(minutes: number): Run {
  return { name: "Tempo run", segments: [{ seconds: 900, pace: 345, hr: 142 },
    { seconds: minutes * 60, pace: between(272, 285), hr: between(160, 166) }, { seconds: 600, pace: 355, hr: 145 }] };
}
function long(minutes: number): Run {
  const pace = between(338, 352);
  return { name: "Long run", segments: [{ seconds: minutes * 30, pace, hr: 143 }, { seconds: minutes * 30, pace: pace - 6, hr: 151 }] };
}
function race(name: string, meters: number, seconds: number): Run {
  return { name, maximalEffort: true, segments: [{ seconds: seconds * .5, pace: seconds / meters * 1000, hr: 172 },
    { seconds: seconds * .5, pace: seconds / meters * 1000 - 2, hr: 182 }] };
}

/** Samples a run every 5 s with gradual heart-rate response, pace noise and rolling hills. */
function recording(run: Run) {
  const time: number[] = [], heartrate: number[] = [], velocity: number[] = [], distance: number[] = [], altitude: number[] = [];
  const phase = rand() * 6;
  let hr = 105, meters = 0, t = 0, gain = 0;
  for (const segment of run.segments) {
    for (let s = 0; s < segment.seconds; s += 5, t += 5) {
      const elevation = 60 + 18 * Math.sin(t / 700 + phase) + 7 * Math.sin(t / 160 + phase * 2);
      const speed = Math.max(1.5, 1000 / segment.pace + (rand() - .5) * .35 - (elevation - (altitude.at(-1) ?? elevation)) * .08);
      hr += (segment.hr + t / 900 - hr) * (run.interval ? .12 : .05) + (rand() - .5) * 1.2;
      if (altitude.length) gain += Math.max(0, elevation - altitude[altitude.length - 1]);
      time.push(t); heartrate.push(Math.round(hr)); velocity.push(Number(speed.toFixed(3)));
      distance.push(Number(meters.toFixed(1))); altitude.push(Number(elevation.toFixed(1)));
      meters += speed * 5;
    }
  }
  return { streams: { time, heartrate, velocity_smooth: velocity, distance, altitude },
    distanceMeters: Math.round(meters), movingSeconds: t, gain: Math.round(gain),
    averageHr: heartrate.reduce((sum, value) => sum + value, 0) / heartrate.length, maxHr: Math.max(...heartrate) };
}

/** About thirteen months of varied training, with four races that support critical-speed estimates. */
function trainingHistory(today: number) {
  const races = new Map([[isoDate(today - 238 * DAY), race("City 10K", 10_000, 2_520)],
    [isoDate(today - 182 * DAY), race("Parkrun 5K", 5_000, 1_235)], [isoDate(today - 140 * DAY), race("Track 3000 m", 3_000, 715)],
    [isoDate(today - 41 * DAY), race("Half marathon", 21_097, 5_390)]]);
  const runs: { date: string; run: Run }[] = [];
  for (let time = today - 400 * DAY; time < today; time += DAY) {
    const date = isoDate(time);
    const day = new Date(time).getUTCDay();
    const build = (1 + .25 * Math.sin(time / (DAY * 60))) * (Math.floor(time / (DAY * 7)) % 4 === 3 ? .7 : 1);
    const raceRun = races.get(date);
    if (raceRun) { runs.push({ date, run: raceRun }); continue; }
    if (day === 1 || rand() < .08) continue;
    const minutes = (value: number) => Math.round(value * build / 5) * 5;
    const run = day === 2 ? intervals(Math.round(between(4, 7)), rand() < .5 ? 3 : 4)
      : day === 4 ? tempo(minutes(between(18, 28)))
        : day === 6 ? long(minutes(between(80, 115)))
          : day === 5 ? rand() < .4 ? easy("Recovery jog", minutes(30), between(370, 395), between(126, 134)) : null
            : easy(day === 3 ? "Lunch run" : "Morning easy run", minutes(between(38, 55)));
    if (run) runs.push({ date, run });
  }
  return runs;
}

async function query(sql: string, params: unknown[] = []) {
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try { return await client.query(sql, params); }
  finally { await client.end(); }
}

async function seedActivities(email: string) {
  const user = (await query('SELECT id FROM "User" WHERE email=$1', [email])).rows[0].id as string;
  await query('DELETE FROM "StravaActivity" WHERE "userId"=$1', [user]);
  const today = Date.parse(`${isoDate(Date.now())}T00:00:00Z`);
  const ids: Record<string, string> = {};
  const history = trainingHistory(today);
  for (let start = 0; start < history.length; start += 40) {
    const values: unknown[] = [];
    const rows = history.slice(start, start + 40).map(({ date, run }, index) => {
      const id = `screenshot-${randomUUID()}`;
      if (run.interval) ids[`interval:${date.slice(0, 7)}`] = id;
      const recorded = recording(run);
      const startedAt = new Date(`${date}T${run.name === "Lunch run" ? "12:15" : "07:30"}:00Z`);
      values.push(id, user, String(9_000_000 + start + index), run.name, startedAt, date, recorded.distanceMeters,
        recorded.movingSeconds, recorded.movingSeconds + Math.round(rand() * 60), recorded.averageHr, recorded.maxHr,
        recorded.gain, JSON.stringify(recorded.streams), Boolean(run.maximalEffort));
      const p = index * 14;
      return `($${p + 1},$${p + 2},$${p + 3},$${p + 4},'Run',$${p + 5},$${p + 6},$${p + 7},$${p + 8},$${p + 9},$${p + 10},$${p + 11},$${p + 12},'ready',$${p + 13}::jsonb,'ready',$${p + 14},now())`;
    });
    await query(`INSERT INTO "StravaActivity" (id,"userId","sourceId",name,sport,"startedAt","localDate","distanceMeters",
      "movingSeconds","elapsedSeconds","averageHr","maxHr","elevationGainMeters","elevationStreamState",streams,"streamState",
      "maximalEffort","updatedAt") VALUES ${rows.join(",")}`, values);
  }
  const cache = createClient({ url: REDIS_URL });
  await cache.connect();
  try { await cache.flushDb(); }
  finally { await cache.close(); }
  return ids;
}

async function connectStrava(page: Page) {
  await page.context().addCookies([{ name: "strava_e2e_athlete", value: "8701", url: "http://127.0.0.1:3102" }]);
  await page.goto("/strava/consent");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Authorize import", exact: true }).click();
  await page.waitForURL(/\/activities\?strava=/);
  // Mock imports finish first so they cannot overwrite the synthetic history.
  await expect.poll(async () => {
    const response = await page.request.get("/api/strava/sync");
    return syncStatusSchema.parse(await response.json()).job?.status;
  }, { timeout: 120_000 }).toBe("completed");
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}
async function shot(page: Page, name: string, fullPage = false) {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}
/** Captures the page area spanning the given elements, plus a margin. */
async function region(page: Page, name: string, from: Locator, to: Locator) {
  await settle(page);
  const [top, bottom] = [await from.boundingBox(), await to.boundingBox()];
  if (!top || !bottom) throw new Error(`Missing screenshot region for ${name}`);
  const scroll = await page.evaluate(() => window.scrollY);
  const y = Math.max(0, top.y + scroll - 16);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true,
    clip: { x: 0, y, width: DESKTOP.width, height: bottom.y + scroll + bottom.height + 16 - y } });
}

test.use({ viewport: DESKTOP, colorScheme: "light" });
test.beforeEach(async ({ page }) => {
  // The dev-tools badge is not part of the app.
  await page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.head.append(style);
  }));
});

test("documentation screenshots", async ({ page }) => {
  const today = new Date();
  const previousMonth = isoDate(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).slice(0, 7);
  const lastWeek = isoDate(today.getTime() - 7 * DAY);

  await page.goto("/planner");
  await expect(page.getByRole("button", { name: "Create training week" })).toBeVisible();
  await shot(page, "setup");
  await createWeek(page);
  await shot(page, "week");
  await page.getByRole("button", { name: /Intervals$/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await shot(page, "workout-details");
  await page.keyboard.press("Escape");
  await page.goto("/privacy");
  await shot(page, "privacy");
  await page.goto("/signin");
  await shot(page, "signin");

  const email = uniqueEmail("screenshots");
  await signIn(page, email);
  await page.goto("/strava/consent");
  await expect(page.getByRole("checkbox")).toBeVisible();
  await shot(page, "strava-consent");
  await page.goto("/garmin/consent");
  await expect(page.getByRole("checkbox")).toBeVisible();
  await shot(page, "garmin-consent");
  await connectStrava(page);
  const ids = await seedActivities(email);

  await page.goto(`/activities?month=${previousMonth}`);
  const calendar = page.locator("section").filter({ has: page.getByRole("heading", { name: "Training calendar", exact: true }) });
  await expect(calendar.locator("[data-week]").first()).toBeVisible();
  await region(page, "activities-calendar", page.getByRole("banner"), calendar);
  const volume = page.locator("[data-volume-chart]").locator("xpath=ancestor-or-self::section[1]");
  const threshold = page.locator("article").filter({ has: page.getByRole("heading", { name: "Time above threshold (>90%)" }) });
  await region(page, "activities-graphs", volume, threshold);

  await page.goto(`/activities?view=week&date=${lastWeek}`);
  await expect(page.locator("[data-week]")).toHaveCount(1);
  await shot(page, "activities-week", true);
  await page.goto(`/activities?view=year&year=${today.getUTCFullYear()}`);
  await expect(page.locator("[data-year-month]")).toHaveCount(12);
  await shot(page, "activities-year", true);

  const interval = ids[`interval:${previousMonth}`];
  if (!interval) throw new Error("No interval session in the previous month");
  await page.goto(`/activities/${interval}`);
  await expect(page.locator("[data-activity-chart]").filter({ visible: true }).locator(".recharts-line-curve").first()).toBeVisible();
  await shot(page, "activity-details", true);

  await page.goto("/running-metrics");
  await expect(page.locator("[data-performance-indicator]").first()).toBeVisible();
  await shot(page, "running-metrics", true);

  await page.evaluate(() => localStorage.setItem("run-week-theme", "dark"));
  await page.goto(`/activities?month=${previousMonth}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(calendar.locator("[data-week]").first()).toBeVisible();
  await shot(page, "activities-dark");
  await page.goto("/planner");
  await createWeek(page);
  await shot(page, "week-dark");
});
