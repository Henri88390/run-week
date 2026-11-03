import { z } from "zod";
import { LOCALES } from "@/features/i18n/locales";

export const GARMIN_ERRORS = [
  "reconnect", "permission", "rateLimited", "rejected", "unavailable", "network", "invalidResponse", "failed", "invalid",
] as const;
export type GarminErrorCode = (typeof GARMIN_ERRORS)[number];

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

export const garminSyncRequestSchema = z.object({
  locale: z.enum(LOCALES),
  vdot: z.number().min(10).max(85),
  weekStart: isoDateSchema,
  workouts: z.array(z.object({
    day: z.number().int().min(0).max(6),
    durationMinutes: z.number().int().min(1).max(600),
    type: z.enum(["easy", "long", "workout", "vo2max", "threshold", "repetition"]).optional(),
    intensityAdjustment: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]).optional(),
    /** Garmin workout previously created for this day; it is replaced. */
    previousWorkoutId: z.number().int().positive().refine(Number.isSafeInteger).optional(),
  })).min(1).max(7),
});

export type GarminSyncRequest = z.infer<typeof garminSyncRequestSchema>;

const workoutIdSchema = z.number().int().positive().refine(Number.isSafeInteger);

export const garminDeleteRequestSchema = z.object({
  workoutIds: z.array(workoutIdSchema).min(1).max(7)
    .refine((ids) => new Set(ids).size === ids.length),
});

export type GarminDeleteRequest = z.infer<typeof garminDeleteRequestSchema>;

export type GarminDeleteResponse = {
  deleted: number[];
  error?: GarminErrorCode;
  requestId?: string;
  retryAfterSeconds?: number;
};

export const garminDeleteResponseSchema = z.object({
  deleted: z.array(workoutIdSchema).max(7),
  error: z.enum(GARMIN_ERRORS).optional(),
  requestId: z.uuid().optional(),
  retryAfterSeconds: z.number().int().min(1).max(86400).optional(),
});

export type GarminSyncResponse = {
  results: { day: number; date: string; workoutId: number }[];
  error?: GarminErrorCode;
  requestId?: string;
  retryAfterSeconds?: number;
};

export const garminSyncResponseSchema = z.object({
  results: z.array(z.object({
    day: z.number().int().min(0).max(6),
    date: isoDateSchema,
    workoutId: z.number().int().positive().refine(Number.isSafeInteger),
  })),
  error: z.enum(GARMIN_ERRORS).optional(),
  requestId: z.uuid().optional(),
  retryAfterSeconds: z.number().int().min(1).max(86400).optional(),
});

export const garminStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
});

export type GarminStatus = z.infer<typeof garminStatusSchema>;
