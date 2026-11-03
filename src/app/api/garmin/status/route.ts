import { connection, NextResponse } from "next/server";
import { currentUserId } from "@/features/account/server/auth";
import { garminConfig } from "@/features/garmin/server/config";
import { countSentWorkouts, loadTokens } from "@/features/garmin/server/store";
import type { GarminStatusResponse } from "@/features/garmin/sync-request";
import { logGarminFailure, newRequestId } from "@/features/garmin/server/diagnostics";

export async function GET() {
  // Keep the framework's prerender interruption outside the application error boundary.
  await connection();
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "X-Request-ID": requestId };
  try {
    const config = garminConfig();
    const userId = config ? await currentUserId() : null;
    const connected = config !== null && userId !== null && await loadTokens(config, userId) !== null;
    const sentWorkouts = connected && userId ? await countSentWorkouts(userId) : 0;
    const status: GarminStatusResponse = { configured: config !== null, connected, sentWorkouts };
    return NextResponse.json(status, { headers });
  } catch (error) {
    logGarminFailure(requestId, "status", error);
    return NextResponse.json({ error: "failed" }, { status: 500, headers });
  }
}
