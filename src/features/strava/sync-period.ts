import { z } from "zod";
import { calendarRange, shiftMonth } from "./analytics";

const monthValue = z.string().regex(/^(19|20)\d{2}-(0[1-9]|1[0-2])$/);
/** Multi-month spans offered next to week, month and year; each ends with `month`. */
export const MONTH_COUNTS = ["2", "3", "4", "6"] as const;

export const syncPeriodSchema = z.discriminatedUnion("view", [
  z.object({ view: z.literal("week"), date: z.iso.date() }).strict(),
  z.object({ view: z.literal("month"), month: monthValue }).strict(),
  z.object({ view: z.literal("months"), month: monthValue, count: z.enum(MONTH_COUNTS) }).strict(),
  z.object({ view: z.literal("year"), year: z.string().regex(/^(19|20)\d{2}$/) }).strict(),
]);
export type SyncPeriod = z.infer<typeof syncPeriodSchema>;

export function syncPeriodRange(period: SyncPeriod) {
  if (period.view === "week") return calendarRange(period.date.slice(0, 7), period.date);
  if (period.view === "year") return { start: `${period.year}-01-01`, end: `${Number(period.year) + 1}-01-01` };
  const count = period.view === "months" ? Number(period.count) : 1;
  return { start: `${shiftMonth(period.month, 1 - count)}-01`, end: `${shiftMonth(period.month, 1)}-01` };
}
