export type MobileOperation =
  | "configuration" | "reserve_email_code" | "store_email_code" | "send_email_code" | "cleanup_email_code";

export class MobileOperationError extends Error {
  constructor(readonly operation: MobileOperation, cause: unknown) {
    super(`Mobile operation failed: ${operation}`, { cause });
    this.name = "MobileOperationError";
  }
}

export async function mobileOperation<T>(operation: MobileOperation, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new MobileOperationError(operation, error);
  }
}

/** Never serialize raw errors: Prisma and network messages can contain credentials or user input. */
export function mobileFailureDetails(error: unknown) {
  const operation = error instanceof MobileOperationError ? error.operation : "request";
  const cause = error instanceof MobileOperationError ? error.cause : error;
  const knownNames = ["Error", "TypeError", "TimeoutError", "AbortError",
    "PrismaClientKnownRequestError", "PrismaClientInitializationError", "EmailDeliveryError"];
  const name = cause instanceof Error && knownNames.includes(cause.name) ? cause.name : "unknown";
  const code = typeof cause === "object" && cause !== null && "code" in cause
    && typeof cause.code === "string" && /^P\d{4}$/.test(cause.code) ? cause.code : undefined;
  const status = cause instanceof Error && cause.name === "EmailDeliveryError"
    && "status" in cause && typeof cause.status === "number" ? cause.status : undefined;
  const hint = operation === "configuration" ? "Set AUTH_SECRET and DATABASE_URL in the backend environment; production also requires AUTH_RESEND_KEY."
    : code === "P1001" ? "Database unreachable: check the connection host and whether PostgreSQL is running."
      : code === "P1000" ? "Database authentication failed: check backend database credentials."
        : code === "P2021" || code === "P2022" ? "Database schema is missing: apply Prisma migrations."
          : status === 401 || status === 403 ? "Check AUTH_RESEND_KEY and the verified sender domain in Resend."
            : operation === "send_email_code" ? "Check Resend configuration, delivery restrictions and network access."
              : "Check backend configuration and database availability.";
  return { operation, name, ...(code ? { code } : {}), ...(status !== undefined ? { status } : {}), hint };
}
