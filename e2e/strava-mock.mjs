// Synthetic activities only. Never reads environment files or real activity datasets.
import http from "node:http";
const calls = [];
const controls = { rate: false, delay: 0, tokenDelay: 0, history: false, latest: false };
let nextAthlete = 5000;
const codes = new Map();
const tokenAthletes = new Map();
const rotations = new Map();
function send(response, status, value, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  response.end(JSON.stringify(value));
}
async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}
function tokens(athlete, expired = false) {
  const version = (rotations.get(athlete) ?? 0) + 1;
  rotations.set(athlete, version);
  const access = `synthetic-access-${athlete}-${version}`;
  const refresh = `synthetic-refresh-${athlete}-${version}`;
  tokenAthletes.set(access, athlete);
  tokenAthletes.set(refresh, athlete);
  return { access_token: access, refresh_token: refresh, expires_at: Math.floor(Date.now() / 1000) + (expired ? -1 : 3600), athlete: { id: athlete } };
}
http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:3102");
  if (url.pathname === "/health") return send(response, 200, { ok: true });
  if (url.pathname === "/__control") {
    if (request.method === "POST") Object.assign(controls, JSON.parse(await body(request)));
    return send(response, 200, { controls, calls });
  }
  if (url.pathname === "/oauth/authorize") {
    if (url.searchParams.has("code_challenge") || url.searchParams.get("scope") !== "read,activity:read_all") return send(response, 400, {});
    const cookie = /strava_e2e_athlete=(\d+)/.exec(request.headers.cookie ?? "");
    const athlete = cookie ? Number(cookie[1]) : nextAthlete++;
    const code = `code-${athlete}-${codes.size}`;
    codes.set(code, athlete);
    const callback = new URL(url.searchParams.get("redirect_uri"));
    callback.searchParams.set("state", url.searchParams.get("state"));
    callback.searchParams.set("scope", "read,activity:read_all");
    callback.searchParams.set("code", code);
    response.writeHead(302, { Location: callback.toString() }); return response.end();
  }
  if (url.pathname === "/oauth/token") {
    const form = new URLSearchParams(await body(request));
    if (form.get("client_id") !== "1234" || form.get("client_secret") !== "e2e-strava-client-secret") return send(response, 401, {});
    const grant = form.get("grant_type");
    const athlete = grant === "authorization_code" ? codes.get(form.get("code")) : tokenAthletes.get(form.get("refresh_token"));
    if (!athlete) return send(response, 401, {});
    if (grant === "authorization_code") codes.delete(form.get("code"));
    calls.push({ path: url.pathname, athlete, grant });
    if (controls.tokenDelay) await new Promise((resolve) => setTimeout(resolve, controls.tokenDelay));
    return send(response, 200, tokens(athlete, grant === "authorization_code"));
  }
  const access = (request.headers.authorization ?? "").replace("Bearer ", "");
  const athlete = tokenAthletes.get(access);
  if (!athlete) return send(response, 401, {});
  calls.push({ path: url.pathname, athlete, query: Object.fromEntries(url.searchParams) });
  if (controls.rate) return send(response, 429, {}, { "X-ReadRateLimit-Limit": "100,1000", "X-ReadRateLimit-Usage": "100,200", "Retry-After": "5" });
  if (url.pathname === "/api/v3/athlete/activities") {
    const page = Number(url.searchParams.get("page"));
    const month = new Date().toISOString().slice(0, 7);
    const records = Array.from({ length: 22 }, (_, i) => {
      const elapsed = [120, 300, 600][i] ?? 1200 + i;
      return {
        id: athlete * 100 + i + 1, name: `Synthetic run ${i + 1}`, sport_type: i === 21 ? "Ride" : "Run", type: i === 21 ? "Ride" : "Run",
        start_date: `${month}-${String(Math.min(i + 1, 28)).padStart(2, "0")}T10:00:00Z`,
        start_date_local: `${month}-${String(Math.min(i + 1, 28)).padStart(2, "0")}T11:00:00Z`,
        elapsed_time: elapsed, moving_time: elapsed - 1, distance: 4 * elapsed + 200,
        ...(i !== 2 ? { average_heartrate: 155, max_heartrate: 180 } : {}),
      };
    });
    for (const [enabled, offset, name, started] of [
      [controls.history, 90, "Historical run", `${new Date().getUTCFullYear() - 2}-06-01T10:00:00Z`],
      [controls.latest, 91, "Newly synchronized run", new Date(Date.now() - 60_000).toISOString()],
    ]) {
      if (enabled) records.push({ id: athlete * 100 + offset, name, sport_type: "Run", type: "Run",
        start_date: started, start_date_local: started, elapsed_time: 1800, moving_time: 1790, distance: 5000,
        average_heartrate: 150, max_heartrate: 180 });
    }
    const filtered = records.filter((a) => Date.parse(a.start_date) / 1000 > Number(url.searchParams.get("after"))
      && Date.parse(a.start_date) / 1000 < Number(url.searchParams.get("before")));
    // Use historical dates early in the current month even when the test runs on day one.
    // Tests can set a future syncBefore in their throwaway DB to exercise two pages.
    const pageSize = Number(url.searchParams.get("per_page"));
    return send(response, 200, filtered.slice((page - 1) * pageSize, page * pageSize));
  }
  const stream = /^\/api\/v3\/activities\/(\d+)\/streams$/.exec(url.pathname);
  if (stream) {
    if (Number(stream[1]) < athlete * 100 || Number(stream[1]) >= (athlete + 1) * 100) return send(response, 404, {});
    if (controls.delay) await new Promise((resolve) => setTimeout(resolve, controls.delay));
    if (Number(stream[1]) % 100 === 4) return send(response, 404, {});
    return send(response, 200, {
      time: { data: [0, 5, 10, 40, 45] },
      ...(Number(stream[1]) % 100 !== 3 ? { heartrate: { data: [140, 160, null, 170, 170] } } : {}),
      velocity_smooth: { data: [3, 4, 4, 3, 0.003] }, distance: { data: [0, 15, 35, 100, 115] },
    }, { "X-RateLimit-Limit": "200,2000", "X-RateLimit-Usage": "1,1" });
  }
  return send(response, 404, {});
}).listen(3102, "127.0.0.1", () => console.log("Synthetic Strava mock on 127.0.0.1:3102"));
