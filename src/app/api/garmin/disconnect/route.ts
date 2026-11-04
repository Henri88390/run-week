import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/features/account/server/auth";
import { garminConfig } from "@/features/garmin/server/config";
import { deleteWorkout } from "@/features/garmin/server/garmin-api";
import {
  failureDetails, GarminApiError, logGarminEvent, logGarminFailure, newRequestId, type GarminOperation,
} from "@/features/garmin/server/diagnostics";
import { clearAuthorization, isSameOrigin } from "@/features/garmin/server/session";
import { accessTokens, deleteConnection, forgetWorkout, loadTokens, sentWorkouts } from "@/features/garmin/server/store";
import type { GarminDisconnectResponse, GarminErrorCode } from "@/features/garmin/sync-request";

/**
 * Deletes the workouts sent from this account from Garmin Connect, then removes the Garmin tokens and
 * sent-workout records. When Garmin no longer accepts the authorization, the workouts cannot be deleted
 * and the account is disconnected anyway. Other failures keep the connection so the user can retry.
 * Access can also be revoked in Garmin Connect settings.
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  let deleted = 0;
  let remaining = 0;
  const json = (status: number, error?: GarminErrorCode) => {
    logGarminEvent(requestId, { event: "garmin_disconnect_result", status, code: error, deleted, remaining });
    return NextResponse.json(
      { deleted, remaining, error, requestId } satisfies GarminDisconnectResponse,
      { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  };
  let operation: GarminOperation = "validate";
  try {
    if (!isSameOrigin(request)) {
      logGarminFailure(requestId, operation, new GarminApiError("invalid_request"));
      return json(403, "invalid");
    }
    const userId = await currentUserId();
    if (!userId && request.headers.has("authorization")) return json(401, "reconnect");
    if (userId) {
      operation = "record";
      const sent = await sentWorkouts(userId);
      const config = garminConfig();
      const stored = sent.length > 0 && config ? await loadTokens(config, userId) : null;
      remaining = sent.length;
      if (config && stored) {
        try {
          operation = "refresh";
          const tokens = await accessTokens(config, userId, stored);
          for (const { date, workoutId } of sent) {
            operation = "delete";
            logGarminEvent(requestId, { event: "garmin_api_request", operation, payload: { workoutId } });
            await deleteWorkout(tokens.accessToken, workoutId);
            operation = "record";
            await forgetWorkout(userId, date);
            deleted++;
            remaining--;
          }
        } catch (caught) {
          logGarminFailure(requestId, operation, caught, deleted);
          const { code } = failureDetails(caught);
          // Without a valid authorization the workouts can never be deleted; anything else may succeed later.
          if (code !== "reconnect" && code !== "permission") return json(502, code);
        }
      }
      operation = "disconnect";
      await deleteConnection(userId);
    }
    const response = json(200);
    clearAuthorization(response, request);
    return response;
  } catch (caught) {
    logGarminFailure(requestId, operation, caught, deleted);
    return json(500, "failed");
  }
}
