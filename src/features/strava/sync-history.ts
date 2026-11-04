import { z } from "zod";
import { calendarRange } from "./analytics";
import { syncPeriodRange, type SyncPeriod } from "./sync-period";

export const syncHistorySchema = z.array(z.object({
  start: z.iso.date(), end: z.iso.date(), syncedAt: z.iso.datetime(),
}));

export function rangePreviouslySynchronized(history: z.infer<typeof syncHistorySchema>, range: { start: string; end: string }) {
  let through = range.start;
  for (const entry of [...history].sort((a, b) => a.start.localeCompare(b.start))) {
    if (entry.start > through) break;
    if (entry.end > through) through = entry.end;
    if (through >= range.end) return true;
  }
  return false;
}

export function missingSyncPeriods(history: z.infer<typeof syncHistorySchema>, period: SyncPeriod): SyncPeriod[] {
  const periods = [period];
  if (period.view === "month") {
    const start = calendarRange(period.month).start;
    if (start < `${period.month}-01` && /^(19|20)\d{2}-/.test(start)) {
      periods.push({ view: "month", month: start.slice(0, 7) });
    }
  }
  return periods.filter((candidate) => !rangePreviouslySynchronized(history, syncPeriodRange(candidate)));
}

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
