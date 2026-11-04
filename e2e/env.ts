export const APP_PORT = 3100;
export const GARMIN_MOCK_PORT = 3101;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const GARMIN_MOCK_ORIGIN = `http://127.0.0.1:${GARMIN_MOCK_PORT}`;
export const AUTH_SECRET = "e2e-auth-secret-not-for-production-0123456789";
export const GARMIN_CLIENT_ID = "e2e-client";
export const GARMIN_CLIENT_SECRET = "e2e-client-secret";

/** Throwaway PostgreSQL container, created by global setup and removed by global teardown. */
export const DB_CONTAINER = "run-week-e2e-db";
export const DB_IMAGE = "postgres:17-alpine";
export const DB_PORT = 55432;
export const DATABASE_URL = `postgresql://run_week:run_week@127.0.0.1:${DB_PORT}/run_week_e2e`;
export const REDIS_CONTAINER = "run-week-e2e-cache";
export const REDIS_PORT = 56379;
export const REDIS_URL = `redis://127.0.0.1:${REDIS_PORT}`;
