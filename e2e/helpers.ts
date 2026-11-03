import { createHash, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import pg from "pg";
import { APP_URL, AUTH_SECRET, DATABASE_URL, GARMIN_MOCK_ORIGIN } from "./env";

const SIGN_IN_CODE = "123456";

export function uniqueEmail(name: string): string {
  return `${name}-${randomUUID().slice(0, 8)}@example.com`;
}

export function uniqueGarminUser(): string {
  return `garmin-${randomUUID().slice(0, 8)}`;
}

async function query(sql: string, params: unknown[]) {
  const client = new pg.Client(DATABASE_URL);
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

/** Signs in with the email-code flow. Email delivery is disabled, so the stored code is replaced by a known one. */
export async function signIn(page: Page, email: string) {
  await page.goto("/signin");
  // Auth.js sets the CSRF cookie from the first session requests; submitting before they settle fails.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  const code = page.getByLabel("Code");
  await expect(code).toBeVisible();
  // Auth.js stores sha256(code + secret).
  const hash = createHash("sha256").update(`${SIGN_IN_CODE}${AUTH_SECRET}`).digest("hex");
  const updated = await query('UPDATE "VerificationToken" SET token = $1 WHERE identifier = $2', [hash, email]);
  expect(updated.rowCount).toBe(1);
  await code.fill(SIGN_IN_CODE);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(accountMenuButton(page)).toBeVisible();
  // The desktop trigger shows the email; the "Signed in as" menu line is mobile-only.
  await expect(accountMenuButton(page)).toContainText(email);
}

export const accountMenuButton = (page: Page) => page.getByRole("button", { name: "Account menu" });

export async function openAccountMenu(page: Page) {
  const button = accountMenuButton(page);
  if (await button.getAttribute("aria-expanded") !== "true") await button.click();
  await expect(page.getByRole("menu", { name: "Account menu" })).toBeVisible();
}

export async function closeAccountMenu(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Account menu" })).toBeHidden();
}

export async function signOut(page: Page) {
  await openAccountMenu(page);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
}

/** Garmin items are in the account menu; open it before checking them. */
export const connectGarminLink = (page: Page) => page.getByRole("menuitem", { name: "Connect Garmin", exact: true });
export const disconnectGarminButton = (page: Page) =>
  page.getByRole("menuitem", { name: "Disconnect Garmin", exact: true });

/** Runs the Garmin consent and OAuth flow; the mocked Garmin authorization page signs in as `garminUser`. */
export async function connectGarmin(page: Page, garminUser: string) {
  await page.context().addCookies([{ name: "garmin_e2e_user", value: garminUser, url: GARMIN_MOCK_ORIGIN }]);
  await openAccountMenu(page);
  await connectGarminLink(page).click();
  await expect(page).toHaveURL(/\/garmin\/consent$/);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Agree and continue to Garmin" }).click();
  await page.waitForURL((url) => url.origin === APP_URL && url.pathname === "/");
}

export async function disconnectGarmin(page: Page) {
  await openAccountMenu(page);
  await disconnectGarminButton(page).click();
  await openAccountMenu(page);
  await expect(connectGarminLink(page)).toBeVisible();
  await closeAccountMenu(page);
}

export async function garminWorkouts(garminUser: string): Promise<{ workoutId: number; date: string | null }[]> {
  const response = await fetch(`${GARMIN_MOCK_ORIGIN}/__workouts?user=${encodeURIComponent(garminUser)}`);
  return response.json();
}

export async function createWeek(page: Page) {
  await page.getByLabel("Minutes", { exact: true }).fill("25");
  await page.getByLabel("Seconds", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Create training week" }).click();
  await expect(page.getByRole("button", { name: "Copy week as text" })).toBeVisible();
}
