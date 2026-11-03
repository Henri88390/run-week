import { connection, NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/features/account/server/auth";
import { garminConfig } from "@/features/garmin/server/config";
import { createWorkout, deleteWorkout, scheduleWorkout } from "@/features/garmin/server/garmin-api";
import {
  failureDetails, GarminApiError, logGarminEvent, logGarminFailure, newRequestId, type GarminOperation,
} from "@/features/garmin/server/diagnostics";
import { freshTokens, isSameOrigin } from "@/features/garmin/server/session";
import {
  forgetTokens, forgetWorkout, loadTokens, recordWorkout, sentWorkouts, updateTokens,
} from "@/features/garmin/server/store";
import { garminWorkoutPayload } from "@/features/garmin/server/workout-payload";
import { reserveUpload } from "@/features/garmin/server/upload-rate-limit";
import type { GarminConfig } from "@/features/garmin/server/config";
import type { GarminTokens } from "@/features/garmin/server/garmin-api";
import {
  garminDeleteRequestSchema, garminSyncRequestSchema,
  type GarminDeleteResponse, type GarminErrorCode, type GarminSentResponse, type GarminSyncResponse,
} from "@/features/garmin/sync-request";
import { addDays, mondayOf } from "@/features/running-programs/domain";

function isWeekStart(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) && mondayOf(new Date(`${value}T12:00:00`)) === value;
}

async function accessTokens(config: GarminConfig, userId: string, stored: GarminTokens): Promise<GarminTokens> {
  const { tokens, refreshed } = await freshTokens(config, stored);
  if (refreshed) await updateTokens(config, userId, tokens);
  return tokens;
}

/** Lists which days of one week hold a workout sent from the signed-in account. */
export async function GET(request: NextRequest) {
  // Keep the framework's prerender interruption outside the application error boundary.
  await connection();
  const requestId = newRequestId();
  const json = (body: Omit<GarminSentResponse, "requestId">, status = 200) => NextResponse.json(
    { ...body, requestId } satisfies GarminSentResponse,
    { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
  );
  try {
    if (!garminConfig()) return json({ dates: [], error: "unavailable" }, 503);
    const userId = await currentUserId();
    if (!userId) return json({ dates: [], error: "reconnect" }, 401);
    const weekStart = request.nextUrl.searchParams.get("weekStart");
    if (!isWeekStart(weekStart)) {
      logGarminFailure(requestId, "validate", new GarminApiError("invalid_request"));
      return json({ dates: [], error: "invalid" }, 400);
    }
    const sent = await sentWorkouts(userId, Array.from({ length: 7 }, (_, day) => addDays(weekStart, day)));
    return json({ dates: sent.map((workout) => workout.date) });
  } catch (caught) {
    logGarminFailure(requestId, "status", caught);
    return json({ dates: [], error: "failed" }, 500);
  }
}

/**
 * Creates and schedules runs sequentially, skipping days that already hold a workout sent from this
 * account. Never retries mutations with uncertain outcomes.
 */
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
    const userId = await currentUserId();
    if (!userId) return reject("auth", 401);
    const stored = await loadTokens(config, userId);
    if (!stored) return reject("auth", 401);

    const body: unknown = await request.json().catch(() => null);
    logGarminEvent(requestId, { event: "garmin_upload_request", payload: body });
    const parsed = garminSyncRequestSchema.safeParse(body);
    const weekStart = parsed.success ? parsed.data.weekStart : "";
    if (!parsed.success || mondayOf(new Date(`${weekStart}T12:00:00`)) !== weekStart
      || new Set(parsed.data.workouts.map((workout) => workout.day)).size !== parsed.data.workouts.length) {
      return reject("invalid_request", 400);
    }

    operation = "rateLimit";
    const reservation = await reserveUpload(config, userId);
    if (!reservation.allowed) {
      logGarminFailure(requestId, operation, new GarminApiError("rate_limit"), 0);
      return json("rateLimited", 429, reservation.retryAfterSeconds);
    }

    let error: GarminErrorCode | undefined;
    try {
      operation = "refresh";
      const tokens = await accessTokens(config, userId, stored);
      const cleanup = async (workoutId: number) => {
        try {
          logGarminEvent(requestId, { event: "garmin_api_request", operation: "cleanup", payload: { workoutId } });
          await deleteWorkout(tokens.accessToken, workoutId);
        } catch (cleanupError) {
          logGarminFailure(requestId, "cleanup", cleanupError, results.length);
        }
      };
      operation = "record";
      const dates = parsed.data.workouts.map((workout) => addDays(weekStart, workout.day));
      const alreadySent = new Set((await sentWorkouts(userId, dates)).map((workout) => workout.date));
      for (const workout of parsed.data.workouts) {
        const date = addDays(weekStart, workout.day);
        if (alreadySent.has(date)) {
          results.push({ day: workout.day, date, existing: true });
          continue;
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
          await cleanup(workoutId);
          throw scheduleError;
        }
        operation = "record";
        let recorded: Awaited<ReturnType<typeof recordWorkout>>;
        try {
          recorded = await recordWorkout(userId, date, workoutId);
        } catch (recordError) {
          await cleanup(workoutId);
          throw recordError;
        }
        if (recorded) {
          // A concurrent request sent this day first; remove the duplicate just created.
          await cleanup(workoutId);
          results.push({ day: workout.day, date, existing: true });
        } else {
          results.push({ day: workout.day, date });
        }
      }
    } catch (caught) {
      logGarminFailure(requestId, operation, caught, results.length);
      error = failureDetails(caught).code;
    }

    operation = "upload";
    if (error === "reconnect") await forgetTokens(userId);
    return json(error, error === "reconnect" ? 401 : operationStatus(error, results.length));
  } catch (caught) {
    logGarminFailure(requestId, operation, caught, results.length);
    if (operation === "rateLimit") return json("unavailable", 503);
    return json("failed", 500);
  }
}

/**
 * Deletes the workouts sent from this account on the given days. Garmin Connect does not let users
 * delete partner workouts. Workout IDs come from the database, never from the request.
 */
export async function DELETE(request: NextRequest) {
  const requestId = newRequestId();
  const deleted: string[] = [];
  const json = (error?: GarminErrorCode, status = 200, retryAfterSeconds?: number) => {
    logGarminEvent(requestId, { event: "garmin_delete_result", status, code: error, deleted });
    return NextResponse.json(
      { deleted, error, requestId, ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) } satisfies GarminDeleteResponse,
      { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId,
        ...(retryAfterSeconds !== undefined ? { "Retry-After": String(retryAfterSeconds) } : {}) } },
    );
  };
  const reject = (category: "invalid_request" | "configuration" | "auth", status: number) => {
    const error = new GarminApiError(category);
    logGarminFailure(requestId, "validate", error, 0);
    return json(failureDetails(error).code, status);
  };
  let operation: GarminOperation = "validate";
  try {
    if (!isSameOrigin(request)) return reject("invalid_request", 403);
    const config = garminConfig();
    if (!config) return reject("configuration", 503);
    const userId = await currentUserId();
    if (!userId) return reject("auth", 401);
    const stored = await loadTokens(config, userId);
    if (!stored) return reject("auth", 401);

    const body: unknown = await request.json().catch(() => null);
    logGarminEvent(requestId, { event: "garmin_delete_request", payload: body });
    const parsed = garminDeleteRequestSchema.safeParse(body);
    if (!parsed.success) return reject("invalid_request", 400);

    operation = "rateLimit";
    const reservation = await reserveUpload(config, userId);
    if (!reservation.allowed) {
      logGarminFailure(requestId, operation, new GarminApiError("rate_limit"), 0);
      return json("rateLimited", 429, reservation.retryAfterSeconds);
    }

    let error: GarminErrorCode | undefined;
    try {
      operation = "record";
      const sent = await sentWorkouts(userId, parsed.data.dates);
      const recorded = new Set(sent.map((workout) => workout.date));
      // Days without a record hold nothing from this account.
      deleted.push(...parsed.data.dates.filter((date) => !recorded.has(date)));
      if (sent.length > 0) {
        operation = "refresh";
        const tokens = await accessTokens(config, userId, stored);
        for (const { date, workoutId } of sent) {
          operation = "delete";
          logGarminEvent(requestId, { event: "garmin_api_request", operation, payload: { workoutId } });
          await deleteWorkout(tokens.accessToken, workoutId);
          operation = "record";
          await forgetWorkout(userId, date);
          deleted.push(date);
        }
      }
    } catch (caught) {
      logGarminFailure(requestId, operation, caught, deleted.length);
      error = failureDetails(caught).code;
    }

    if (error === "reconnect") await forgetTokens(userId);
    return json(error, error === "reconnect" ? 401 : operationStatus(error, deleted.length));
  } catch (caught) {
    logGarminFailure(requestId, operation, caught, deleted.length);
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
