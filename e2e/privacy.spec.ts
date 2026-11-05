import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { LOCALES, LOCALE_NAMES, type Locale } from "../src/features/i18n/locales";
import { PRIVACY_MESSAGES } from "../src/features/account/privacy-messages";
import { STRAVA_MESSAGES } from "../src/features/strava/messages";
import { BACKGROUND_MESSAGES, ELEVATION_DISCLOSURE } from "../src/features/strava/background-messages";
import { WEBHOOK_DISCLOSURE } from "../src/features/strava/webhook-messages";
import { CACHE_PRIVACY_MESSAGES } from "../src/features/strava/sync-messages";
import { STORAGE_KEY } from "../src/features/running-programs/storage";

test.use({ locale: "fr-FR" });

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

async function switchLanguage(page: Page, locale: Locale) {
  // Signed-out desktop selector: exercise the actual shared locale store/UI.
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: LOCALE_NAMES[locale], exact: true }).click();
  await expect(page.getByRole("main")).toHaveAttribute("lang", locale);
}

async function expectPolicy(page: Page, locale: Locale) {
  const text = PRIVACY_MESSAGES[locale];
  const main = page.getByRole("main");
  await expect(main).toHaveAttribute("lang", locale);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(text.title);
  for (const heading of [text.dataTitle, text.recipientsTitle, text.aiTitle, text.storageTitle, text.rightsTitle, text.controls.title, text.changesTitle]) {
    await expect(main.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  for (const paragraph of [
    text.intro, text.contact, ...text.data, ...text.recipients.map((p) => p.replace("{host}", "E2E test host")),
    text.keys, text.ai, ...text.storage, text.plannerBefore, text.plannerAfter.trim(), ...text.rights, text.changes,
    STRAVA_MESSAGES[locale].consent, BACKGROUND_MESSAGES[locale].consent,
    ELEVATION_DISCLOSURE[locale], WEBHOOK_DISCLOSURE[locale], CACHE_PRIVACY_MESSAGES[locale],
  ]) await expect(main).toContainText(paragraph);
  await expect(main.locator('a[href="https://www.henri-lambert.my/"]')).toHaveText("Henri Lambert");
  await expect(main.locator('a[href="/planner"]')).toHaveText(text.plannerLink);
  await expect(main.locator('a[href="/activities"]')).toHaveText(STRAVA_MESSAGES[locale].overview);
}

test("all ten locales have complete, non-English privacy messages and disclosure structure", () => {
  expect(Object.keys(PRIVACY_MESSAGES).sort()).toEqual([...LOCALES].sort());
  const english = strings(PRIVACY_MESSAGES.en);
  for (const locale of LOCALES) {
    const text = PRIVACY_MESSAGES[locale];
    const leaves = strings(text);
    expect(leaves).toHaveLength(english.length);
    expect(text.data).toHaveLength(5);
    expect(text.recipients).toHaveLength(8);
    expect(text.storage).toHaveLength(4);
    expect(text.rights).toHaveLength(2);
    for (const leaf of leaves) {
      expect(leaf.trim()).not.toBe("");
      if (locale !== "en" && leaf.length > 15) expect(english).not.toContain(leaf);
    }
    expect(text.recipients.join(" ")).toContain("{host}");
    expect(text.controls.disconnected).toContain("{deleted}");
    expect(text.controls.remaining).toContain("{remaining}");
    expect(text.controls.reference).toContain("{reference}");
    // Technical facts must survive translation.
    for (const fact of ["2026", "Android", "AES-256-GCM", "VDOT", "HMAC", "UTC", "HttpOnly", "PKCE", "60", "24", "30", "10"]) {
      expect(leaves.join(" ")).toContain(fact);
    }
    for (const disclosure of [ELEVATION_DISCLOSURE, WEBHOOK_DISCLOSURE, CACHE_PRIVACY_MESSAGES]) {
      expect(disclosure[locale].trim()).not.toBe("");
      if (locale !== "en") expect(disclosure[locale]).not.toBe(disclosure.en);
    }
  }
});

test("full French policy, all-locale language switching and signed-out controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/privacy");
  await expectPolicy(page, "fr");
  // Metadata is deliberately static; visible titles follow the browser locale.
  await expect(page).toHaveTitle("Privacy policy · Run Week");
  await switchLanguage(page, "en");
  const englishBlocks = await page.getByRole("main").locator("p, li, h1, h2, button").allTextContents();
  for (const locale of LOCALES) {
    await switchLanguage(page, locale);
    await expectPolicy(page, locale);
    const controls = PRIVACY_MESSAGES[locale].controls;
    await expect(page.getByRole("button", { name: controls.exportBrowser, exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: controls.exportAccount, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: controls.deleteAccountOpen, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: controls.disconnect, exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: controls.deleteBrowserOpen, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: controls.deleteBrowser, exact: true });
    await expect(dialog).toContainText(controls.confirmBrowser);
    await expect(dialog.getByRole("button", { name: controls.cancel, exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    if (locale !== "en") {
      const translated = await page.getByRole("main").locator("p, li, h1, h2, button").allTextContents();
      for (const block of englishBlocks.filter((text) => text.length > 30)) expect(translated).not.toContain(block);
    }
  }
  await switchLanguage(page, "fr");
  await page.reload();
  await expectPolicy(page, "fr");
  expect(errors).toEqual([]);
});

test("French mobile policy, keyboard confirmation, browser export and deletion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify({ fixture: "browser-only" })), STORAGE_KEY);
  await page.goto("/privacy");
  await expectPolicy(page, "fr");
  const text = PRIVACY_MESSAGES.fr.controls;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const exportButton = page.getByRole("button", { name: text.exportBrowser, exact: true });
  await exportButton.focus();
  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("run-week-data.json");
  const path = await download.path();
  if (!path) throw new Error("Missing browser export");
  const data = JSON.parse(await readFile(path, "utf8"));
  expect(data.browser.planner).toEqual({ fixture: "browser-only" });
  expect(data.account).toBeNull();
  await expect(page.getByRole("status")).toContainText(text.exported);
  const opener = page.getByRole("button", { name: text.deleteBrowserOpen, exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: text.deleteBrowser, exact: true });
  await expect(dialog.getByRole("button", { name: text.cancel, exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: text.deleteBrowser, exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: text.cancel, exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await page.screenshot({ path: test.info().outputPath("privacy-french-mobile-dialog.png") });
  await dialog.getByRole("button", { name: text.deleteBrowser, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(text.browserDeleted);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("run-week-locale"))).toBeNull();
  await page.screenshot({ path: test.info().outputPath("privacy-french-mobile.png"), fullPage: true });
});

test("French browser storage failure is localized", async ({ page }) => {
  await page.goto("/privacy");
  const text = PRIVACY_MESSAGES.fr.controls;
  await page.evaluate(() => {
    Storage.prototype.removeItem = () => { throw new DOMException("Blocked", "SecurityError"); };
  });
  await page.getByRole("button", { name: text.deleteBrowserOpen, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: text.deleteBrowser, exact: true }).click();
  await expect(page.getByRole("status")).toContainText(text.browserError);
});

test("French signed-in exports, dialogs, failures and disconnect counts use only mocked requests", async ({ page }) => {
  let signedIn = true;
  let accountFailure = true;
  let accountNetwork = false;
  let garminResponse = 0;
  let stravaFailure = true;
  let accountDeletes = 0;
  const reference = "1c4c6a9c-183b-44c8-a0d6-efc6f7d8f6c1";
  await page.route("**/api/auth/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/session")) return route.fulfill({ json: signedIn ? {
      user: { name: "Privacy fixture", email: "privacy@example.com", image: null },
      expires: "2099-01-01T00:00:00.000Z",
    } : null });
    if (path.endsWith("/csrf")) return route.fulfill({ json: { csrfToken: "fixture" } });
    if (path.endsWith("/signout")) return route.fulfill({ json: { url: new URL("/privacy", page.url()).href } });
    return route.fulfill({ status: 400, json: {} });
  });
  await page.route("**/api/account", (route) => {
    if (accountNetwork) return route.abort();
    if (route.request().method() === "DELETE") {
      accountDeletes++;
      if (accountFailure) return route.fulfill({ status: 503, json: {} });
      signedIn = false;
      return route.fulfill({ json: { deleted: true } });
    }
    return route.fulfill({ status: accountFailure ? 503 : 200, json: { fixture: "account", stravaActivities: [], runningAnalyticsSettings: null } });
  });
  await page.route("**/api/garmin/disconnect", (route) => {
    const attempt = garminResponse++;
    if (attempt === 0) return route.fulfill({ status: 503, json: { deleted: 0, remaining: 0, error: "failed", requestId: reference } });
    if (attempt === 1) return route.abort();
    return route.fulfill({ json: { deleted: 1234, remaining: attempt === 2 ? 2 : 0 } });
  });
  await page.route("**/api/strava/disconnect", (route) => stravaFailure
    ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { deleted: true } }));
  await page.goto("/privacy");
  await expectPolicy(page, "fr");
  const text = PRIVACY_MESSAGES.fr.controls;
  const controls = page.getByRole("region", { name: text.title });
  await controls.getByRole("button", { name: text.exportAccount, exact: true }).click();
  await expect(controls.getByRole("status")).toHaveText(text.exportError);
  accountFailure = false;
  const downloadPromise = page.waitForEvent("download");
  await controls.getByRole("button", { name: text.exportAccount, exact: true }).click();
  const path = await (await downloadPromise).path();
  if (!path) throw new Error("Missing account export");
  expect(JSON.parse(await readFile(path, "utf8")).account.fixture).toBe("account");
  await expect(controls.getByRole("status")).toHaveText(text.exported);
  const disconnect = controls.getByRole("button", { name: text.disconnect, exact: true });
  await disconnect.click();
  await expect(controls.getByRole("status")).toHaveText(`${text.disconnectError} ${text.reference.replace("{reference}", reference)}`);
  await disconnect.click();
  await expect(controls.getByRole("status")).toHaveText(text.disconnectNetwork);
  await disconnect.click();
  await expect(controls.getByRole("status")).toContainText(text.remaining.replace("{remaining}", "2"));
  await expect(controls.getByRole("status")).toContainText("1 234");
  await expect(controls.getByRole("status")).toContainText(text.revoke);
  await disconnect.click();
  await expect(controls.getByRole("status")).not.toContainText(text.remaining.split("{remaining}")[0]);

  const strava = STRAVA_MESSAGES.fr;
  await page.getByRole("button", { name: strava.disconnect, exact: true }).click();
  const stravaDialog = page.getByRole("dialog", { name: strava.disconnect, exact: true });
  await expect(stravaDialog).toContainText(strava.confirmDelete);
  await stravaDialog.getByRole("button", { name: strava.disconnect, exact: true }).click();
  await expect(stravaDialog.getByRole("alert")).toBeVisible();
  stravaFailure = false;
  await stravaDialog.getByRole("button", { name: strava.disconnect, exact: true }).click();
  await expect(page.getByRole("main")).toContainText(strava.deleted);

  // Storage events from another tab must translate existing feedback, not just labels.
  await page.evaluate(() => {
    localStorage.setItem("run-week-locale", "en");
    window.dispatchEvent(new StorageEvent("storage", { key: "run-week-locale" }));
  });
  await expect(page.getByRole("main")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("main")).toContainText(STRAVA_MESSAGES.en.deleted);
  await expect(page.getByRole("region", { name: PRIVACY_MESSAGES.en.controls.title }).getByRole("status"))
    .toContainText(PRIVACY_MESSAGES.en.controls.disconnected.replace("{deleted}", "1,234"));
  await page.evaluate(() => {
    localStorage.setItem("run-week-locale", "fr");
    window.dispatchEvent(new StorageEvent("storage", { key: "run-week-locale" }));
  });
  await expect(page.getByRole("main")).toHaveAttribute("lang", "fr");

  await controls.getByRole("button", { name: text.deleteAccountOpen, exact: true }).click();
  const accountDialog = page.getByRole("dialog", { name: text.deleteAccount, exact: true });
  await expect(accountDialog).toContainText(text.confirmAccount);
  await page.keyboard.press("Escape");
  expect(accountDeletes).toBe(0);
  accountFailure = true;
  await controls.getByRole("button", { name: text.deleteAccountOpen, exact: true }).click();
  await accountDialog.getByRole("button", { name: text.deleteAccount, exact: true }).click();
  await expect(accountDialog.getByRole("status")).toHaveText(text.accountError);
  accountNetwork = true;
  await accountDialog.getByRole("button", { name: text.deleteAccount, exact: true }).click();
  await expect(accountDialog.getByRole("status")).toHaveText(text.accountNetwork);
  accountNetwork = false;
  accountFailure = false;
  await accountDialog.getByRole("button", { name: text.deleteAccount, exact: true }).click();
  await expect(page.getByRole("button", { name: text.exportBrowser, exact: true })).toBeVisible();
  expect(accountDeletes).toBe(2);
});
