import type { NextRequest } from "next/server";
import { websiteUser, failure, json } from "@/features/strava/server/http";
import { disconnect } from "@/features/strava/server/store";
import { clearStravaAuthorization } from "@/features/strava/server/oauth";

export async function POST(request: NextRequest) {
  try {
    await disconnect(await websiteUser(request));
    const response = json({ ok: true });
    clearStravaAuthorization(response, request);
    return response;
  } catch (error) { return failure(error, "disconnect"); }
}
