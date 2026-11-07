"use client";
import Link from "next/link";
import { useI18n } from "@/features/i18n/use-i18n";
import { STRAVA_MESSAGES, stravaNoticeMessage } from "../messages";
import { RequestError } from "./request-error";

export function AnalyticsShell({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  return <main lang={locale} className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    {children}
    <p className="text-sm text-stone-600">{text.storage} {text.caution}</p>
  </main>;
}
export function AnalyticsLoading() {
  const { locale } = useI18n();
  return <p role="status">{STRAVA_MESSAGES[locale].loading}</p>;
}
export function StravaConnectionPrompt({ notice, linkedEmail }: { notice?: string; linkedEmail?: string }) {
  const { locale } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  return <section className="panel space-y-3">
    <h1 className="text-2xl font-semibold">{text.connect}</h1>
    {notice && <RequestError key={notice} message={stravaNoticeMessage(locale, notice, linkedEmail)} />}
    <Link className="button-primary inline-block" href="/strava/consent">{text.connect}</Link>
  </section>;
}
export function AnalyticsPrompt({ failed = false, metrics = false }: { failed?: boolean; metrics?: boolean }) {
  const { locale } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  return <section className="panel space-y-3">
    <h1 className="text-2xl font-semibold">{metrics ? text.metrics : text.overview}</h1>
    {failed ? <RequestError message={text.error} /> : <>
      <p>{metrics ? text.metricsSigninBody : text.signinBody}</p>
      <Link className="button-primary inline-block"
        href={`/signin?callbackUrl=${encodeURIComponent(metrics ? "/running-metrics" : "/activities")}`}>{text.signin}</Link>
    </>}
  </section>;
}
