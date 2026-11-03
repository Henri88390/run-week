import "server-only";
import { db } from "./db";

export const MAX_CODE_SENDS_PER_HOUR = 5;
export const MAX_FAILED_CODE_ATTEMPTS = 5;

/** Counts a code request for this email. Returns false when the hourly limit is reached. */
export async function reserveCodeSend(email: string): Promise<boolean> {
  const rows = await db().$queryRaw<{ sendCount: number }[]>`
    INSERT INTO "EmailSignInLimit" ("email", "windowStart", "sendCount", "failedAttempts", "updatedAt")
    VALUES (${email}, now(), 1, 0, now())
    ON CONFLICT ("email") DO UPDATE SET
      "windowStart" = CASE WHEN "EmailSignInLimit"."windowStart" < now() - interval '1 hour'
        THEN now() ELSE "EmailSignInLimit"."windowStart" END,
      "sendCount" = CASE WHEN "EmailSignInLimit"."windowStart" < now() - interval '1 hour'
        THEN 1 ELSE "EmailSignInLimit"."sendCount" + 1 END,
      "failedAttempts" = 0,
      "updatedAt" = now()
    RETURNING "sendCount"`;
  const count = rows[0]?.sendCount;
  return typeof count === "number" && count <= MAX_CODE_SENDS_PER_HOUR;
}

/** Invalidates every pending code for the email after too many wrong entries. */
export async function recordFailedCode(email: string): Promise<void> {
  const rows = await db().$queryRaw<{ failedAttempts: number }[]>`
    UPDATE "EmailSignInLimit" SET "failedAttempts" = "failedAttempts" + 1, "updatedAt" = now()
    WHERE "email" = ${email}
    RETURNING "failedAttempts"`;
  const failures = rows[0]?.failedAttempts;
  if (failures === undefined || failures >= MAX_FAILED_CODE_ATTEMPTS) {
    await db().verificationToken.deleteMany({ where: { identifier: email } });
  }
}

export async function clearFailedCodes(email: string): Promise<void> {
  await db().emailSignInLimit.updateMany({ where: { email }, data: { failedAttempts: 0 } });
}
