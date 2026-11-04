import "server-only";
import { randomInt } from "node:crypto";
import NextAuth from "next-auth";
import { headers } from "next/headers";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { accountAdapter } from "./adapter";
import { reserveCodeSend } from "./sign-in-limits";
import { requestUserId } from "./request-user";
import { mobileSessionFromAuthorization } from "@/features/mobile/server/session";

export const EMAIL_CODE_MAX_AGE_SECONDS = 10 * 60;

type CodeRequest = { identifier: string; token: string; provider: { from?: string; apiKey?: string } };

class EmailDeliveryError extends Error {
  constructor(readonly status: number) {
    super(`Resend responded with ${status}.`);
    this.name = "EmailDeliveryError";
  }
}

export async function sendCode({ identifier, token, provider }: CodeRequest): Promise<void> {
  const text = `Your Run Week sign-in code is ${token}.\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`;
  if (!provider.apiKey) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_RESEND_KEY is not set.");
    console.info(`[run-week] Development sign-in code for ${identifier}: ${token}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: provider.from, to: identifier, subject: `Run Week sign-in code: ${token}`, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new EmailDeliveryError(response.status);
}

function providers(): Provider[] {
  const list: Provider[] = [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM ?? "Run Week <no-reply@run-week.fyi>",
      maxAge: EMAIL_CODE_MAX_AGE_SECONDS,
      generateVerificationToken: () => randomInt(0, 1_000_000).toString().padStart(6, "0"),
      sendVerificationRequest: sendCode,
    }),
  ];
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    list.push(Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Google verifies email ownership, so a Google sign-in may join an existing email account.
      allowDangerousEmailAccountLinking: true,
    }));
  }
  return list;
}

export function isGoogleSignInEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export const { handlers, auth, signOut } = NextAuth(() => ({
  adapter: accountAdapter(),
  providers: providers(),
  session: { strategy: "database" },
  pages: { signIn: "/signin", error: "/signin", verifyRequest: "/signin" },
  callbacks: {
    async signIn({ account, email }) {
      if (email?.verificationRequest && account?.provider === "resend") {
        return reserveCodeSend(account.providerAccountId);
      }
      return true;
    },
    // Return only public fields; the database session object also carries the session token.
    session({ session, user }) {
      return {
        expires: session.expires,
        user: { id: user.id, email: user.email, name: user.name ?? null, image: user.image ?? null },
      };
    },
  },
}));

/** The signed-in user's ID, from a native bearer session or the existing browser cookie. */
export async function currentUserId(): Promise<string | null> {
  const mobileUser = requestUserId();
  if (mobileUser !== undefined) return mobileUser;
  const authorization = (await headers()).get("authorization");
  if (authorization !== null) return (await mobileSessionFromAuthorization(authorization))?.userId ?? null;
  const session = await auth();
  return session?.user?.id ?? null;
}
