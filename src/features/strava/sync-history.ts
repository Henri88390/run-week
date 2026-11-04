import { z } from "zod";

export const syncHistorySchema = z.array(z.object({
  start: z.iso.date(), end: z.iso.date(), syncedAt: z.iso.datetime(),
}));

export function periodSynchronized(history: z.infer<typeof syncHistorySchema>, range: { start: string; end: string }, today: string) {
  if (range.end > today) return false;
  const completed = history.filter((entry) => entry.syncedAt.slice(0, 10) >= entry.end)
    .sort((a, b) => a.start.localeCompare(b.start));
  let through = range.start;
  for (const entry of completed) {
    if (entry.start > through) break;
    if (entry.end > through) through = entry.end;
    if (through >= range.end) return true;
  }
  return false;
}
