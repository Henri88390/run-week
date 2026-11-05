import { serve } from "inngest/next";
import { inngest } from "@/features/strava/server/inngest";
import { stravaDispatcher, stravaImport, stravaIncremental } from "@/features/strava/server/background-functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [stravaImport, stravaDispatcher, stravaIncremental],
});
