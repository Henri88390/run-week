import { connection, NextResponse, type NextRequest } from "next/server";
import { garminConfig } from "@/features/garmin/server/config";
import { readSession, SESSION_COOKIE } from "@/features/garmin/server/session";
import type { GarminStatus } from "@/features/garmin/sync-request";
import { GarminApiError, logGarminFailure, newRequestId } from "@/features/garmin/server/diagnostics";

export async function GET(request: NextRequest) {
  // Keep the framework's prerender interruption outside the application error boundary.
  await connection();
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "X-Request-ID": requestId };
  try {
    const config = garminConfig();
    const connected = config !== null && readSession(request, config) !== null;
    if (config && !connected && request.cookies.has(SESSION_COOKIE)) {
      logGarminFailure(requestId, "status", new GarminApiError("auth"));
    }
    const status: GarminStatus = { configured: config !== null, connected };
    return NextResponse.json(status, { headers });
  } catch (error) {
    logGarminFailure(requestId, "status", error);
    return NextResponse.json({ error: "failed" }, { status: 500, headers });
  }
}
