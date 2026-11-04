"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useI18n } from "@/features/i18n/use-i18n";

// Keeps the code step after a wrong code, because Auth.js reloads this page with ?error=Verification.
const PENDING_KEY = "run-week.signin";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ErrorKey = "invalidEmail" | "invalidCode" | "codeRejected" | "rateLimited" | "sendFailed" | "failed";

function errorFromParam(error: string | null): ErrorKey | null {
  if (!error) return null;
  if (error === "Verification") return "codeRejected";
  if (error === "AccessDenied") return "rateLimited";
  return "failed";
}

function normalizeEmail(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function SignInForm({ callbackUrl, error, google }: { callbackUrl: string; error: string | null; google: boolean }) {
  const { t } = useI18n();
  const ids = useId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(() => errorFromParam(error));
  const [target, setTarget] = useState(callbackUrl);

  useEffect(() => {
    try {
      if (error !== "Verification") {
        window.sessionStorage.removeItem(PENDING_KEY);
        return;
      }
      const pending: unknown = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) ?? "null");
      if (typeof pending === "object" && pending !== null && "email" in pending && "callbackUrl" in pending
        && typeof pending.email === "string" && EMAIL_PATTERN.test(pending.email)
        && typeof pending.callbackUrl === "string" && pending.callbackUrl.startsWith("/")
        && !pending.callbackUrl.startsWith("//") && !pending.callbackUrl.startsWith("/\\")) {
        // Restoring the pending sign-in requires browser storage, available only after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEmail(pending.email);
        setTarget(pending.callbackUrl);
        setStep("code");
      }
    } catch {
      // Without session storage the user starts again from the email step.
    }
  }, [error]);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    const normalized = normalizeEmail(email);
    if (!EMAIL_PATTERN.test(normalized)) {
      setErrorKey("invalidEmail");
      return;
    }
    setBusy(true);
    setErrorKey(null);
    try {
      const result = await signIn("resend", { email: normalized, redirect: false, redirectTo: target });
      if (!result || result.error) {
        setErrorKey(result?.error === "AccessDenied" ? "rateLimited" : "sendFailed");
        return;
      }
      try {
        window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ email: normalized, callbackUrl: target }));
      } catch {
        // Optional: only used to restore the code step after a wrong code.
      }
      setEmail(normalized);
      setCode("");
      setStep("code");
    } catch {
      setErrorKey("sendFailed");
    } finally {
      setBusy(false);
    }
  }

  function verify(event: FormEvent<HTMLFormElement>) {
    if (!/^\d{6}$/.test(code)) {
      event.preventDefault();
      setErrorKey("invalidCode");
      return;
    }
    setBusy(true);
    setErrorKey(null);
  }

  function changeEmail() {
    try {
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      // Nothing to clear.
    }
    setStep("email");
    setCode("");
    setErrorKey(null);
  }

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-2">
      <Link href="/" className="text-sm underline">{t.account.back}</Link>
    </div>
    <section className="panel space-y-4">
      <h1 className="text-xl font-semibold">{t.account.title}</h1>
      <p className="text-sm text-stone-600">{t.account.intro}</p>
      {errorKey && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t.account.errors[errorKey]}</p>}
      {step === "email" ? <form onSubmit={(event) => void sendCode(event)} className="space-y-3" noValidate>
        <label className="block" htmlFor={`${ids}-email`}>
          <span className="field-label">{t.account.email}</span>
          <input id={`${ids}-email`} className="field" type="email" autoComplete="email" required value={email}
            onChange={(event) => setEmail(event.target.value)} aria-invalid={errorKey === "invalidEmail"} />
        </label>
        <button type="submit" className="button-primary w-full" disabled={busy}>{busy ? t.account.sendingCode : t.account.sendCode}</button>
      </form> : <form action="/api/auth/callback/resend" method="get" onSubmit={verify} className="space-y-3" noValidate>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="callbackUrl" value={target} />
        <p className="text-sm" role="status">{t.account.codeSent(email)}</p>
        <label className="block" htmlFor={`${ids}-code`}>
          <span className="field-label">{t.account.code}</span>
          <input id={`${ids}-code`} name="token" className="field tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code"
            maxLength={6} pattern="\d{6}" required value={code} autoFocus
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} aria-invalid={errorKey === "invalidCode"} />
        </label>
        <button type="submit" className="button-primary w-full" disabled={busy}>{busy ? t.account.verifying : t.account.verify}</button>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <button type="button" className="underline" disabled={busy} onClick={() => void sendCode()}>{t.account.resend}</button>
          <button type="button" className="underline" disabled={busy} onClick={changeEmail}>{t.account.otherEmail}</button>
        </div>
      </form>}
      {google && <>
        <p className="flex items-center gap-3 text-xs uppercase text-stone-500" aria-hidden="true">
          <span className="h-px flex-1 bg-stone-200" />{t.account.or}<span className="h-px flex-1 bg-stone-200" />
        </p>
        <button type="button" className="button-secondary inline-flex w-full items-center justify-center gap-2" disabled={busy}
          onClick={() => { setBusy(true); void signIn("google", { redirectTo: target }); }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
            <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.8Z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4-3.1Z" />
            <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43A11.96 11.96 0 0 0 12 0 12 12 0 0 0 1.27 6.61l4 3.1C6.22 6.88 8.87 4.77 12 4.77Z" />
          </svg>
          {t.account.google}
        </button>
      </>}
    </section>
  </div>;
}
