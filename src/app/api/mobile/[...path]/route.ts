import type { NextRequest } from "next/server";
import { mobileApi } from "@/features/mobile/server/api";

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return mobileApi(request, (await context.params).path);
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
