import { NextResponse, type NextRequest } from "next/server";
import { garminConfig } from "@/features/garmin/server/config";
import { createWorkout, deleteWorkout, scheduleWorkout } from "@/features/garmin/server/garmin-api";
import {
  failureDetails, GarminApiError, logGarminEvent, logGarminFailure, newRequestId, type GarminOperation,
} from "@/features/garmin/server/diagnostics";
import { clearSession, freshTokens, isSameOrigin, readSession, writeSession } from "@/features/garmin/server/session";
import { garminWorkoutPayload } from "@/features/garmin/server/workout-payload";
import { reserveUpload } from "@/features/garmin/server/upload-rate-limit";
import {
  garminSyncRequestSchema, type GarminErrorCode, type GarminSyncResponse,
} from "@/features/garmin/sync-request";
import { addDays, mondayOf } from "@/features/running-programs/domain";

/** Creates and schedules runs sequentially. Never retries mutations with uncertain outcomes. */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const results: GarminSyncResponse["results"] = [];
  const json = (error?: GarminErrorCode, status = 200, retryAfterSeconds?: number) => {
    logGarminEvent(requestId, {
      event: "garmin_upload_result", status, code: error, completed: results.length, results,
    });
    return NextResponse.json(
      { results, error, requestId, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) } satisfies GarminSyncResponse,
      { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId,
        ...(retryAfterSeconds !== undefined ? { "Retry-After": String(retryAfterSeconds) } : {}) } },
    );
  };
  const reject = (category: "invalid_request" | "configuration" | "auth", status: number) => {
    const error = new GarminApiError(category);
    logGarminFailure(requestId, "validate", error, results.length);
    return json(failureDetails(error).code, status);
  };
  let operation: GarminOperation = "validate";
  try {
    if (!isSameOrigin(request)) return reject("invalid_request", 403);
    const config = garminConfig();
    if (!config) return reject("configuration", 503);
    const session = readSession(request, config);
    if (!session) return reject("auth", 401);

    const body: unknown = await request.json().catch(() => null);
    logGarminEvent(requestId, { event: "garmin_upload_request", payload: body });
    const parsed = garminSyncRequestSchema.safeParse(body);
    const weekStart = parsed.success ? parsed.data.weekStart : "";
    if (!parsed.success || mondayOf(new Date(`${weekStart}T12:00:00`)) !== weekStart
      || new Set(parsed.data.workouts.map((workout) => workout.day)).size !== parsed.data.workouts.length) {
      return reject("invalid_request", 400);
    }

    operation = "rateLimit";
    const reservation = await reserveUpload(config, session);
    if (!reservation.allowed) {
      logGarminFailure(requestId, operation, new GarminApiError("rate_limit"), 0);
      return json("rateLimited", 429, reservation.retryAfterSeconds);
    }

    let tokens = session;
    let refreshed = false;
    let error: GarminErrorCode | undefined;
    try {
      operation = "refresh";
      ({ tokens, refreshed } = await freshTokens(config, session));
      for (const { previousWorkoutId, ...workout } of parsed.data.workouts) {
        const date = addDays(weekStart, workout.day);
        operation = "replace";
        if (previousWorkoutId) {
          logGarminEvent(requestId, { event: "garmin_api_request", operation, payload: { workoutId: previousWorkoutId } });
          await deleteWorkout(tokens.accessToken, previousWorkoutId);
        }
        operation = "create";
        const garminPayload = garminWorkoutPayload(workout, parsed.data.vdot, parsed.data.locale);
        logGarminEvent(requestId, { event: "garmin_api_request", operation, payload: garminPayload });
        const workoutId = await createWorkout(tokens.accessToken, garminPayload);
        logGarminEvent(requestId, { event: "garmin_api_response", operation, workoutId });
        operation = "schedule";
        try {
          logGarminEvent(requestId, { event: "garmin_api_request", operation, payload: { workoutId, date } });
          await scheduleWorkout(tokens.accessToken, workoutId, date);
        } catch (scheduleError) {
          try {
            logGarminEvent(requestId, { event: "garmin_api_request", operation: "cleanup", payload: { workoutId } });
            await deleteWorkout(tokens.accessToken, workoutId);
          } catch (cleanupError) {
            logGarminFailure(requestId, "cleanup", cleanupError, results.length);
          }
          throw scheduleError;
        }
        results.push({ day: workout.day, date, workoutId });
      }
    } catch (caught) {
      logGarminFailure(requestId, operation, caught, results.length);
      error = failureDetails(caught).code;
    }

    operation = "upload";
    const response = json(error, error === "reconnect" ? 401 : operationStatus(error, results.length));
    if (error === "reconnect") clearSession(response, request);
    else if (refreshed) writeSession(response, request, config, tokens);
    return response;
  } catch (caught) {
    logGarminFailure(requestId, operation, caught, results.length);
    if (operation === "rateLimit") return json("unavailable", 503);
    return json("failed", 500);
  }
}

function operationStatus(error: GarminErrorCode | undefined, completed: number): number {
  if (!error || completed > 0) return 200;
  if (error === "permission") return 403;
  if (error === "rateLimited") return 429;
  if (error === "unavailable") return 503;
  if (error === "failed") return 500;
  return 502;
}
