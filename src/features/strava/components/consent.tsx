"use client";
import Link from "next/link";
import { useI18n } from "@/features/i18n/use-i18n";
import { STRAVA_MESSAGES } from "../messages";
import { STRAVA_CONSENT_VERSION } from "../types";

export function StravaConsent({ signedIn }: { signedIn: boolean }) {
  const { locale } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  // Native form redirects preserve encrypted HttpOnly OAuth cookies.
  // Use a form, not a client-side OAuth SDK or Strava login provider.
  return <section className="panel space-y-4">
    <h1 className="text-2xl font-semibold">{text.consentTitle}</h1>
    {!signedIn ? <><p>{text.signinBody}</p><Link className="button-primary inline-block" href="/signin?callbackUrl=%2Fstrava%2Fconsent">{text.signin}</Link></> :
      <form action="/api/strava/connect" method="post" className="space-y-4">
        <label className="flex items-start gap-3">
          <input className="mt-1 size-5 shrink-0" type="checkbox" name="consent" value={STRAVA_CONSENT_VERSION} required />
          <span>{text.consent}</span>
        </label>
        <p className="text-sm"><Link href="/privacy" className="underline">{text.privacy}</Link> · {STRAVA_CONSENT_VERSION}</p>
        <button className="button-primary" type="submit">{text.accept}</button>
      </form>}
  </section>;
}
