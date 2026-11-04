import { z } from "zod";
import { calendarRange } from "./analytics";

export const syncPeriodSchema = z.discriminatedUnion("view", [
  z.object({ view: z.literal("week"), date: z.iso.date() }).strict(),
  z.object({ view: z.literal("month"), month: z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/) }).strict(),
  z.object({ view: z.literal("year"), year: z.string().regex(/^(19|20)\d{2}$/) }).strict(),
]);
export type SyncPeriod = z.infer<typeof syncPeriodSchema>;

export function syncPeriodRange(period: SyncPeriod) {
  if (period.view === "week") return calendarRange(period.date.slice(0, 7), period.date);
  if (period.view === "year") return { start: `${period.year}-01-01`, end: `${Number(period.year) + 1}-01-01` };
  const end = new Date(`${period.month}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: `${period.month}-01`, end: end.toISOString().slice(0, 10) };
}
