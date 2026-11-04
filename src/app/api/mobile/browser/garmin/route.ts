import { NextResponse, type NextRequest } from "next/server";
import { POST as connect } from "@/app/api/garmin/connect/route";
import { NO_STORE, isSameOrigin } from "@/features/account/server/http";
import { withRequestUser } from "@/features/account/server/request-user";
import { finishBrowser, mobileGarminBrowser } from "@/features/mobile/server/browser";

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
    const ticket = await mobileGarminBrowser();
    if (!ticket?.value.userId) return NextResponse.json({ error: "expired" }, { status: 401, headers: NO_STORE });
    const response = await withRequestUser(ticket.value.userId, () => connect(request));
    const location = response.headers.get("location");
    // Configuration/consent failures return through the app too, rather than stranding its browser.
    if (location && new URL(location).origin === request.nextUrl.origin) {
      const result = new URL(location).searchParams.get("garmin") ?? "error";
      return await finishBrowser(request, result) ?? response;
    }
    return response;
  } catch (error) {
    console.error("mobile_garmin_start_failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
