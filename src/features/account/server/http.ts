import "server-only";
import type { NextRequest } from "next/server";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Cookie mutations stay same-origin. Native bearer requests are authenticated separately. */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin === request.nextUrl.origin
    || (origin === null && /^Bearer [A-Za-z0-9_-]{43}$/.test(request.headers.get("authorization") ?? ""));
}

/** Reads a JSON body of at most `maxBytes`; returns undefined when it is missing, too large or invalid. */
export async function readJson(request: NextRequest, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return undefined;
  const text = await request.text().catch(() => "");
  if (!text || new TextEncoder().encode(text).length > maxBytes) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}
