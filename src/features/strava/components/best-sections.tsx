"use client";

import Link from "next/link";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal, formatInteger } from "@/features/i18n/locales";
import type { BestSectionsData } from "../types";
import { BEST_SECTIONS_MESSAGES } from "../best-sections-messages";
import { sectionDuration } from "../best-sections";
import { AnalyticsPrompt, StravaConnectionPrompt } from "./shell";
import { STREAM_MESSAGES } from "../stream-messages";
import type { RankedHr } from "../stream-metrics";

const MEDAL_COLORS = [
  "text-amber-500",
  "text-slate-400",
  "text-orange-700",
  "text-stone-500",
  "text-stone-500",
] as const;

function RankIcon({ index }: { index: number }) {
  const { locale } = useI18n();
  return <>
    <span className="sr-only">{formatInteger(locale, index + 1)}</span>
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"
      className={`mt-0.5 size-5 shrink-0 ${MEDAL_COLORS[index]}`}>
      <path d="M6.5 2h4.2l2 7H8L6.5 2Zm7 0h4L16 9h-5l2.5-7Z" fill="currentColor" opacity=".65" />
      <circle cx="12" cy="15" r="6" fill="currentColor" />
      <path d="m12 11.5 1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3 1-2Z" fill="white" />
    </svg>
  </>;
}

function HrResults({ results }: { results: RankedHr[] }) {
  const { locale } = useI18n();
  return results.length ? <ol className="list-none space-y-3">
    {results.map((result, index) => <li key={`${result.activityId}:${result.startSeconds}:${result.endSeconds}`}
      className="flex items-start gap-2 text-sm">
      <RankIcon index={index} />
      <Link prefetch={false} href={`/activities/${result.activityId}`}
        className="rounded-sm text-emerald-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2">
        <span className="font-mono font-semibold tabular-nums">{formatDecimal(locale, result.bpm, 1)} bpm</span>
        {" - "}<time dateTime={result.localDate}>{formatDate(locale, result.localDate)}</time>
        <span className="block font-mono text-xs tabular-nums">
          +{sectionDuration(result.startSeconds)}
          {result.endSeconds !== result.startSeconds && ` – +${sectionDuration(result.endSeconds)}`}
        </span>
      </Link>
    </li>)}
  </ol> : <p className="text-sm text-stone-600">{STREAM_MESSAGES[locale].empty}</p>;
}

export function BestSectionsPrompt({ state }: { state: "signIn" | "connect" | "failed" }) {
  const { locale } = useI18n();
  const text = BEST_SECTIONS_MESSAGES[locale];
  if (state === "connect") return <StravaConnectionPrompt title={text.title} />;
  if (state === "failed") return <AnalyticsPrompt title={text.title} failed />;
  return <AnalyticsPrompt title={text.title} body={text.signIn} signInLabel={text.signIn}
    callbackUrl="/top-performances" />;
}

export function BestSections({ data }: { data: BestSectionsData }) {
  const { locale, t } = useI18n();
  const text = BEST_SECTIONS_MESSAGES[locale];
  const hrText = STREAM_MESSAGES[locale];
  return <section aria-labelledby="best-sections-title" data-best-sections className="space-y-4">
    <h1 id="best-sections-title" className="text-2xl font-semibold">{text.title}</h1>
    <div data-distance-sections className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {data.distances.map(({ meters, results }) => <article key={meters} className="panel min-w-0 space-y-3">
        <h2 className="text-lg font-semibold">
          {meters === 21097.5 ? `${text.half} · ${formatDecimal(locale, meters, 1)} m`
            : meters === 42195 ? `${text.marathon} · ${formatInteger(locale, meters)} m`
              : meters >= 1000 && meters !== 1500 ? `${formatInteger(locale, meters / 1000)} ${t.units.km}`
                : `${formatInteger(locale, meters)} m`}
        </h2>
        {results.length ? <ol className="list-none space-y-3">
          {results.map((result, index) => <li key={result.activityId} className="flex items-start gap-2 text-sm">
            <RankIcon index={index} />
            <Link prefetch={false} href={`/activities/${result.activityId}`}
              className="rounded-sm text-emerald-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2">
              <span className="font-mono font-semibold tabular-nums">{sectionDuration(result.seconds)}</span>
              {" - "}
              {formatDate(locale, result.localDate)}
            </Link>
          </li>)}
        </ol> : <p className="text-sm text-stone-600">{text.empty}</p>}
      </article>)}
    </div>
    <section data-hr-records aria-labelledby="hr-records-title" className="space-y-4">
      <h2 id="hr-records-title" className="text-xl font-semibold">{hrText.heartRate}</h2>
      <details className="text-sm text-stone-600">
        <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2">{hrText.averageHr}</summary>
        <p className="mt-2 max-w-3xl">{hrText.rule}</p>
      </details>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="panel min-w-0 space-y-3">
          <h3 className="text-lg font-semibold">{hrText.peak}</h3>
          <HrResults results={data.heartRate.peak} />
        </article>
        {data.heartRate.windows.map(({ seconds, results }) => <article key={seconds} className="panel min-w-0 space-y-3">
          <h3 className="text-lg font-semibold">{hrText.average} · {seconds < 60 ? `${formatInteger(locale, seconds)} s`
            : seconds < 3600 ? `${formatInteger(locale, seconds / 60)} ${t.units.min}`
              : `${formatInteger(locale, Math.floor(seconds / 3600))} ${t.units.h}${seconds % 3600 ? ` ${formatInteger(locale, seconds % 3600 / 60)} ${t.units.min}` : ""}`}</h3>
          <HrResults results={results} />
        </article>)}
      </div>
    </section>
  </section>;
}
