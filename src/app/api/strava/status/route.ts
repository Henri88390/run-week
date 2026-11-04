import { connection } from "next/server";
import { db } from "@/features/account/server/db";
import { STRAVA_CONSENT_VERSION } from "@/features/strava/types";
import { websiteUser, failure, json } from "@/features/strava/server/http";

export async function GET() {
  await connection();
  try {
    const userId = await websiteUser();
    const linked = await db().stravaConnection.findUnique({ where: { userId },
      select: { consentVersion: true } });
    return json({ connected: linked !== null, consentCurrent: linked?.consentVersion === STRAVA_CONSENT_VERSION });
  } catch (error) { return failure(error, "status"); }
}
