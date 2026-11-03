import { NextResponse, type NextRequest } from "next/server";
import { clearAuthorization, clearSession, isSameOrigin } from "@/features/garmin/server/session";
import { GarminApiError, logGarminFailure, newRequestId } from "@/features/garmin/server/diagnostics";

/** Forgets the Garmin tokens in this browser. Access can also be revoked in Garmin Connect settings. */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "X-Request-ID": requestId };
  try {
    if (!isSameOrigin(request)) {
      logGarminFailure(requestId, "disconnect", new GarminApiError("invalid_request"));
      return NextResponse.json({ error: "invalid" }, { status: 403, headers });
    }
    const response = new NextResponse(null, { status: 204, headers });
    clearSession(response, request);
    clearAuthorization(response, request);
    return response;
  } catch (error) {
    logGarminFailure(requestId, "disconnect", error);
    return NextResponse.json({ error: "failed" }, { status: 500, headers });
  }
}
