import { NextResponse, type NextRequest } from "next/server";
import { garminConfig } from "@/features/garmin/server/config";
import { createWorkout, deleteWorkout, GarminApiError, scheduleWorkout } from "@/features/garmin/server/garmin-api";
import { clearSession, freshTokens, isSameOrigin, readSession, writeSession } from "@/features/garmin/server/session";
import { garminWorkoutPayload } from "@/features/garmin/server/workout-payload";
import {
  garminSyncRequestSchema, type GarminErrorCode, type GarminSyncResponse,
} from "@/features/garmin/sync-request";
import { addDays, mondayOf } from "@/features/running-programs/domain";

function errorCode(error: unknown): GarminErrorCode {
  if (!(error instanceof GarminApiError)) return "failed";
  if (error.status === 401) return "reconnect";
  if (error.status === 403) return "permission";
  if (error.status === 429) return "rateLimited";
  return "failed";
}

function json(body: GarminSyncResponse, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Creates one Garmin workout per run and schedules it on its calendar date, replacing earlier copies. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ results: [], error: "invalid" }, 403);
  const config = garminConfig();
  if (!config) return json({ results: [], error: "failed" }, 503);
  const session = readSession(request, config);
  if (!session) return json({ results: [], error: "reconnect" }, 401);

  const parsed = garminSyncRequestSchema.safeParse(await request.json().catch(() => null));
  const weekStart = parsed.success ? parsed.data.weekStart : "";
  if (!parsed.success || mondayOf(new Date(`${weekStart}T12:00:00`)) !== weekStart
    || new Set(parsed.data.workouts.map((workout) => workout.day)).size !== parsed.data.workouts.length) {
    return json({ results: [], error: "invalid" }, 400);
  }

  const results: GarminSyncResponse["results"] = [];
  let tokens = session;
  let refreshed = false;
  let error: GarminErrorCode | undefined;
  try {
    ({ tokens, refreshed } = await freshTokens(config, session));
  } catch {
    const response = json({ results: [], error: "reconnect" }, 401);
    clearSession(response, request);
    return response;
  }
  try {
    for (const { previousWorkoutId, ...workout } of parsed.data.workouts) {
      const date = addDays(weekStart, workout.day);
      if (previousWorkoutId) await deleteWorkout(tokens.accessToken, previousWorkoutId);
      const workoutId = await createWorkout(tokens.accessToken,
        garminWorkoutPayload(workout, parsed.data.vdot, parsed.data.locale));
      try {
        await scheduleWorkout(tokens.accessToken, workoutId, date);
      } catch (scheduleError) {
        await deleteWorkout(tokens.accessToken, workoutId).catch(() => undefined);
        throw scheduleError;
      }
      results.push({ day: workout.day, date, workoutId });
    }
  } catch (caught) {
    error = errorCode(caught);
  }

  const response = json({ results, error }, error === "reconnect" ? 401 : 200);
  if (error === "reconnect") clearSession(response, request);
  else if (refreshed) writeSession(response, request, config, tokens);
  return response;
}
