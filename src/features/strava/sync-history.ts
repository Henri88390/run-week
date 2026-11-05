import { z } from "zod";

export const syncHistorySchema = z.array(z.object({
  start: z.iso.date(), end: z.iso.date(), syncedAt: z.iso.datetime(),
}));
export const syncRangesSchema = z.array(z.object({ start: z.iso.date(), end: z.iso.date() }));

export function uncoveredRanges(history: z.infer<typeof syncHistorySchema>, range: { start: string; end: string }, today: string) {
  const covered = history.filter((entry) => entry.end <= today && entry.syncedAt.slice(0, 10) >= entry.end)
    .sort((a, b) => a.start.localeCompare(b.start));
  const gaps: { start: string; end: string }[] = [];
  let through = range.start;
  for (const entry of covered) {
    if (entry.end <= through || entry.start >= range.end) continue;
    if (entry.start > through) gaps.push({ start: through, end: entry.start });
    through = entry.end > through ? entry.end : through;
    if (through >= range.end) break;
  }
  if (through < range.end) gaps.push({ start: through, end: range.end });
  return gaps.reverse();
}

export function rangePreviouslySynchronized(history: z.infer<typeof syncHistorySchema>, range: { start: string; end: string }) {
  let through = range.start;
  for (const entry of [...history].sort((a, b) => a.start.localeCompare(b.start))) {
    if (entry.start > through) break;
    if (entry.end > through) through = entry.end;
    if (through >= range.end) return true;
  }
  return false;
}
