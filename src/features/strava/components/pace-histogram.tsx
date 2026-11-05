"use client";

import { useState } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDecimal, formatInteger } from "@/features/i18n/locales";
import { formatPace } from "@/features/running-programs/domain";
import { CALENDAR_MESSAGES } from "../calendar-messages";
import { HEART_RATE_MESSAGES } from "../heart-rate-messages";
import { STRAVA_MESSAGES } from "../messages";
import type { DashboardData } from "../types";
import { roundedDuration } from "../analytics";

export function PaceHistogram({ distribution }: { distribution: DashboardData["paceDistribution"] }) {
  const { locale, t } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const bins = distribution?.bins ?? [];
  const first = bins[0];
  const last = bins.at(-1);
  const title = CALENDAR_MESSAGES[locale].paceZones;
  if (!distribution || !first || !last) return <article className="panel space-y-3">
    <h2 className="text-xl font-semibold">{title}</h2><p>{STRAVA_MESSAGES[locale].unavailable}</p>
  </article>;
  const maximum = Math.max(1, ...bins.map((bin) => bin.seconds));
  const total = bins.reduce((sum, bin) => sum + bin.seconds, 0);
  const duration = (seconds: number) => {
    const { hours, minutes } = roundedDuration(seconds);
    return `${formatInteger(locale, hours)} ${t.units.h} ${formatInteger(locale, minutes)} ${t.units.min}`;
  };
  const averageLabel = `${STRAVA_MESSAGES[locale].pace}: ${formatPace(distribution.averagePace)} ${t.units.min}/${t.units.km}`;
  const averageX = 110 + (distribution.averagePace - first.start) / (last.end - first.start) * 510;
  const label = (bin: typeof first) =>
    `${formatPace(bin.start)}–${formatPace(bin.end)} ${t.units.min}/${t.units.km}: ${duration(bin.seconds)} (${formatDecimal(locale, bin.seconds / total * 100)}%)`;
  return <article className="panel space-y-3" data-pace-histogram>
    <h2 className="text-xl font-semibold">{title}</h2>
    <svg role="group" aria-label={title} viewBox="0 0 640 290" className="w-full">
      <title>{title}</title>
      <text x="110" y="16" className="fill-stone-600 text-[20px] sm:text-sm">{CALENDAR_MESSAGES[locale].time} ({t.units.h} {t.units.min})</text>
      {[0, .5, 1].map((fraction) => <g key={fraction}>
        <line x1="110" x2="620" y1={230 - fraction * 200} y2={230 - fraction * 200} stroke="var(--chart-grid)" />
        <text x="102" y={234 - fraction * 200} textAnchor="end" className="fill-stone-600 text-[20px] sm:text-sm">
          {duration(maximum * fraction)}
        </text>
      </g>)}
      {bins.map((bin, index) => <rect key={bin.start} role="img" aria-label={label(bin)}
        tabIndex={bin.seconds > 0 ? 0 : undefined} data-pace-bin={index}
        x={110 + index / bins.length * 510} y={230 - bin.seconds / maximum * 200}
        width={510 / bins.length} height={bin.seconds / maximum * 200}
        className="fill-blue-600 hover:fill-blue-800 focus:fill-blue-800 focus-visible:outline-2 focus-visible:outline-blue-900"
        onMouseEnter={() => setSelected(index)} onMouseLeave={() => setSelected(null)}
        onFocus={() => setSelected(index)} onBlur={() => setSelected(null)}>
        <title>{label(bin)}</title>
      </rect>)}
      <line data-average-pace={distribution.averagePace} role="img" aria-label={averageLabel}
        x1={averageX} x2={averageX} y1="30" y2="230" stroke="var(--chart-average-pace)" strokeWidth="3" strokeDasharray="6 4">
        <title>{averageLabel}</title>
      </line>
      {[0, .25, .5, .75, 1].map((fraction) => <text key={fraction}
        x={110 + fraction * 510} y="251" textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}
        className="fill-stone-600 text-[20px] sm:text-sm">{formatPace(first.start + fraction * (last.end - first.start))}</text>)}
      <text x="365" y="278" textAnchor="middle" className="fill-stone-600 text-[20px] sm:text-sm">
        {HEART_RATE_MESSAGES[locale].pace} ({t.units.min}/{t.units.km})
      </text>
    </svg>
    <p className="flex items-center gap-2 text-sm text-stone-600">
      <span aria-hidden="true" className="w-6 shrink-0 border-t-2 border-dashed border-rose-800" />
      {averageLabel}
    </p>
    <p aria-live="polite" className="min-h-6 text-sm tabular-nums text-stone-600">
      {selected !== null && bins[selected] ? label(bins[selected]) : null}
    </p>
  </article>;
}
