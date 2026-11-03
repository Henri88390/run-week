import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/features/account/server/auth";
import { db } from "@/features/account/server/db";
import { isSameOrigin, NO_STORE } from "@/features/account/server/http";
import { clearAuthorization } from "@/features/garmin/server/session";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Exports the data stored for the signed-in account. Garmin tokens are omitted. */
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
    await db().$transaction([
      db().user.deleteMany({ where: { id: userId } }),
      ...(email ? [
        db().verificationToken.deleteMany({ where: { identifier: email } }),
        db().emailSignInLimit.deleteMany({ where: { email } }),
      ] : []),
    ]);
    const response = new NextResponse(null, { status: 204, headers: NO_STORE });
    clearAuthorization(response, request);
    return response;
  } catch (error) {
    console.error("account_delete_failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}
