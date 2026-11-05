import { z } from "zod";

export const syncJobSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["queued", "running", "paused", "completed", "failed", "cancelled"]),
  phase: z.enum(["summaries", "streams"]),
  summaries: z.number().int().nonnegative(),
  recordings: z.number().int().nonnegative(),
  retryAt: z.iso.datetime().nullable(),
  errorCode: z.string().nullable(),
});
export const syncStatusSchema = z.object({ job: syncJobSchema.nullable() });
export const syncEventSchema = z.object({ jobId: z.string().uuid(), version: z.number().int().positive() }).strict();
export type SyncJobStatus = z.infer<typeof syncJobSchema>;

export function activeSync(status: string) {
  return ["queued", "running", "paused"].includes(status);
}
