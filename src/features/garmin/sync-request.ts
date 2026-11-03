import { z } from "zod";
import { LOCALES } from "@/features/i18n/locales";

export const GARMIN_ERRORS = ["reconnect", "permission", "rateLimited", "failed", "invalid"] as const;
export type GarminErrorCode = (typeof GARMIN_ERRORS)[number];

export const garminSyncRequestSchema = z.object({
  locale: z.enum(LOCALES),
  vdot: z.number().min(10).max(85),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workouts: z.array(z.object({
    day: z.number().int().min(0).max(6),
    durationMinutes: z.number().int().min(1).max(600),
    type: z.enum(["easy", "long", "workout", "vo2max", "threshold", "repetition"]).optional(),
    intensityAdjustment: z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)]).optional(),
    /** Garmin workout previously created for this day; it is replaced. */
    previousWorkoutId: z.number().int().positive().optional(),
  })).min(1).max(7),
});

export type GarminSyncRequest = z.infer<typeof garminSyncRequestSchema>;

export type GarminSyncResponse = {
  results: { day: number; date: string; workoutId: number }[];
  error?: GarminErrorCode;
};

export type GarminStatus = { configured: boolean; connected: boolean };
