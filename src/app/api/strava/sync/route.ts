import { connection } from "next/server";
import { websiteUser, failure, json } from "@/features/strava/server/http";
import { currentSyncState } from "@/features/strava/server/background-jobs";

export async function GET() {
  await connection();
  try { return json(await currentSyncState(await websiteUser())); }
  catch (error) { return failure(error, "sync-status"); }
}
