import "server-only";
import { randomUUID } from "node:crypto";
import { StravaError } from "./api";
import { z } from "zod";

export function logStravaFailure(error: unknown, operation: string) {
  const requestId = randomUUID();
  const prismaCode = typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : undefined;
  const name = error instanceof Error && [
    "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError",
    "PrismaClientInitializationError", "PrismaClientValidationError", "ZodError",
  ].includes(error.name) ? error.name : undefined;
  console.error("strava_request_failed", {
    requestId, operation, code: error instanceof StravaError ? error.code : "unavailable",
    ...(prismaCode ? { prismaCode } : {}), ...(name ? { errorType: name } : {}),
    ...(error instanceof z.ZodError ? { validation: error.issues.map((issue) => ({
      code: issue.code, path: issue.path.filter((part) => typeof part === "string" || typeof part === "number").join("."),
    })) } : {}),
    ...(error instanceof StravaError ? { status: error.status, retrySeconds: error.retrySeconds } : {}),
    ...(error instanceof StravaError && error.diagnostic ? { upstream: error.diagnostic } : {}),
    configuration: {
      database: Boolean(process.env.DATABASE_URL),
      clientId: Boolean(process.env.STRAVA_CLIENT_ID),
      clientSecret: Boolean(process.env.STRAVA_CLIENT_SECRET),
      encryptionKey: Boolean(process.env.STRAVA_TOKEN_ENCRYPTION_KEY),
    },
    hint: prismaCode === "P2021" || prismaCode === "P2022"
      ? "Apply pending Prisma migrations to the backend database."
      : prismaCode === "P1001" ? "Check database availability."
        : name === "PrismaClientValidationError" ? "Regenerate the Prisma client and restart the backend."
          : "Check the operation, database migration status and Strava configuration.",
  });
  return requestId;
}
