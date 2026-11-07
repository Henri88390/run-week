import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/** Regenerates docs/screenshots with synthetic data, using the e2e database, mocks and dev server. */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: "screenshots.spec.ts",
  timeout: 600_000,
  reporter: "list",
});
