import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/features/account/server/auth";
import { db } from "@/features/account/server/db";
import { isSameOrigin, NO_STORE, readJson } from "@/features/account/server/http";
import { parsePlannerValue } from "@/features/running-programs/storage";

const MAX_BODY_BYTES = 256 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return json({ error: "unauthorized" }, 401);

  try {
    const row = await db().planner.findUnique({ where: { userId }, select: { data: true } });
    if (!row) return json({ planner: null });
    try {
      return json({ planner: parsePlannerValue(JSON.parse(row.data)) });
    } catch {
      return json({ planner: null, unreadable: true });
    }
  } catch (error) {
    console.error("planner_load_failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "forbidden" }, 403);
  const userId = await currentUserId();
  if (!userId) return json({ error: "unauthorized" }, 401);

  const body = await readJson(request, MAX_BODY_BYTES);
  if (typeof body !== "object" || body === null || !("planner" in body)) return json({ error: "invalid" }, 400);

  try {
    if (body.planner === null) {
      await db().planner.deleteMany({ where: { userId } });
      return json({ planner: null });
    }
    let planner;
    try {
      planner = parsePlannerValue(body.planner);
    } catch {
      return json({ error: "invalid" }, 400);
    }
    const data = JSON.stringify(planner);
    await db().planner.upsert({ where: { userId }, create: { userId, data }, update: { data } });
    return json({ planner });
  } catch (error) {
    console.error("planner_save_failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "unavailable" }, 503);
  }
}
