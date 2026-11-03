import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/features/account/server/auth";
import { clearAuthorization, isSameOrigin } from "@/features/garmin/server/session";
import { deleteConnection } from "@/features/garmin/server/store";
import { GarminApiError, logGarminFailure, newRequestId } from "@/features/garmin/server/diagnostics";

/**
 * Removes the Garmin tokens and sent-workout records from the account. Workouts already in Garmin
 * Connect stay there. Access can also be revoked in Garmin Connect settings.
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const headers = { "Cache-Control": "no-store", "X-Request-ID": requestId };
  try {
    if (!isSameOrigin(request)) {
      logGarminFailure(requestId, "disconnect", new GarminApiError("invalid_request"));
      return NextResponse.json({ error: "invalid" }, { status: 403, headers });
    }
    const userId = await currentUserId();
    if (userId) await deleteConnection(userId);
    const response = new NextResponse(null, { status: 204, headers });
    clearAuthorization(response, request);
    return response;
  } catch (error) {
    logGarminFailure(requestId, "disconnect", error);
    return NextResponse.json({ error: "failed" }, { status: 500, headers });
  }
}
