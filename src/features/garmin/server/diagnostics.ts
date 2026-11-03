import "server-only";
import { randomUUID } from "node:crypto";
import type { GarminErrorCode } from "../sync-request";

type Category = "auth" | "permission" | "rate_limit" | "rejected" | "unavailable"
  | "network" | "timeout" | "invalid_response" | "invalid_request" | "configuration" | "internal";
export type GarminOperation = "connect" | "callback" | "status" | "disconnect" | "validate"
  | "rateLimit" | "refresh" | "replace" | "create" | "schedule" | "cleanup" | "upload";

/** Contains only categorical diagnostics, never the upstream body or original exception. */
export class GarminApiError extends Error {
  constructor(readonly category: Category, readonly upstreamStatus?: number) {
    super("Garmin operation failed.");
  }
}

export function httpFailure(status: number, tokenRequest = false): GarminApiError {
  const category: Category = status === 401 || (tokenRequest && status === 400) ? "auth"
    : status === 403 ? "permission"
      : status === 429 ? "rate_limit"
        : status >= 500 ? "unavailable" : "rejected";
  return new GarminApiError(category, status);
}

export function failureDetails(error: unknown): { category: Category; code: GarminErrorCode; upstreamStatus?: number } {
  const category = error instanceof GarminApiError ? error.category : "internal";
  const code: GarminErrorCode = category === "auth" ? "reconnect"
    : category === "permission" ? "permission"
      : category === "rate_limit" ? "rateLimited"
        : category === "rejected" ? "rejected"
          : category === "unavailable" || category === "configuration" ? "unavailable"
            : category === "network" || category === "timeout" ? "network"
              : category === "invalid_response" ? "invalidResponse"
                : category === "invalid_request" ? "invalid" : "failed";
  return { category, code, upstreamStatus: error instanceof GarminApiError ? error.upstreamStatus : undefined };
}

export function newRequestId(): string {
  return randomUUID();
}

/** Explicit field selection is intentional: never spread an error, request or caller metadata into logs. */
export function logGarminFailure(
  requestId: string,
  operation: GarminOperation,
  error: unknown,
  completed?: number,
) {
  const { category, code, upstreamStatus } = failureDetails(error);
  const record = JSON.stringify({
    event: "garmin_failure",
    requestId,
    operation,
    category,
    code,
    ...(Number.isInteger(upstreamStatus) && upstreamStatus !== undefined
      && upstreamStatus >= 100 && upstreamStatus <= 599 ? { upstreamStatus } : {}),
    ...(completed !== undefined && Number.isInteger(completed) && completed >= 0 && completed <= 7
      ? { completed } : {}),
  });
  if (category === "internal" || category === "invalid_response" || category === "unavailable"
    || category === "configuration" || category === "network" || category === "timeout") console.error(record);
  else console.warn(record);
}
