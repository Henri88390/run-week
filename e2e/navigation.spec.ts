import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("shared navigation is consistent across pages and usable on mobile by keyboard", async ({ page }) => {
  const expected = ["/planner", "/activities", "/running-metrics"];
  let labels: string[] | undefined;
  for (const route of ["/", "/planner", "/activities", "/running-metrics", "/privacy", "/signin", "/strava/consent", "/garmin/consent", "/activities/missing"]) {
    await page.goto(route);
    if (route === "/") await expect(page).toHaveURL(/\/planner$/);
    await expect(page.getByRole("banner")).toHaveCount(1);
    const navigation = page.getByRole("navigation", { name: "Run Week", exact: true });
    await expect(navigation.getByRole("link")).toHaveCount(3);
    await expect(navigation.locator('a[href="/privacy"]')).toHaveCount(0);
    await expect(page.getByRole("contentinfo").locator('a[href="/privacy"]')).toBeVisible();
    const currentLabels = await navigation.getByRole("link").allTextContents();
    if (labels) expect(currentLabels).toEqual(labels);
    else labels = currentLabels;
    for (const href of expected) await expect(navigation.locator(`a[href="${href}"]`)).toBeVisible();
    await expect(page.getByRole("combobox", { name: /^Language/ })).toHaveCount(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/planner");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Run Week", exact: true });
  await navigation.locator('a[href="/activities"]').focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/activities$/);
  await expect(navigation.locator('a[href="/activities"]')).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole("contentinfo").getByRole("link").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/privacy$/);
  await page.screenshot({ path: test.info().outputPath("navigation-mobile.png"), fullPage: true });
});

test("homepage follows account sign-in status", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/planner$/);
  await signIn(page, uniqueEmail("home"));
  await page.goto("/");
  await expect(page).toHaveURL(/\/activities$/);
});
