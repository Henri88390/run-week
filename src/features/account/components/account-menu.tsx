"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { useI18n } from "@/features/i18n/use-i18n";

export function AccountMenu() {
  const { data: session, status } = useSession();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  if (status === "loading") return null;
  if (status !== "authenticated") {
    return <Link href="/signin" className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700">
      {t.account.signIn}
    </Link>;
  }
  const email = session.user?.email ?? "";
  return <div className="flex min-w-0 items-center gap-2">
    <span className="max-w-[14rem] truncate text-sm text-stone-600" title={email}>
      <span className="sr-only">{t.account.signedInAs(email)}</span>
      <span aria-hidden="true">{email}</span>
    </span>
    <button type="button" disabled={busy}
      className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700 disabled:opacity-60"
      onClick={() => { setBusy(true); void signOut({ redirectTo: "/" }); }}>
      {t.account.signOut}
    </button>
  </div>;
}
