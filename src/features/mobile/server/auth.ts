import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "@/features/account/server/db";
import { EMAIL_CODE_MAX_AGE_SECONDS, sendCode } from "@/features/account/server/auth";
import { clearFailedCodes, recordFailedCode, reserveCodeSend } from "@/features/account/server/sign-in-limits";
import { digest, issueSession } from "./session";
import { mobileOperation } from "./diagnostics";

export const mobileEmailSchema = z.string().max(254).transform((value) =>
  value.normalize("NFKC").trim().toLowerCase()).pipe(z.email());
function emailCodeHash(code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return digest(`${code}${secret}`);
}

export async function requestEmailCode(email: string): Promise<boolean> {
  await mobileOperation("configuration", async () => {
    if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) throw new Error("Missing backend configuration.");
    if (process.env.NODE_ENV === "production" && !process.env.AUTH_RESEND_KEY) {
      throw new Error("Missing production email configuration.");
    }
  });
  if (!await mobileOperation("reserve_email_code", () => reserveCodeSend(email))) return false;
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const token = emailCodeHash(code);
  await mobileOperation("store_email_code", () => db().$transaction([
    db().verificationToken.deleteMany({ where: { identifier: email } }),
    db().verificationToken.create({ data: {
      identifier: email, token, expires: new Date(Date.now() + EMAIL_CODE_MAX_AGE_SECONDS * 1000),
    } }),
  ]));
  try {
    await mobileOperation("send_email_code", () => sendCode({ identifier: email, token: code, provider: {
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? "Run Week <no-reply@run-week.fyi>",
    } }));
  } catch (error) {
    try {
      await mobileOperation("cleanup_email_code", () =>
        db().verificationToken.deleteMany({ where: { identifier: email, token } }));
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Email delivery and code cleanup failed.");
    }
    throw error;
  }
  return true;
}

export async function verifyEmailCode(email: string, code: string) {
  const token = emailCodeHash(code);
  const result = await db().$transaction(async (tx) => {
    const consumed = await tx.verificationToken.deleteMany({
      where: { identifier: email, token, expires: { gt: new Date() } },
    });
    if (consumed.count !== 1) return null;
    return tx.user.upsert({
      where: { email }, create: { email, emailVerified: new Date() },
      update: { emailVerified: new Date() }, select: { id: true },
    });
  });
  if (!result) {
    await recordFailedCode(email);
    return null;
  }
  await clearFailedCodes(email);
  return issueSession(result.id);
}
