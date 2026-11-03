import "server-only";
import type { NextRequest } from "next/server";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Rejects cross-site state-changing requests in addition to SameSite=Lax cookies. */
export function isSameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === request.nextUrl.origin;
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
