import { after } from "next/server";
import { json, failure } from "@/features/strava/server/http";
import { persistWebhook, readWebhook, subscriptionHandshake } from "@/features/strava/server/webhook";
import { publishJob } from "@/features/strava/server/background-jobs";

// Public provider callback: deliberately no cookie, session or same-origin check.
export async function GET(request: Request) {
  try { return json(subscriptionHandshake(new URL(request.url))); }
  catch (error) { return failure(error, "webhook-handshake"); }
}

export async function POST(request: Request) {
  try {
    const jobId = await persistWebhook(await readWebhook(request));
    if (jobId) after(async () => {
      // Persistence precedes acknowledgement; dispatch failure is recovered by the outbox.
      try { await publishJob(jobId); } catch { /* publishJob emits sanitized diagnostics. */ }
    });
    return json({ received: true });
  } catch (error) { return failure(error, "webhook-notification"); }
}
