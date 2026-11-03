import { z } from "zod";
import { LOCALES } from "@/features/i18n/locales";

export const GARMIN_ERRORS = [
  "reconnect", "permission", "rateLimited", "rejected", "unavailable", "network", "invalidResponse", "failed", "invalid",
  "alreadyLinked",
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
  })).min(1).max(7),
});

export type GarminSyncRequest = z.infer<typeof garminSyncRequestSchema>;

export const garminDeleteRequestSchema = z.object({
  dates: z.array(isoDateSchema).min(1).max(7).refine((dates) => new Set(dates).size === dates.length),
});

export type GarminDeleteRequest = z.infer<typeof garminDeleteRequestSchema>;

/** `deleted` lists the dates whose Run Week workout was removed from Garmin Connect. */
export type GarminDeleteResponse = {
  deleted: string[];
  error?: GarminErrorCode;
  requestId?: string;
  retryAfterSeconds?: number;
};

export const garminDeleteResponseSchema = z.object({
  deleted: z.array(isoDateSchema).max(7),
  error: z.enum(GARMIN_ERRORS).optional(),
  requestId: z.uuid().optional(),
  retryAfterSeconds: z.number().int().min(1).max(86400).optional(),
});

export type GarminSyncResponse = {
  /** `existing` marks a day that already had a Run Week workout in Garmin Connect and was not sent again. */
  results: { day: number; date: string; existing?: boolean }[];
  error?: GarminErrorCode;
  requestId?: string;
  retryAfterSeconds?: number;
};

export const garminSyncResponseSchema = z.object({
  results: z.array(z.object({
    day: z.number().int().min(0).max(6),
    date: isoDateSchema,
    existing: z.boolean().optional(),
  })).max(7),
  error: z.enum(GARMIN_ERRORS).optional(),
  requestId: z.uuid().optional(),
  retryAfterSeconds: z.number().int().min(1).max(86400).optional(),
});

/** Dates of one week that hold a workout sent from this account. */
export type GarminSentResponse = {
  dates: string[];
  error?: GarminErrorCode;
  requestId?: string;
};

export const garminSentResponseSchema = z.object({
  dates: z.array(isoDateSchema).max(7),
  error: z.enum(GARMIN_ERRORS).optional(),
  requestId: z.uuid().optional(),
});

export const garminStatusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
});

export type GarminStatus = z.infer<typeof garminStatusSchema>;
