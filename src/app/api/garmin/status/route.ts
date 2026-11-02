import { connection, NextResponse, type NextRequest } from "next/server";
import { garminConfig } from "@/features/garmin/server/config";
import { readSession } from "@/features/garmin/server/session";
import type { GarminStatus } from "@/features/garmin/sync-request";

export async function GET(request: NextRequest) {
  // Configuration and cookies are read per request; never prerender.
  await connection();
  const config = garminConfig();
  const status: GarminStatus = { configured: config !== null, connected: config !== null && readSession(request, config) !== null };
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
