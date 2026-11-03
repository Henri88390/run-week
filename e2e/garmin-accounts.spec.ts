import { expect, test } from "@playwright/test";
import {
  connectGarmin, connectGarminLink, createWeek, disconnectGarmin, disconnectGarminButton, garminWorkouts,
  signIn, signOut, uniqueEmail, uniqueGarminUser,
} from "./helpers";

const ALREADY_LINKED = "This Garmin Connect account is already connected to another Run Week account.";

test("Garmin controls are available only to signed-in users", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create training week" })).toBeVisible();
  await expect(connectGarminLink(page)).toHaveCount(0);

  await page.goto("/garmin/consent");
  await expect(page.getByRole("alert").filter({ hasText: "Sign in to connect Garmin." })).toBeVisible();
  await expect(page.getByRole("checkbox")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Agree and continue to Garmin" })).toBeDisabled();
});

test("a Garmin account can be connected to only one user account", async ({ page }) => {
  const garminUser = uniqueGarminUser();
  const first = uniqueEmail("first");
  const second = uniqueEmail("second");

  await test.step("first user connects the Garmin account", async () => {
    await signIn(page, first);
    await connectGarmin(page, garminUser);
    await expect(disconnectGarminButton(page)).toBeVisible();
    await signOut(page);
  });

  await test.step("second user cannot connect the same Garmin account", async () => {
    await signIn(page, second);
    await connectGarmin(page, garminUser);
    await expect(page.getByRole("alert").filter({ hasText: ALREADY_LINKED })).toBeVisible();
    await expect(disconnectGarminButton(page)).toHaveCount(0);
    await expect(connectGarminLink(page)).toBeVisible();
    await signOut(page);
  });

  await test.step("first user is still connected and disconnects Garmin", async () => {
    await signIn(page, first);
    await expect(disconnectGarminButton(page)).toBeVisible();
    await disconnectGarmin(page);
    await signOut(page);
  });

  await test.step("second user can now connect the Garmin account", async () => {
    await signIn(page, second);
    await connectGarmin(page, garminUser);
    await expect(disconnectGarminButton(page)).toBeVisible();
    await page.reload();
    await expect(disconnectGarminButton(page)).toBeVisible();
  });
});

test("a user can reconnect the same Garmin account after disconnecting", async ({ page }) => {
  const garminUser = uniqueGarminUser();
  await signIn(page, uniqueEmail("reconnect"));
  await connectGarmin(page, garminUser);
  await expect(disconnectGarminButton(page)).toBeVisible();
  await disconnectGarmin(page);
  await connectGarmin(page, garminUser);
  await expect(disconnectGarminButton(page)).toBeVisible();
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
    await other.goto("/");
    await expect(other.getByRole("button", { name: "Delete training week from Garmin" })).toBeVisible();
    await expect(other.getByRole("button", { name: "Send week to Garmin" })).toHaveCount(0);
    await other.close();
  });

  // Without Upstash, development allows one Garmin upload or delete per user every 10 seconds.
  await page.waitForTimeout(11_000);
  await page.getByRole("button", { name: "Delete training week from Garmin" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText(`${sent.length} ${sent.length === 1 ? "workout" : "workouts"} removed from Garmin.`))
    .toBeVisible();
  expect(await garminWorkouts(garminUser)).toEqual([]);
  await expect(page.getByRole("button", { name: "Send week to Garmin" })).toBeVisible();
});
