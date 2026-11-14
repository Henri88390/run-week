"use client";

import { useI18n } from "@/features/i18n/use-i18n";
import { formatDecimal, formatInteger } from "@/features/i18n/locales";
import { formatPace } from "@/features/running-programs/domain";
import type { KilometreSplit } from "../stream-metrics";
import { STREAM_MESSAGES } from "../stream-messages";
import { STRAVA_MESSAGES } from "../messages";
import { DisclosureHeading } from "./disclosure-heading";

export function KilometreSplits({ splits, selected = [], onToggle }: {
  splits: KilometreSplit[]; selected?: readonly number[]; onToggle?: (number: number) => void;
}) {
  const { locale, t } = useI18n();
  const text = STREAM_MESSAGES[locale];
  const unavailable = STRAVA_MESSAGES[locale].unavailable;
  return <details open className="group/disclosure panel min-w-0" data-kilometre-splits>
    <DisclosureHeading id="kilometre-splits-title" title={text.splits} />
    <div className="mt-3 space-y-3">
    <p id="kilometre-splits-note" className="text-sm text-stone-600">{text.splitsNote}</p>
    {onToggle && splits.length > 0 && <p id="kilometre-selection-note" className="text-sm text-stone-600">{text.selectionHelp}</p>}
    {!splits.length ? <p className="text-sm text-stone-600">{text.splitsEmpty}</p>
      : <div className="overflow-x-auto rounded-sm focus-visible:outline-2 focus-visible:outline-emerald-700"
        role="region" aria-labelledby="kilometre-splits-title" tabIndex={0}>
        <table className="w-full text-left text-sm tabular-nums" aria-describedby={onToggle ? "kilometre-splits-note kilometre-selection-note" : "kilometre-splits-note"}>
          <caption className="sr-only">{text.splits}</caption>
          <thead><tr className="border-b border-stone-200">
            {[text.split, `${text.distance} (${t.units.km})`, `${text.pace} (${t.units.min}/${t.units.km})`,
              `${text.averageHr} (bpm)`, `${text.maxHr} (bpm)`].map((label) =>
              <th key={label} scope="col" className="px-2 py-3 font-semibold">{label}</th>)}
          </tr></thead>
          <tbody>{splits.map((split) => <tr key={split.number} data-selected={selected.includes(split.number)}
            onClick={onToggle ? () => onToggle(split.number) : undefined}
            className={`border-b border-stone-200 last:border-0 ${onToggle ? "cursor-pointer" : ""} ${selected.includes(split.number) ? "bg-emerald-50 text-emerald-950" : ""}`}>
            <th scope="row" className="px-2 py-3 font-medium">{onToggle
              ? <button type="button" aria-pressed={selected.includes(split.number)}
                aria-label={`${text.split} ${formatInteger(locale, split.number)}`}
                onClick={(event) => { event.stopPropagation(); onToggle(split.number); }}
                className="min-h-11 min-w-11 rounded-lg border border-stone-300 px-3 font-semibold aria-pressed:border-emerald-700 aria-pressed:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
                {formatInteger(locale, split.number)}
              </button> : formatInteger(locale, split.number)}</th>
            <td className="px-2 py-3">{formatDecimal(locale, split.meters / 1000, 3)}</td>
            <td className="whitespace-nowrap px-2 py-3 font-mono">{split.pace === null ? unavailable : formatPace(split.pace)}</td>
            <td className="px-2 py-3">{split.averageHr === null ? unavailable : formatDecimal(locale, split.averageHr, 1)}</td>
            <td className="px-2 py-3">{split.maxHr === null ? unavailable : formatDecimal(locale, split.maxHr, 1)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
  </details>;
}
