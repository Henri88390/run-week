import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/features/account/server/db";
import { NO_STORE } from "@/features/account/server/http";
import { currentUserId } from "@/features/account/server/auth";
import { digest, issueSession, mobileSession, randomCode } from "./session";

const COOKIE = "run-week-mobile-browser";
const ticketSchema = z.object({
  purpose: z.enum(["signin", "garmin"]),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  userId: z.string().optional(),
  sessionToken: z.string().optional(),
  result: z.string().optional(),
});
type Ticket = z.infer<typeof ticketSchema>;
export const browserRequestSchema = z.object({
  purpose: z.enum(["signin", "garmin"]),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

async function readTicket(identifier: string) {
  const row = await db().verificationToken.findFirst({
    where: { identifier, expires: { gt: new Date() } },
  });
  if (!row) return null;
  const parsed = ticketSchema.safeParse(JSON.parse(row.token));
  return parsed.success ? { row, value: parsed.data } : null;
}

export async function createBrowserTicket(request: NextRequest, input: z.infer<typeof browserRequestSchema>) {
  const session = input.purpose === "garmin" ? await mobileSession(request) : null;
  if (input.purpose === "garmin" && !session) return null;
  const ticket = randomCode();
  const value: Ticket = {
    ...input, ...(session ? { userId: session.userId, sessionToken: session.sessionToken } : {}),
  };
  await db().verificationToken.deleteMany({
    where: { identifier: { startsWith: "mobile-" }, expires: { lte: new Date() } },
  });
  await db().verificationToken.create({ data: {
    identifier: `mobile-browser:${digest(ticket)}`, token: JSON.stringify(value),
    expires: new Date(Date.now() + 10 * 60 * 1000),
  } });
  return { url: new URL(`/api/mobile/browser/start?ticket=${ticket}`, request.nextUrl.origin).toString() };
}

export async function browserTicket(ticket?: string) {
  if (!ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) return null;
  const stored = await readTicket(`mobile-browser:${digest(ticket)}`);
  if (!stored) return null;
  if (stored.value.purpose === "garmin") {
    const { userId, sessionToken } = stored.value;
    if (!userId || !sessionToken) return null;
    const active = await db().session.findFirst({
      where: { sessionToken, userId, expires: { gt: new Date() } },
    });
    if (!active) return null;
  }
  return { ...stored, ticket };
}

export async function mobileGarminBrowser() {
  const ticket = (await cookies()).get(COOKIE)?.value;
  const stored = await browserTicket(ticket);
  return stored?.value.purpose === "garmin" ? stored : null;
}

function cookieOptions(request: NextRequest, maxAge: number) {
  return { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax" as const, path: "/", maxAge };
}

export async function startBrowser(request: NextRequest) {
  const ticket = request.nextUrl.searchParams.get("ticket") ?? undefined;
  const stored = await browserTicket(ticket);
  if (!stored) return NextResponse.json({ error: "expired" }, { status: 400, headers: NO_STORE });
  const target = stored.value.purpose === "garmin" ? "/garmin/consent"
    : `/signin?callbackUrl=${encodeURIComponent(`/api/mobile/browser/finish?ticket=${stored.ticket}`)}`;
  const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(COOKIE, stored.ticket, cookieOptions(request, 600));
  return response;
}

export async function finishBrowser(request: NextRequest, result?: string) {
  const ticket = result !== undefined ? request.cookies.get(COOKIE)?.value
    : request.nextUrl.searchParams.get("ticket") ?? undefined;
  const stored = await browserTicket(ticket);
  if (!stored || (result !== undefined) !== (stored.value.purpose === "garmin")) return null;
  const userId = result !== undefined ? stored.value.userId : await currentUserId();
  if (!userId) return null;
  const code = randomCode();
  const consumed = await db().$transaction(async (tx) => {
    const removed = await tx.verificationToken.deleteMany({
      where: { identifier: stored.row.identifier, token: stored.row.token, expires: { gt: new Date() } },
    });
    if (removed.count !== 1) return false;
    await tx.verificationToken.create({ data: {
      identifier: `mobile-exchange:${digest(code)}`,
      token: JSON.stringify({ ...stored.value, userId, ...(result !== undefined ? { result } : {}) }),
      expires: new Date(Date.now() + 60_000),
    } });
    return true;
  });
  if (!consumed) return null;
  const response = NextResponse.redirect(`runweek://auth?code=${code}`);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(COOKIE, "", cookieOptions(request, 0));
  return response;
}

export async function exchangeBrowserCode(code: string, verifier: string) {
  const stored = await readTicket(`mobile-exchange:${digest(code)}`);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  if (!stored || stored.value.challenge !== challenge || !stored.value.userId) return null;
  const consumed = await db().verificationToken.deleteMany({
    where: { identifier: stored.row.identifier, token: stored.row.token, expires: { gt: new Date() } },
  });
  if (consumed.count !== 1) return null;
  if (stored.value.purpose === "garmin") return { garmin: stored.value.result ?? "error" };
  return issueSession(stored.value.userId);
}
