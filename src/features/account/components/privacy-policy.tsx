"use client";

import Link from "next/link";
import { useI18n } from "@/features/i18n/use-i18n";
import { StravaPrivacy } from "@/features/strava/components/privacy";
import { PRIVACY_MESSAGES } from "../privacy-messages";
import { PrivacyControls } from "./privacy-controls";

export function PrivacyLoading() {
  const { locale } = useI18n();
  return <main lang={locale} className="mx-auto max-w-3xl p-6" role="status">{PRIVACY_MESSAGES[locale].loading}</main>;
}

// Only the public provider disclosure crosses the server/client boundary.
export function PrivacyPolicy({ host }: { host: string | null }) {
  const { locale } = useI18n();
  const text = PRIVACY_MESSAGES[locale];
  return <main lang={locale} className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 text-sm leading-6 sm:px-6">
    <Link href="/" className="underline">{text.back}</Link>
    <h1 className="text-2xl font-semibold">{text.title}</h1>
    <p>{text.intro} <a href="https://www.henri-lambert.my/" className="underline">Henri Lambert</a>. {text.contact}</p>
    {!host && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3">{text.deployment}</p>}
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{text.dataTitle}</h2>
      {text.data.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>
    <StravaPrivacy />
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{text.recipientsTitle}</h2>
      <ul className="list-disc space-y-2 pl-5">
        {text.recipients.map((paragraph, index) => <li key={index}>{paragraph.replace("{host}", () => host ?? text.unconfigured)}</li>)}
      </ul>
      <p>{text.keys}</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{text.aiTitle}</h2>
      <p>{text.ai}</p>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{text.storageTitle}</h2>
      {text.storage.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{text.rightsTitle}</h2>
      <p>{text.plannerBefore} <Link href="/planner" className="underline">{text.plannerLink}</Link>{text.plannerAfter}</p>
      {text.rights.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </section>
    <PrivacyControls />
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{text.changesTitle}</h2>
      <p>{text.changes}</p>
    </section>
  </main>;
}
