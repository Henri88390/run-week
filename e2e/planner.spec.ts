import { expect, test, type Page } from "@playwright/test";

const DISTANCES = ["1 mile", "5 km", "10 km", "Half marathon", "Marathon"] as const;
type Distance = (typeof DISTANCES)[number];

const saveButton = (page: Page) => page.getByRole("button", { name: "Save and regenerate week" });

async function chooseDistance(page: Page, name: Distance | "Custom distance (metres)") {
  await page.getByRole("combobox", { name: "Recent performance distance" }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function fillTime(page: Page, hours: string, minutes: string, seconds: string) {
  const hoursField = page.getByLabel("Hours", { exact: true });
  if (await hoursField.isVisible()) await hoursField.fill(hours);
  await page.getByLabel("Minutes", { exact: true }).fill(minutes);
  await page.getByLabel("Seconds", { exact: true }).fill(seconds);
}

/** Creates a week from a saved performance and opens its setup form. */
async function setUp(page: Page, distance: Distance | number, time: [string, string, string]) {
  await page.goto("/planner");
  if (typeof distance === "number") {
    await chooseDistance(page, "Custom distance (metres)");
    await page.getByLabel("Distance in metres (1500–42,195)").fill(String(distance));
  } else await chooseDistance(page, distance);
  await fillTime(page, ...time);
  await page.getByRole("button", { name: "Create training week" }).click();
  await expect(page.getByRole("button", { name: "Copy week as text" })).toBeVisible();
  await page.locator("details summary").first().click();
  await expect(saveButton(page)).toBeDisabled();
}

const SAVED: { distance: Distance | number; time: [string, string, string] }[] = [
  { distance: "5 km", time: ["", "25", "0"] },
  { distance: "10 km", time: ["0", "47", "13"] },
  { distance: "10 km", time: ["0", "51", "53"] },
  { distance: "Half marathon", time: ["1", "45", "0"] },
  { distance: "Marathon", time: ["3", "30", "0"] },
  { distance: 8000, time: ["0", "36", "0"] },
];

for (const saved of SAVED) {
  const label = `${typeof saved.distance === "number" ? `${saved.distance} m` : saved.distance} ${saved.time.filter(Boolean).join(":")}`;

  test(`from ${label}, choosing another distance alone is not a setup change`, async ({ page }) => {
    await setUp(page, saved.distance, saved.time);
    for (const distance of DISTANCES) {
      await chooseDistance(page, distance);
      await expect(saveButton(page), `after choosing ${distance}`).toBeDisabled();
    }
    await chooseDistance(page, "Custom distance (metres)");
    await page.getByLabel("Distance in metres (1500–42,195)").fill("12345");
    await expect(saveButton(page), "after a custom distance").toBeDisabled();
  });
}

test("a changed performance time is a setup change", async ({ page }) => {
  await setUp(page, "5 km", ["", "25", "0"]);
  await chooseDistance(page, "Half marathon");
  await expect(saveButton(page)).toBeDisabled();
  await page.getByLabel("Seconds", { exact: true }).fill("1");
  await expect(saveButton(page)).toBeEnabled();
});

test("after regenerating with another distance, choosing distances alone is still not a setup change", async ({ page }) => {
  await setUp(page, "5 km", ["", "25", "0"]);
  // A new time at one distance, saved at another: the saved VDOT comes from the derived 10 km time.
  await page.getByLabel("Seconds", { exact: true }).fill("30");
  await chooseDistance(page, "10 km");
  await page.getByRole("combobox", { name: "Runs per week" }).click();
  await page.getByRole("option", { name: "4", exact: true }).click();
  await saveButton(page).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save and regenerate" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(saveButton(page)).toBeDisabled();
  for (const distance of [...DISTANCES, "10 km"] as const) {
    await chooseDistance(page, distance);
    await expect(saveButton(page), `after choosing ${distance}`).toBeDisabled();
  }
});
