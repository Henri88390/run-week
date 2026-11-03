import { NextResponse, type NextRequest } from "next/server";
import { clearAuthorization, clearSession, isSameOrigin } from "@/features/garmin/server/session";

/** Forgets the Garmin tokens in this browser. Access can also be revoked in Garmin Connect settings. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return new NextResponse(null, { status: 403 });
  const response = new NextResponse(null, { status: 204 });
  clearSession(response, request);
  clearAuthorization(response, request);
  return response;
}
