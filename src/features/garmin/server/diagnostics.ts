import "server-only";
import { randomUUID } from "node:crypto";
import type { GarminErrorCode } from "../sync-request";

type Category = "auth" | "permission" | "rate_limit" | "rejected" | "unavailable" | "already_linked"
  | "network" | "timeout" | "invalid_response" | "invalid_request" | "configuration" | "internal";
export type GarminOperation = "connect" | "callback" | "status" | "disconnect" | "validate"
  | "rateLimit" | "refresh" | "create" | "schedule" | "record" | "cleanup" | "upload" | "delete";

/** Contains only categorical diagnostics, never the upstream body or original exception. */
export class GarminApiError extends Error {
  constructor(readonly category: Category, readonly upstreamStatus?: number, readonly upstreamBody?: string) {
    super("Garmin operation failed.");
  }
}

/** Never pass token-endpoint bodies: they can contain credentials. */
export function httpFailure(status: number, tokenRequest = false, upstreamBody?: string): GarminApiError {
  const category: Category = status === 401 || (tokenRequest && status === 400) ? "auth"
    : status === 403 ? "permission"
      : status === 429 ? "rate_limit"
        : status >= 500 ? "unavailable" : "rejected";
  return new GarminApiError(category, status, tokenRequest ? undefined : upstreamBody);
}

export function failureDetails(error: unknown): { category: Category; code: GarminErrorCode; upstreamStatus?: number } {
  const category = error instanceof GarminApiError ? error.category : "internal";
  const code: GarminErrorCode = category === "auth" ? "reconnect"
    : category === "already_linked" ? "alreadyLinked"
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

const MAX_LOGGED_PAYLOAD_CHARS = 16_000;

function boundedPayload(value: unknown): unknown {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
  if (text === undefined || text.length <= MAX_LOGGED_PAYLOAD_CHARS) return value;
  return { truncated: true, length: text.length, preview: text.slice(0, MAX_LOGGED_PAYLOAD_CHARS) };
}

type GarminEvent =
  | { event: "garmin_upload_request" | "garmin_delete_request"; payload: unknown }
  | { event: "garmin_api_request"; operation: "create" | "schedule" | "cleanup" | "delete"; payload: unknown }
  | { event: "garmin_api_response"; operation: "create"; workoutId: number }
  | { event: "garmin_upload_result"; status: number; code?: GarminErrorCode; completed: number; results: unknown }
  | { event: "garmin_delete_result"; status: number; code?: GarminErrorCode; deleted: string[] };

/** Training payloads only. Callers must never pass tokens, cookies, headers or OAuth values. */
export function logGarminEvent(requestId: string, details: GarminEvent) {
  const payload = "payload" in details ? { payload: boundedPayload(details.payload) } : {};
  console.info(JSON.stringify({ ...details, ...payload, requestId }));
}

/** Explicit field selection is intentional: never spread an error, request or caller metadata into logs. */
export function logGarminFailure(
  requestId: string,
  operation: GarminOperation,
  error: unknown,
  completed?: number,
) {
  const { category, code, upstreamStatus } = failureDetails(error);
  const upstreamBody = error instanceof GarminApiError && error.upstreamBody
    ? error.upstreamBody.slice(0, 2000) : undefined;
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
    ...(upstreamBody ? { upstreamBody } : {}),
  });
  if (category === "internal" || category === "invalid_response" || category === "unavailable"
    || category === "configuration" || category === "network" || category === "timeout") console.error(record);
  else console.warn(record);
}
