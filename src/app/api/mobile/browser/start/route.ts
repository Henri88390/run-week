import { connection, NextResponse, type NextRequest } from "next/server";
import { startBrowser } from "@/features/mobile/server/browser";
import { NO_STORE } from "@/features/account/server/http";

export async function GET(request: NextRequest) {
  await connection();
  try {
    return await startBrowser(request);
  } catch (error) {
    console.error("mobile_browser_start_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
