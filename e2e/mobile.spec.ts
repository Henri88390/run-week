import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { z } from "zod";
import { createWeek, garminWorkouts, setEmailCode, signIn, uniqueEmail, uniqueGarminUser } from "./helpers";
import { GARMIN_MOCK_ORIGIN } from "./env";
import { parsePlannerValue, STORAGE_KEY } from "../src/features/running-programs/storage";

const sessionSchema = z.object({
  token: z.string(), expires: z.iso.datetime(), user: z.object({ id: z.string(), email: z.string() }),
});

async function mobileSignIn(request: APIRequestContext, email: string) {
  const sent = await request.post("/api/mobile/auth/code", { data: { email } });
  expect(sent.status()).toBe(200);
  await setEmailCode(email);
  const verified = await request.post("/api/mobile/auth/verify", { data: { email, code: "123456" } });
  expect(verified.status()).toBe(200);
  return sessionSchema.parse(await verified.json());
}

test("mobile email codes are single-use, rate-limited and sessions can be revoked", async ({ request }) => {
  const email = uniqueEmail("native");
  const session = await mobileSignIn(request, email);
  const headers = { Authorization: `Bearer ${session.token}` };
  expect((await request.get("/api/mobile/session", { headers })).status()).toBe(200);
  expect((await request.get("/api/planner", { headers })).status()).toBe(200);
  expect((await request.post("/api/mobile/auth/verify", { data: { email, code: "123456" } })).status()).toBe(401);
  expect((await request.get("/api/account", { headers })).status()).toBe(200);
  const pending = await request.post("/api/mobile/auth/browser", {
    headers, data: { purpose: "garmin", challenge: randomBytes(32).toString("base64url") },
  });
  const pendingUrl = z.object({ url: z.url() }).parse(await pending.json()).url;
  expect((await request.delete("/api/mobile/session", { headers })).status()).toBe(204);
  expect((await request.get("/api/mobile/session", { headers })).status()).toBe(401);
  expect((await request.post("/api/garmin/disconnect", { headers })).status()).toBe(401);
  expect((await request.get(pendingUrl)).status()).toBe(400);

  const other = uniqueEmail("native-invalid");
  expect((await request.post("/api/mobile/auth/code", { data: { email: other } })).status()).toBe(200);
  await setEmailCode(other);
  for (let attempt = 0; attempt < 5; attempt++) {
    expect((await request.post("/api/mobile/auth/verify", {
      data: { email: other, code: "000000" },
    })).status()).toBe(401);
  }
  expect((await request.post("/api/mobile/auth/verify", {
    data: { email: other, code: "123456" },
  })).status()).toBe(401);
  for (let attempt = 0; attempt < 4; attempt++) {
    expect((await request.post("/api/mobile/auth/code", { data: { email: other } })).status()).toBe(200);
  }
  expect((await request.post("/api/mobile/auth/code", { data: { email: other } })).status()).toBe(429);
});

test("native and browser sessions share existing endpoints without weakening cookie CSRF protection", async ({ request, page }) => {
  await page.goto("/planner");
  await createWeek(page);
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const planner = parsePlannerValue(JSON.parse(stored ?? "null"));
  const email = uniqueEmail("native-planner");
  const session = await mobileSignIn(request, email);
  const headers = { Authorization: `Bearer ${session.token}` };
  const other = await mobileSignIn(request, uniqueEmail("native-other"));
  await Promise.all([session, other, session, other].map(async (signedIn) => {
    const response = await request.get("/api/account", {
      headers: { Authorization: `Bearer ${signedIn.token}` },
    });
    expect((await response.json()).account.email).toBe(signedIn.user.email);
  }));
  const saved = await request.put("/api/planner", { headers, data: { planner } });
  expect(saved.status()).toBe(200);
  expect((await (await request.get("/api/planner", { headers })).json()).planner).toEqual(planner);
  expect((await (await request.get("/api/planner", {
    headers: { Authorization: `Bearer ${other.token}` },
  })).json()).planner).toBeNull();
  await signIn(page, email);
  expect((await page.request.get("/api/mobile/session")).status()).toBe(401);
  expect((await page.request.get("/api/planner", {
    headers: { Authorization: `Bearer ${"x".repeat(43)}` },
  })).status()).toBe(401);
  expect((await (await page.request.get("/api/planner")).json()).planner).toEqual(planner);
  expect((await page.request.put("/api/planner", { data: { planner: null } })).status()).toBe(403);
  expect((await request.put("/api/planner", {
    headers: { Authorization: `Bearer ${"x".repeat(43)}` }, data: { planner: null },
  })).status()).toBe(401);
  expect((await request.put("/api/planner", {
    headers: { ...headers, Origin: "https://unrelated.example" }, data: { planner: null },
  })).status()).toBe(403);
  expect((await request.get("/api/mobile/planner", { headers })).status()).toBe(404);
  expect((await request.delete("/api/account", { headers })).status()).toBe(204);
  expect((await request.get("/api/mobile/session", { headers })).status()).toBe(401);
});

test("system-browser sign-in returns a single-use PKCE code, not a session token", async ({ page, request }) => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const started = await request.post("/api/mobile/auth/browser", { data: { purpose: "signin", challenge } });
  expect(started.status()).toBe(200);
  const { url } = z.object({ url: z.url() }).parse(await started.json());
  await page.goto(url);
  const callbackUrl = new URL(page.url()).searchParams.get("callbackUrl");
  expect(callbackUrl).toContain("/api/mobile/browser/finish?ticket=");
  // Sign in with the regular web flow; finishing must not overwrite the browser's session.
  await signIn(page, uniqueEmail("native-browser"));
  const finished = await page.request.get(callbackUrl ?? "", { maxRedirects: 0 });
  expect(finished.status()).toBe(307);
  const location = new URL(finished.headers().location);
  expect(location.protocol).toBe("runweek:");
  expect(location.searchParams.has("token")).toBe(false);
  const code = location.searchParams.get("code");
  expect((await request.post("/api/mobile/auth/exchange", {
    data: { code, verifier: randomBytes(32).toString("base64url") },
  })).status()).toBe(401);
  const exchanged = await request.post("/api/mobile/auth/exchange", { data: { code, verifier } });
  expect(exchanged.status()).toBe(200);
  sessionSchema.parse(await exchanged.json());
  expect((await request.post("/api/mobile/auth/exchange", { data: { code, verifier } })).status()).toBe(401);
});

test("mobile Garmin uses the native account, preserves the browser account and deletes sent workouts", async ({ page, request }) => {
  await page.goto("/planner");
  await createWeek(page);
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const planner = parsePlannerValue(JSON.parse(stored ?? "null"));
  const session = await mobileSignIn(request, uniqueEmail("native-garmin"));
  const headers = { Authorization: `Bearer ${session.token}` };
  const browserEmail = uniqueEmail("browser-other");
  await signIn(page, browserEmail);
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const started = await request.post("/api/mobile/auth/browser", { headers, data: { purpose: "garmin", challenge } });
  expect(started.status()).toBe(200);
  const { url } = z.object({ url: z.url() }).parse(await started.json());
  const garminUser = uniqueGarminUser();
  await page.context().addCookies([{ name: "garmin_e2e_user", value: garminUser, url: GARMIN_MOCK_ORIGIN }]);
  await page.goto(url);
  await page.getByRole("checkbox").check();
  const callback = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/garmin/callback");
  await page.getByRole("button", { name: "Agree and continue to Garmin" }).click();
  const response = await callback;
  const location = new URL((await response.allHeaders()).location);
  expect(location.protocol).toBe("runweek:");
  const exchanged = await request.post("/api/mobile/auth/exchange", {
    data: { code: location.searchParams.get("code"), verifier },
  });
  expect(await exchanged.json()).toEqual({ garmin: "connected" });
  expect((await (await request.get("/api/garmin/status", { headers })).json()).connected).toBe(true);
  expect((await (await page.request.get("/api/garmin/status")).json()).connected).toBe(false);
  const week = planner.currentWeek;
  const sent = await request.post("/api/garmin/workouts", {
    headers, data: { weekStart: week.startDate, locale: "en", vdot: week.profile.vdot, workouts: week.workouts },
  });
  expect(sent.status()).toBe(200);
  expect((await garminWorkouts(garminUser)).length).toBeGreaterThan(0);
  expect((await request.post("/api/garmin/disconnect", { headers })).status()).toBe(200);
  expect(await garminWorkouts(garminUser)).toEqual([]);
});
