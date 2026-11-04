import "server-only";
import { connection, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/features/account/server/db";
import { NO_STORE, readJson } from "@/features/account/server/http";
import { mobileEmailSchema, requestEmailCode, verifyEmailCode } from "./auth";
import { mobileSession } from "./session";
import { browserRequestSchema, createBrowserTicket, exchangeBrowserCode } from "./browser";
import { mobileFailureDetails } from "./diagnostics";

const codeRequest = z.object({ email: mobileEmailSchema });
const verifyRequest = codeRequest.extend({ code: z.string().regex(/^\d{6}$/) });
const exchangeRequest = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
});

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function mobileApi(request: NextRequest, path: string[]) {
  await connection();
  const route = path.join("/");
  const requestId = randomUUID();
  try {
    // Native requests have no Origin. Browser callers must remain same-origin.
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin) return json({ error: "forbidden" }, 403);
    if (request.method === "POST" && route === "auth/code") {
      const parsed = codeRequest.safeParse(await readJson(request, 4096));
      if (!parsed.success) return json({ error: "invalidEmail" }, 400);
      return await requestEmailCode(parsed.data.email)
        ? json({ ok: true }) : json({ error: "rateLimited" }, 429);
    }
    if (request.method === "POST" && route === "auth/verify") {
      const parsed = verifyRequest.safeParse(await readJson(request, 4096));
      if (!parsed.success) return json({ error: "invalidCode" }, 400);
      const result = await verifyEmailCode(parsed.data.email, parsed.data.code);
      return result ? json(result) : json({ error: "codeRejected" }, 401);
    }
    if (request.method === "POST" && route === "auth/browser") {
      const parsed = browserRequestSchema.safeParse(await readJson(request, 4096));
      if (!parsed.success) return json({ error: "invalid" }, 400);
      const result = await createBrowserTicket(request, parsed.data);
      return result ? json(result) : json({ error: "unauthorized" }, 401);
    }
    if (request.method === "POST" && route === "auth/exchange") {
      const parsed = exchangeRequest.safeParse(await readJson(request, 4096));
      if (!parsed.success) return json({ error: "invalid" }, 400);
      const result = await exchangeBrowserCode(parsed.data.code, parsed.data.verifier);
      return result ? json(result) : json({ error: "codeRejected" }, 401);
    }
    if (route !== "session") return json({ error: "notFound" }, 404);
    const session = await mobileSession(request);
    if (!session) return json({ error: "unauthorized" }, 401);
    if (route === "session") {
      if (request.method === "GET") return json({ user: session.user, expires: session.expires.toISOString() });
      if (request.method === "DELETE") {
        await db().session.deleteMany({ where: { sessionToken: session.sessionToken } });
        return new NextResponse(null, { status: 204, headers: NO_STORE });
      }
      return json({ error: "methodNotAllowed" }, 405);
    }
    return json({ error: "methodNotAllowed" }, 405);
  } catch (error) {
    console.error(JSON.stringify({
      event: "mobile_request_failed", route, requestId,
      ...mobileFailureDetails(error instanceof AggregateError ? error.errors[0] : error),
      ...(error instanceof AggregateError ? { cleanup: mobileFailureDetails(error.errors[1]) } : {}),
      configuration: {
        authSecret: Boolean(process.env.AUTH_SECRET),
        databaseUrl: Boolean(process.env.DATABASE_URL),
        resendKey: Boolean(process.env.AUTH_RESEND_KEY),
      },
    }));
    return NextResponse.json({ error: "unavailable", requestId }, {
      status: 503, headers: { ...NO_STORE, "X-Request-ID": requestId },
    });
  }
}
