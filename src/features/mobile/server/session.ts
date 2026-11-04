import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/features/account/server/db";

const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
const publicUserSelect = { id: true, email: true, name: true, image: true } as const;

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomCode(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueSession(userId: string) {
  const token = randomCode();
  const expires = new Date(Date.now() + SESSION_AGE);
  await db().session.create({ data: { sessionToken: `mobile:${digest(token)}`, userId, expires } });
  const user = await db().user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
  return { token, expires: expires.toISOString(), user };
}

export async function mobileSessionFromAuthorization(header: string | null) {
  if (!header || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) return null;
  const sessionToken = `mobile:${digest(header.slice(7))}`;
  const session = await db().session.findUnique({
    where: { sessionToken }, include: { user: { select: publicUserSelect } },
  });
  if (!session || session.expires.getTime() <= Date.now()) return null;
  return session;
}

export function mobileSession(request: NextRequest) {
  return mobileSessionFromAuthorization(request.headers.get("authorization"));
}
