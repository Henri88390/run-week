/*
 * Mock of the Garmin endpoints: authorization page, OAuth token, user ID and Training API.
 * The authorization page signs in as the Garmin user named in the browser's `garmin_e2e_user`
 * cookie (set per test context). The user is then carried in the authorization code
 * ("code-<user>") and the tokens.
 */
import http from "node:http";

const port = Number(process.env.GARMIN_MOCK_PORT ?? 3101);
const clientId = process.env.GARMIN_CLIENT_ID ?? "e2e-client";
const clientSecret = process.env.GARMIN_CLIENT_SECRET ?? "e2e-client-secret";
/** workoutId -> { user, date } */
const workouts = new Map();
let nextWorkoutId = 1000;

function cookie(request, name) {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function tokens(user) {
  return {
    access_token: `access-${user}`,
    refresh_token: `refresh-${user}`,
    expires_in: 3600,
    refresh_token_expires_in: 90 * 24 * 3600,
  };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const { pathname } = url;

  if (pathname === "/health") return send(response, 200, { ok: true });

  if (pathname === "/oauth2Confirm" && request.method === "GET") {
    const authorizeAs = cookie(request, "garmin_e2e_user");
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    const valid = url.searchParams.get("client_id") === clientId && url.searchParams.get("response_type") === "code"
      && url.searchParams.get("code_challenge") && url.searchParams.get("code_challenge_method") === "S256";
    if (!authorizeAs || !redirectUri || !state || !valid) return send(response, 400, { error: "invalid_request" });
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", `code-${authorizeAs}`);
    callback.searchParams.set("state", state);
    response.writeHead(302, { Location: callback.toString(), "Cache-Control": "no-store" });
    return response.end();
  }

  if (pathname === "/__workouts" && request.method === "GET") {
    const user = url.searchParams.get("user");
    const list = [...workouts].filter(([, workout]) => workout.user === user)
      .map(([workoutId, workout]) => ({ workoutId, date: workout.date }));
    return send(response, 200, list);
  }

  if (pathname === "/di-oauth2-service/oauth/token" && request.method === "POST") {
    const form = new URLSearchParams(await readBody(request));
    if (form.get("client_id") !== clientId || form.get("client_secret") !== clientSecret) {
      return send(response, 401, { error: "invalid_client" });
    }
    if (form.get("grant_type") === "authorization_code") {
      const code = form.get("code") ?? "";
      if (!code.startsWith("code-") || !form.get("code_verifier") || !form.get("redirect_uri")) {
        return send(response, 400, { error: "invalid_grant" });
      }
      return send(response, 200, tokens(code.slice("code-".length)));
    }
    if (form.get("grant_type") === "refresh_token") {
      const refreshToken = form.get("refresh_token") ?? "";
      if (!refreshToken.startsWith("refresh-")) return send(response, 400, { error: "invalid_grant" });
      return send(response, 200, tokens(refreshToken.slice("refresh-".length)));
    }
    return send(response, 400, { error: "unsupported_grant_type" });
  }

  const user = /^Bearer access-(.+)$/.exec(request.headers.authorization ?? "")?.[1];
  if (!user) return send(response, 401, { error: "unauthorized" });

  if (pathname === "/wellness-api/rest/user/id" && request.method === "GET") {
    return send(response, 200, { userId: user });
  }
  if (pathname === "/training-api/workout" && request.method === "POST") {
    const workoutId = nextWorkoutId++;
    workouts.set(workoutId, { user, date: null });
    return send(response, 200, { workoutId });
  }
  if (pathname === "/training-api/schedule" && request.method === "POST") {
    const { workoutId, date } = JSON.parse(await readBody(request));
    const workout = workouts.get(workoutId);
    if (!workout || workout.user !== user) return send(response, 404, { error: "not_found" });
    workout.date = date;
    return send(response, 200, workoutId);
  }
  const deleteMatch = /^\/training-api\/workout\/(\d+)$/.exec(pathname);
  if (deleteMatch && request.method === "DELETE") {
    const workoutId = Number(deleteMatch[1]);
    const workout = workouts.get(workoutId);
    if (!workout || workout.user !== user) return send(response, 404, { error: "not_found" });
    workouts.delete(workoutId);
    return send(response, 204);
  }
  return send(response, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1", () => console.log(`Garmin mock listening on http://127.0.0.1:${port}`));
