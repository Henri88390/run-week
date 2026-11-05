import { connection } from "next/server";
import { websiteUser, failure, json } from "@/features/strava/server/http";
import { currentSyncJob } from "@/features/strava/server/background-jobs";

export async function GET() {
  await connection();
  try { return json({ job: await currentSyncJob(await websiteUser()) }); }
  catch (error) { return failure(error, "sync-status"); }
}
