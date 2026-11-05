import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/features/account/server/auth";
import { db } from "@/features/account/server/db";
import { isSameOrigin, NO_STORE } from "@/features/account/server/http";
import { clearAuthorization } from "@/features/garmin/server/session";
import { clearStravaAuthorization } from "@/features/strava/server/oauth";
import { clearActivityCache } from "@/features/strava/server/cache";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Exports account data. Garmin/Strava tokens, athlete keys and leases are omitted. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return json({ error: "unauthorized" }, 401);
  try {
    const user = await db().user.findUnique({
      where: { id: userId },
      select: {
        email: true, emailVerified: true, name: true, createdAt: true,
        accounts: { select: { provider: true, createdAt: true } },
        planner: { select: { data: true, updatedAt: true } },
        garminConnection: { select: { consentVersion: true, consentAt: true, createdAt: true } },
        garminWorkouts: { select: { date: true, workoutId: true, createdAt: true }, orderBy: { date: "asc" } },
        stravaConnection: { select: {
          consentVersion: true, consentAt: true, createdAt: true, lastSyncedAt: true,
          syncActive: true, syncPage: true, syncAfter: true, syncBefore: true, retryAt: true,
        } },
        stravaActivities: { select: {
          sourceId: true, name: true, sport: true, startedAt: true, localDate: true,
          distanceMeters: true, movingSeconds: true, elapsedSeconds: true, averageHr: true, maxHr: true,
          streams: true, streamState: true, maximalEffort: true, updatedAt: true,
          elevationGainMeters: true, elevationStreamState: true,
        }, orderBy: { startedAt: "asc" } },
        runningAnalyticsSettings: { select: { zoneBounds: true, thresholdBpm: true, maxHr: true } },
      },
    });
    if (!user) return json({ error: "unauthorized" }, 401);
    let planner: unknown = null;
    if (user.planner) {
      try {
        planner = JSON.parse(user.planner.data);
      } catch {
        planner = user.planner.data;
      }
    }
    return json({
      exportedAt: new Date().toISOString(),
      account: { email: user.email, emailVerified: user.emailVerified, name: user.name, createdAt: user.createdAt },
      signInMethods: user.accounts,
      planner: user.planner ? { updatedAt: user.planner.updatedAt, data: planner } : null,
      garminConnection: user.garminConnection,
      garminWorkouts: user.garminWorkouts.map((workout) => ({ ...workout, workoutId: workout.workoutId.toString() })),
      stravaConnection: user.stravaConnection,
      stravaActivities: user.stravaActivities,
      runningAnalyticsSettings: user.runningAnalyticsSettings,
    });
  } catch (error) {
    console.error("account_export_failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}

/** Deletes the account and all its rows. Workouts already in Garmin Connect stay there. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
  const userId = await currentUserId();
  if (!userId) return json({ error: "unauthorized" }, 401);
  try {
    const user = await db().user.findUnique({ where: { id: userId }, select: { email: true } });
    const email = user?.email;
    await db().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`strava:${userId}`}))`;
      await clearActivityCache(userId);
      await tx.user.deleteMany({ where: { id: userId } });
      await tx.verificationToken.deleteMany({ where: { identifier: `strava-oauth:${userId}` } });
      if (email) {
        await tx.verificationToken.deleteMany({ where: { identifier: email } });
        await tx.emailSignInLimit.deleteMany({ where: { email } });
      }
    });
    const response = new NextResponse(null, { status: 204, headers: NO_STORE });
    clearAuthorization(response, request);
    clearStravaAuthorization(response, request);
    return response;
  } catch (error) {
    console.error("account_delete_failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}
