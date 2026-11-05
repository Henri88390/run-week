import "server-only";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { seal, unseal } from "@/features/garmin/server/session";
import { stravaConfig } from "./config";

const COOKIE = "run-week-strava-linked-account";
const noticeSchema = z.object({
  userId: z.string().min(1),
  email: z.email().max(320),
  expiresAt: z.number().int().positive(),
});

export function writeLinkedAccountNotice(response: NextResponse, request: NextRequest, userId: string | undefined, email: string | null) {
  const options = { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax" as const, path: "/activities" };
  if (!userId || !email) {
    response.cookies.set(COOKIE, "", { ...options, maxAge: 0 });
    return;
  }
  const notice = noticeSchema.parse({ userId, email, expiresAt: Date.now() + 60_000 });
  response.cookies.set(COOKIE, seal(notice, stravaConfig().encryptionKey), { ...options, maxAge: 60 });
}

export function linkedAccountEmail(value: string | undefined, secret: string, userId: string, now = Date.now()): string | undefined {
  const parsed = noticeSchema.safeParse(unseal(value, secret));
  if (!parsed.success || parsed.data.userId !== userId || parsed.data.expiresAt <= now
    || parsed.data.expiresAt > now + 60_000) return undefined;
  return parsed.data.email;
}

export async function readLinkedAccountEmail(userId: string) {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return undefined;
  return linkedAccountEmail(value, stravaConfig().encryptionKey, userId);
}
