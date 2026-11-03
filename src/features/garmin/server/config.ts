import "server-only";

export type GarminConfig = {
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  redirectUri: string | null;
};

/** Returns null when Garmin Connect is not configured; the app then hides the integration. */
export function garminConfig(): GarminConfig | null {
  const clientId = process.env.GARMIN_CLIENT_ID?.trim();
  const clientSecret = process.env.GARMIN_CLIENT_SECRET?.trim();
  const sessionSecret = process.env.GARMIN_SESSION_SECRET?.trim();
  const redirectUri = process.env.GARMIN_REDIRECT_URI?.trim() || null;
  if (!clientId || !clientSecret || !sessionSecret || sessionSecret.length < 32) return null;
  if (redirectUri) {
    try {
      const url = new URL(redirectUri);
      const isLoopback = url.hostname === "localhost" || url.hostname.endsWith(".localhost")
        || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
      if ((url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback))
        || url.username || url.password || url.hash) return null;
    } catch {
      return null;
    }
  }
  return { clientId, clientSecret, sessionSecret, redirectUri };
}
