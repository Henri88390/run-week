"use client";

import { useI18n } from "@/features/i18n/use-i18n";
import { formatDecimal, formatInteger } from "@/features/i18n/locales";
import { formatPace } from "@/features/running-programs/domain";
import type { KilometreSplit } from "../stream-metrics";
import { STREAM_MESSAGES } from "../stream-messages";
import { STRAVA_MESSAGES } from "../messages";

export function KilometreSplits({ splits }: { splits: KilometreSplit[] }) {
  const { locale, t } = useI18n();
  const text = STREAM_MESSAGES[locale];
  const unavailable = STRAVA_MESSAGES[locale].unavailable;
  return <section className="panel min-w-0 space-y-3" aria-labelledby="kilometre-splits-title" data-kilometre-splits>
    <h2 id="kilometre-splits-title" className="text-xl font-semibold">{text.splits}</h2>
    <p id="kilometre-splits-note" className="text-sm text-stone-600">{text.splitsNote}</p>
    {!splits.length ? <p className="text-sm text-stone-600">{text.splitsEmpty}</p>
      : <div className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-emerald-700"
        role="region" aria-labelledby="kilometre-splits-title" tabIndex={0}>
        <table className="w-full text-left text-sm tabular-nums" aria-describedby="kilometre-splits-note">
          <caption className="sr-only">{text.splits}</caption>
          <thead><tr className="border-b border-stone-200">
            {[text.split, `${text.distance} (${t.units.km})`, `${text.pace} (${t.units.min}/${t.units.km})`,
              `${text.averageHr} (bpm)`, `${text.maxHr} (bpm)`].map((label) =>
              <th key={label} scope="col" className="px-2 py-3 font-semibold">{label}</th>)}
          </tr></thead>
          <tbody>{splits.map((split) => <tr key={split.number} className="border-b border-stone-200 last:border-0">
            <th scope="row" className="px-2 py-3 font-medium">{formatInteger(locale, split.number)}</th>
            <td className="px-2 py-3">{formatDecimal(locale, split.meters / 1000, 3)}</td>
            <td className="whitespace-nowrap px-2 py-3 font-mono">{split.pace === null ? unavailable : formatPace(split.pace)}</td>
            <td className="px-2 py-3">{split.averageHr === null ? unavailable : formatDecimal(locale, split.averageHr, 1)}</td>
            <td className="px-2 py-3">{split.maxHr === null ? unavailable : formatDecimal(locale, split.maxHr, 1)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}
