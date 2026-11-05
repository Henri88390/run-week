import { z } from "zod";

export const STRAVA_CONSENT_VERSION = "2026-11-05-v2";
export const streamSchema = z.object({
  time: z.array(z.number().finite().nonnegative()).max(100_000),
  heartrate: z.array(z.number().finite().min(30).max(240).nullable()).max(100_000).nullable(),
  velocity_smooth: z.array(z.number().finite().nonnegative().nullable()).max(100_000).nullable(),
  distance: z.array(z.number().finite().nonnegative().nullable()).max(100_000).nullable(),
});
export type ActivityStreams = z.infer<typeof streamSchema>;
export const settingsSchema = z.object({
  zoneBounds: z.array(z.number().int().min(30).max(241)).max(6)
    .refine((bounds) => bounds.length === 0 || (bounds.length >= 2 && bounds.every((n, i) => i === 0 || n > bounds[i - 1]))).default([]),
  thresholdBpm: z.number().int().min(30).max(240).nullable().default(null),
  maxHr: z.number().int().min(60).max(240).nullable().default(null),
});
export type AnalyticsSettings = z.infer<typeof settingsSchema>;
const finite = z.number().finite();
const activitySummarySchema = z.object({
  id: z.string(), sourceId: z.string(), name: z.string(), sport: z.string(), localDate: z.iso.date(),
  distanceMeters: finite.nonnegative(), movingSeconds: finite.nonnegative(), elapsedSeconds: finite.nonnegative(),
  averageHr: finite.nullable(), maxHr: finite.nullable(), maximalEffort: z.boolean(), streamState: z.string(),
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;
const calendarWeekSchema = z.object({
  startDate: z.iso.date(),
  days: z.array(z.object({ date: z.iso.date(), activities: z.array(activitySummarySchema), zone: finite.nullable(), zoneSeconds: z.array(finite) })),
  distanceMeters: finite, movingSeconds: finite, aboveSeconds: finite.nullable(), partialHr: z.boolean(),
});
export type CalendarWeek = z.infer<typeof calendarWeekSchema>;
export const dashboardSchema = z.object({
  connected: z.boolean(), consentCurrent: z.boolean(), syncActive: z.boolean(), syncPage: finite,
  lastSyncedAt: z.iso.datetime().nullable(), retryAt: z.iso.datetime().nullable(), pending: finite,
  activities: z.array(activitySummarySchema), settings: settingsSchema,
  maximalEfforts: z.array(activitySummarySchema),
  weeklyVolumes: z.array(z.object({ start: z.iso.date(), distanceMeters: finite.nonnegative(), movingSeconds: finite.nonnegative() })),
  volumeBuckets: z.array(z.object({ start: z.iso.date(), end: z.iso.date(),
    distanceMeters: finite.nonnegative(), movingSeconds: finite.nonnegative() })),
  performance: z.object({ activityId: z.string(), speed: finite, vdot: finite.nullable(), count: finite }).nullable(),
  endurance: z.object({ id: z.string(), name: z.string(), localDate: z.iso.date(),
    movingSeconds: finite.positive(), distanceMeters: finite.positive() }).nullable(),
  today: z.iso.date(),
  zones: z.array(z.object({ zone: finite, min: finite, max: finite, seconds: finite })),
  threshold: z.object({ below: finite, above: finite }).nullable(),
  criticalSpeed: z.object({ speed: finite, dPrime: finite, rSquared: finite, count: finite }).nullable(),
  truncated: z.boolean(), month: z.string(), weekDate: z.iso.date().nullable(), year: z.string().nullable(),
  weeks: z.array(calendarWeekSchema),
  months: z.array(z.object({ month: z.string(), zoneSeconds: z.array(finite) })),
  paceDistribution: z.object({
    averagePace: finite.positive(),
    bins: z.array(z.object({ start: finite.nonnegative(), end: finite.positive(), seconds: finite.nonnegative() })),
  }).nullable(),
});
export type DashboardData = z.infer<typeof dashboardSchema>;
