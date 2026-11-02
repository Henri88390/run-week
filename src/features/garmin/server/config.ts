import "server-only";

export type GarminConfig = {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  redirectUri: string | null;
};

/** Returns null when Garmin Connect is not configured; the app then hides the integration. */
export function garminConfig(): GarminConfig | null {
  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  const sessionSecret = process.env.GARMIN_SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret || sessionSecret.length < 32) return null;
  return { clientId, clientSecret, sessionSecret, redirectUri: process.env.GARMIN_REDIRECT_URI || null };
}
