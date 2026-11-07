"use client";

import Link from "next/link";
import { useI18n } from "@/features/i18n/use-i18n";
import { ABOUT_MESSAGES, type AboutFeatureKey } from "../messages";

const FEATURES: { key: AboutFeatureKey; href: string }[] = [
  { key: "planner", href: "/planner" },
  { key: "garmin", href: "/planner" },
  { key: "activities", href: "/activities" },
  { key: "metrics", href: "/running-metrics" },
];

export function AboutPage() {
  const { locale } = useI18n();
  const text = ABOUT_MESSAGES[locale];
  return <main lang={locale} className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 leading-6 sm:px-6">
    <section className="space-y-3">
      <h1 className="text-2xl font-semibold">{text.title}</h1>
      <p className="max-w-3xl text-stone-700">{text.intro}</p>
    </section>
    <section aria-labelledby="about-features" className="space-y-4">
      <h2 id="about-features" className="text-lg font-semibold">{text.featuresTitle}</h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {FEATURES.map(({ key, href }) => {
          const feature = text.features[key];
          return <li key={key} className="panel flex flex-col gap-3">
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="text-sm text-stone-700">{feature.body}</p>
            <Link href={href} className="mt-auto self-start text-sm font-medium text-emerald-800 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-700">
              {feature.link}
            </Link>
          </li>;
        })}
      </ul>
    </section>
    <section aria-labelledby="about-account" className="space-y-2 text-sm text-stone-700">
      <h2 id="about-account" className="text-lg font-semibold text-stone-900">{text.accountTitle}</h2>
      <p className="max-w-3xl">{text.account}</p>
      <p className="max-w-3xl">{text.limits}</p>
    </section>
  </main>;
}
