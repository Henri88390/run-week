import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { isGoogleSignInEnabled } from "@/features/account/server/auth";
import { SignInForm } from "@/features/account/components/sign-in-form";
import { DocumentLanguage } from "@/features/i18n/language-select";

export const metadata: Metadata = { title: "Sign in · Run Week" };

function safeCallbackUrl(value: string | string[] | undefined): string {
  const url = typeof value === "string" ? value : "/";
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\") ? url : "/";
}

export default function SignInPage({ searchParams }: PageProps<"/signin">) {
  return <main className="mx-auto w-full max-w-md px-6 py-8">
    <DocumentLanguage />
    <Suspense fallback={<p role="status" aria-busy="true">…</p>}>
      <SignInContent searchParams={searchParams} />
    </Suspense>
  </main>;
}

async function SignInContent({ searchParams }: Pick<PageProps<"/signin">, "searchParams">) {
  await connection();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  return <SignInForm callbackUrl={safeCallbackUrl(params.callbackUrl)} error={error} google={isGoogleSignInEnabled()} />;
}
