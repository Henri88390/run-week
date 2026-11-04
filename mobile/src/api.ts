import { z } from "zod";
import {
  garminDeleteResponseSchema,
  garminDisconnectResponseSchema,
  garminSentResponseSchema,
  garminStatusSchema,
  garminSyncResponseSchema,
  type GarminDisconnectResponse,
} from "@/features/garmin/sync-request";
import type { Locale } from "@/features/i18n/locales";
import type { TrainingWeek, Workout } from "@/features/running-programs/types";

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
const baseUrl = configuredUrl && (__DEV__ || configuredUrl.startsWith("https://"))
  ? configuredUrl
  : __DEV__ ? "http://10.0.2.2:3000" : "https://run-week.fyi";
const timeoutMs = 20_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type AppUser = { id: string; email: string; name: string | null; image: string | null };
export type Session = { token: string; expires: string; user: AppUser };
export type GarminStatus = z.infer<typeof garminStatusSchema> & { sentWorkouts: number };
export type GarminMutationResult = {
  count: number;
  existing?: number;
  error?: string;
  requestId?: string;
  retryAfterSeconds?: number;
};

const sessionSchema = z.object({
  token: z.string().min(20),
  expires: z.string(),
  user: z.object({ id: z.string(), email: z.string().email(), name: z.string().nullable(), image: z.string().nullable() }),
});
const mobileSessionSchema = sessionSchema.omit({ token: true });
const garminStatusResponse = garminStatusSchema.extend({ sentWorkouts: z.number().int().nonnegative() });

async function request(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    return { response, data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("Request timed out. Check your connection and try again.");
    }
    throw new ApiError("Could not reach Run Week. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }
}

function errorCode(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string")
    return data.error;
  return fallback;
}

function validated<T>(
  response: Response,
  data: unknown,
  schema: z.ZodType<T>,
): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(errorCode(data, "Invalid server response."), response.status);
  if (!response.ok) throw new ApiError(errorCode(data, "Request failed."), response.status, errorCode(data, ""));
  return parsed.data;
}

export const mobileApi = {
  baseUrl,

  async sendCode(email: string): Promise<void> {
    const { response, data } = await request("/api/mobile/auth/code", { method: "POST", body: { email } });
    if (!response.ok || !(typeof data === "object" && data !== null && "ok" in data && data.ok === true))
      throw new ApiError(errorCode(data, "sendFailed"), response.status, errorCode(data, "sendFailed"));
  },

  async verifyCode(email: string, code: string): Promise<Session> {
    const { response, data } = await request("/api/mobile/auth/verify", { method: "POST", body: { email, code } });
    return validated(response, data, sessionSchema);
  },

  async openBrowserAuth(token: string | undefined, challenge: string, purpose: "signin" | "garmin"): Promise<string> {
    const { response, data } = await request("/api/mobile/auth/browser", {
      method: "POST", token, body: { challenge, purpose },
    });
    const parsed = validated(response, data, z.object({ url: z.string().url() }));
    return parsed.url;
  },

  async exchange(code: string, verifier: string): Promise<unknown> {
    const { response, data } = await request("/api/mobile/auth/exchange", {
      method: "POST", body: { code, verifier },
    });
    if (!response.ok) throw new ApiError(errorCode(data, "failed"), response.status, errorCode(data, "failed"));
    return data;
  },

  async session(token: string): Promise<z.infer<typeof mobileSessionSchema>> {
    const { response, data } = await request("/api/mobile/session", { token });
    return validated(response, data, mobileSessionSchema);
  },

  async revoke(token: string): Promise<void> {
    const { response } = await request("/api/mobile/session", { method: "DELETE", token });
    if (!response.ok) throw new ApiError("Sign-out failed.", response.status);
  },

  async planner(token: string): Promise<unknown> {
    const { response, data } = await request("/api/planner", { token });
    if (!response.ok) throw new ApiError(errorCode(data, "Planner request failed."), response.status);
    return data;
  },

  async savePlanner(token: string, planner: unknown): Promise<void> {
    const { response, data } = await request("/api/planner", {
      method: "PUT", token, body: { planner },
    });
    if (!response.ok) throw new ApiError(errorCode(data, "Could not save your account planner."), response.status);
  },

  async account(token: string, method: "GET" | "DELETE" = "GET"): Promise<unknown> {
    const { response, data } = await request("/api/account", { method, token });
    if (!response.ok) throw new ApiError(errorCode(data, "Account request failed."), response.status);
    return data;
  },

  async garminStatus(token: string): Promise<GarminStatus> {
    const { response, data } = await request("/api/garmin/status", { token });
    return validated(response, data, garminStatusResponse);
  },

  async sentWorkouts(token: string, weekStart: string): Promise<string[]> {
    const { response, data } = await request(`/api/garmin/workouts?weekStart=${encodeURIComponent(weekStart)}`, { token });
    return validated(response, data, garminSentResponseSchema).dates;
  },

  async sendWorkouts(token: string, week: TrainingWeek, workouts: Workout[], locale: Locale): Promise<GarminMutationResult> {
    const { response, data } = await request("/api/garmin/workouts", {
      method: "POST",
      token,
      body: {
        locale,
        vdot: week.profile.vdot,
        weekStart: week.startDate,
        workouts: workouts.map((workout) => ({
          day: workout.day,
          durationMinutes: workout.durationMinutes,
          type: workout.type,
          intensityAdjustment: workout.intensityAdjustment ?? 0,
        })),
      },
    });
    const parsed = garminSyncResponseSchema.safeParse(data);
    if (!parsed.success) throw new ApiError(errorCode(data, "invalidResponse"), response.status, errorCode(data, "invalidResponse"));
    return {
      count: parsed.data.results.filter((item) => !item.existing).length,
      existing: parsed.data.results.filter((item) => item.existing).length,
      error: parsed.data.error,
      requestId: parsed.data.requestId,
      retryAfterSeconds: parsed.data.retryAfterSeconds,
    };
  },

  async deleteWorkouts(token: string, dates: string[]): Promise<GarminMutationResult> {
    if (dates.length === 0) return { count: 0 };
    const { response, data } = await request("/api/garmin/workouts", {
      method: "DELETE", token, body: { dates },
    });
    const parsed = garminDeleteResponseSchema.safeParse(data);
    if (!parsed.success) throw new ApiError(errorCode(data, "invalidResponse"), response.status, errorCode(data, "invalidResponse"));
    return {
      count: parsed.data.deleted.length,
      error: parsed.data.error,
      requestId: parsed.data.requestId,
      retryAfterSeconds: parsed.data.retryAfterSeconds,
    };
  },

  async disconnectGarmin(token: string): Promise<GarminDisconnectResponse> {
    const { response, data } = await request("/api/garmin/disconnect", { method: "POST", token });
    return validated(response, data, garminDisconnectResponseSchema);
  },
};

export function isRateLimited(error: unknown): boolean {
  return error instanceof ApiError && error.code === "rateLimited";
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed. Try again.";
}
