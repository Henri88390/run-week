import "server-only";
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "run-week", ...(process.env.NODE_ENV === "production" ? { isDev: false } : {}) });

export function requireBackgroundSync() {
  if (process.env.NODE_ENV === "production"
    && (!process.env.INNGEST_EVENT_KEY || !process.env.INNGEST_SIGNING_KEY)) {
    throw new Error("Configure Inngest event and signing keys before enabling background synchronization");
  }
}
