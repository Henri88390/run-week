import { expect, test, type Page } from "@playwright/test";
import {
  accountMenuButton, closeAccountMenu, connectGarmin, connectGarminLink, createWeek, disconnectGarmin,
  disconnectGarminButton, garminWorkouts, openAccountMenu, signIn, signOut, uniqueEmail, uniqueGarminUser,
} from "./helpers";

const ALREADY_LINKED = "This Garmin Connect account is already connected to another Run Week account.";

async function expectGarminConnected(page: Page, connected: boolean) {
  await openAccountMenu(page);
  await expect(connected ? disconnectGarminButton(page) : connectGarminLink(page)).toBeVisible();
  await expect(connected ? connectGarminLink(page) : disconnectGarminButton(page)).toHaveCount(0);
  await closeAccountMenu(page);
}

test("Garmin controls are available only to signed-in users", async ({ page }) => {
  await page.goto("/planner");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Language/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create training week" })).toBeVisible();
  await expect(accountMenuButton(page)).toHaveCount(0);
  await expect(connectGarminLink(page)).toHaveCount(0);

  await page.goto("/garmin/consent");
  await expect(page.getByRole("alert").filter({ hasText: "Sign in to connect Garmin." })).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Agree and continue to Garmin" })).toBeDisabled();
});

test("the account menu holds Garmin, language and sign-out and works with the keyboard", async ({ page }) => {
  await signIn(page, uniqueEmail("menu"));
  await expect(page.getByRole("combobox", { name: /^Language/ })).toHaveCount(0);
  const button = accountMenuButton(page);
  const menu = page.getByRole("menu", { name: "Account menu" });

  // The shared header can be ready before the asynchronous Garmin status.
  await openAccountMenu(page);
  await expect(connectGarminLink(page)).toBeVisible();
  await closeAccountMenu(page);
  await button.focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu).toBeVisible();
  await expect(connectGarminLink(page)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /Language/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Français" }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Menu du compte" })).toBeVisible();
  await page.getByRole("button", { name: "Menu du compte" }).click();
  await page.getByRole("menuitem", { name: /Langue/ }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();
  await expect(button).toBeVisible();

  await button.click();
  await page.mouse.click(5, 5);
  await expect(menu).toBeHidden();
});

test("a Garmin account can be connected to only one user account", async ({ page }) => {
  const garminUser = uniqueGarminUser();
  const first = uniqueEmail("first");
  const second = uniqueEmail("second");

  await test.step("first user connects the Garmin account", async () => {
    await signIn(page, first);
    await connectGarmin(page, garminUser);
    await expectGarminConnected(page, true);
    await signOut(page);
  });

  await test.step("second user cannot connect the same Garmin account", async () => {
    await signIn(page, second);
    await connectGarmin(page, garminUser);
    await expect(page.getByRole("alert").filter({ hasText: ALREADY_LINKED })).toBeVisible();
    await expectGarminConnected(page, false);
    await signOut(page);
  });

  await test.step("first user is still connected and disconnects Garmin", async () => {
    await signIn(page, first);
    await expectGarminConnected(page, true);
    await disconnectGarmin(page);
    await signOut(page);
  });

  await test.step("second user can now connect the Garmin account", async () => {
    await signIn(page, second);
    await connectGarmin(page, garminUser);
    await expectGarminConnected(page, true);
    await page.reload();
    await expectGarminConnected(page, true);
  });
});

test("a user can reconnect the same Garmin account after disconnecting", async ({ page }) => {
  const garminUser = uniqueGarminUser();
  await signIn(page, uniqueEmail("reconnect"));
  await connectGarmin(page, garminUser);
  await expectGarminConnected(page, true);
  await openAccountMenu(page);
  await disconnectGarminButton(page).click();
  const dialog = page.getByRole("dialog", { name: "Disconnect Garmin?" });
  await expect(dialog).toContainText("Run Week's access to your Garmin account is then removed.");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expectGarminConnected(page, true);
  await disconnectGarmin(page);
  await connectGarmin(page, garminUser);
  await expectGarminConnected(page, true);
});

test("disconnecting Garmin asks for confirmation and deletes sent workouts", async ({ page }) => {
  const garminUser = uniqueGarminUser();
  await signIn(page, uniqueEmail("disconnect"));
  await connectGarmin(page, garminUser);
  await createWeek(page);
  await page.getByRole("button", { name: "Send week to Garmin" }).click();
  await expect(page.getByText(/^\d+ workouts? sent to Garmin\.$/)).toBeVisible();
  const sent = await garminWorkouts(garminUser);
  expect(sent.length).toBeGreaterThan(0);

  const dialog = page.getByRole("dialog", { name: "Disconnect Garmin?" });
  await test.step("cancelling keeps the connection and the workouts", async () => {
    await openAccountMenu(page);
    await disconnectGarminButton(page).click();
    await expect(dialog).toContainText("will be deleted from Garmin Connect");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expectGarminConnected(page, true);
    expect(await garminWorkouts(garminUser)).toHaveLength(sent.length);
  });

  await openAccountMenu(page);
  await disconnectGarminButton(page).click();
  await dialog.getByRole("button", { name: "Delete workouts and disconnect" }).click();
  await expect(dialog).toBeHidden();
  expect(await garminWorkouts(garminUser)).toEqual([]);
  await expectGarminConnected(page, false);
});

test("sent runs are recorded in the account and can be deleted from Garmin", async ({ page }) => {
  const garminUser = uniqueGarminUser();
  await signIn(page, uniqueEmail("sender"));
  await connectGarmin(page, garminUser);
  await createWeek(page);

  await page.getByRole("button", { name: "Send week to Garmin" }).click();
  await expect(page.getByText(/^\d+ workouts? sent to Garmin\.$/)).toBeVisible();
  const sent = await garminWorkouts(garminUser);
  expect(sent.length).toBeGreaterThan(0);
  expect(sent.every((workout) => workout.date !== null)).toBe(true);

  await test.step("the sent state comes from the account, in a new tab", async () => {
    const other = await page.context().newPage();
    await other.goto("/planner");
    await expect(other.getByRole("button", { name: "Delete training week from Garmin" })).toBeVisible();
    await expect(other.getByRole("button", { name: "Send week to Garmin" })).toHaveCount(0);
    await other.close();
  });

  // Development allows one Garmin upload or delete per user every 10 seconds.
  await page.waitForTimeout(11_000);
  await page.getByRole("button", { name: "Delete training week from Garmin" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(`${sent.length} ${sent.length === 1 ? "workout" : "workouts"} removed from Garmin.`))
    .toBeVisible();
  expect(await garminWorkouts(garminUser)).toEqual([]);
  await expect(page.getByRole("button", { name: "Send week to Garmin" })).toBeVisible();
});

test("regenerating a week deletes its workouts from Garmin first", async ({ page }) => {
  const garminUser = uniqueGarminUser();
  await signIn(page, uniqueEmail("regenerate"));
  await connectGarmin(page, garminUser);
  await createWeek(page);
  await page.getByRole("button", { name: "Send week to Garmin" }).click();
  await expect(page.getByText(/^\d+ workouts? sent to Garmin\.$/)).toBeVisible();
  const sent = await garminWorkouts(garminUser);
  expect(sent.length).toBeGreaterThan(0);

  await page.locator("details summary").first().click();
  await page.getByLabel("Minutes", { exact: true }).fill("24");
  await page.getByRole("button", { name: "Save and regenerate week" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(
    `${sent.length} ${sent.length === 1 ? "workout" : "workouts"} of this week sent to Garmin Connect will be deleted from Garmin Connect first.`,
  )).toBeVisible();

  await test.step("a failed deletion keeps the week and its Garmin workouts", async () => {
    // Development allows one Garmin upload or delete per user every 10 seconds.
    await dialog.getByRole("button", { name: "Save and regenerate" }).click();
    await expect(dialog.getByRole("alert")).toContainText("The week was not regenerated");
    expect(await garminWorkouts(garminUser)).toHaveLength(sent.length);
  });

  await page.waitForTimeout(11_000);
  await dialog.getByRole("button", { name: "Save and regenerate" }).click();
  await expect(dialog).toBeHidden();
  expect(await garminWorkouts(garminUser)).toEqual([]);
  await expect(page.getByRole("button", { name: "Send week to Garmin" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete training week from Garmin" })).toHaveCount(0);
});
