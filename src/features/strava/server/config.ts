import "server-only";

export function stravaConfig() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const encryptionKey = process.env.STRAVA_TOKEN_ENCRYPTION_KEY;
  const redirectUri = process.env.STRAVA_REDIRECT_URI ?? "https://run-week.fyi/api/strava/callback";
  if (!clientId || !/^\d+$/.test(clientId) || !clientSecret || !encryptionKey || encryptionKey.length < 32) throw new Error("Strava configuration unavailable");
  const url = new URL(redirectUri);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost" && process.env.NODE_ENV !== "production"))
    || url.pathname !== "/api/strava/callback" || url.search || url.hash || url.username || url.password) throw new Error("Strava configuration unavailable");
  return { clientId, clientSecret, encryptionKey, redirectUri };
}
export type StravaConfig = ReturnType<typeof stravaConfig>;

/** Local synthetic E2E server only; never usable in a production deployment. */
export function stravaOrigin() {
  const mock = process.env.NODE_ENV === "development" ? process.env.STRAVA_E2E_MOCK_ORIGIN : undefined;
  if (!mock) return "https://www.strava.com";
  const url = new URL(mock);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid Strava mock origin");
  return url.origin;
}
