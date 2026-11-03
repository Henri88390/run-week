import { defineConfig, devices } from "@playwright/test";
import {
  APP_PORT, APP_URL, AUTH_SECRET, DATABASE_URL, GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET, GARMIN_MOCK_ORIGIN,
  GARMIN_MOCK_PORT,
} from "./e2e/env";

const databaseUrl = DATABASE_URL;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Tests share one database and dev server.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: APP_URL,
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/garmin-mock.mjs",
      url: `${GARMIN_MOCK_ORIGIN}/health`,
      reuseExistingServer: false,
      env: {
        GARMIN_MOCK_PORT: String(GARMIN_MOCK_PORT),
        GARMIN_CLIENT_ID,
        GARMIN_CLIENT_SECRET,
      },
    },
    {
      // A separate build directory lets this server run next to `npm run dev`.
      command: `node node_modules/next/dist/bin/next dev --port ${APP_PORT}`,
      url: `${APP_URL}/signin`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        AUTH_SECRET,
        AUTH_TRUST_HOST: "true",
        AUTH_URL: APP_URL,
        NEXTAUTH_URL: APP_URL,
        // Empty keys disable email delivery (codes are logged) and Google sign-in.
        AUTH_RESEND_KEY: "",
        AUTH_GOOGLE_ID: "",
        AUTH_GOOGLE_SECRET: "",
        GARMIN_CLIENT_ID,
        GARMIN_CLIENT_SECRET,
        GARMIN_SESSION_SECRET: "e2e-garmin-session-secret-0123456789abcdef",
        GARMIN_REDIRECT_URI: "",
        GARMIN_E2E_MOCK_ORIGIN: GARMIN_MOCK_ORIGIN,
        PRIVACY_HOSTING_PROVIDER: "E2E test host",
        UPSTASH_REDIS_REST_URL: "",
        UPSTASH_REDIS_REST_TOKEN: "",
      },
    },
  ],
});
