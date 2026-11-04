"use client";

import { memo, useId, useState } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal, weekdayName } from "@/features/i18n/locales";
import { STRAVA_MESSAGES } from "../messages";
import { CALENDAR_MESSAGES } from "../calendar-messages";
import { VOLUME_CHART_MESSAGES } from "../volume-chart-messages";
import { roundedDuration } from "../analytics";
import type { DashboardData } from "../types";
import { volumeAxisMaximum } from "../volume-chart";

export const VolumeChart = memo(function VolumeChart({ buckets, view }: {
  buckets: DashboardData["volumeBuckets"]; view: "year" | "month" | "week";
}) {
  const { locale, t } = useI18n();
  const text = VOLUME_CHART_MESSAGES[locale];
  const [series, setSeries] = useState<"distance" | "time">("distance");
  const radioName = useId();
  const distance = series === "distance";
  const [selected, setSelected] = useState<number | null>(null);
  const maxKm = volumeAxisMaximum(buckets.map((bucket) => bucket.distanceMeters / 1000), 5);
  const maxHours = volumeAxisMaximum(buckets.map((bucket) => bucket.movingSeconds / 3600), 1);
  const maximum = distance ? maxKm : maxHours;
  const color = distance ? "#2563eb" : "#059669";
  const value = (index: number) => distance ? buckets[index].distanceMeters / 1000 : buckets[index].movingSeconds / 3600;
  const x = (index: number) => 70 + index * 560 / Math.max(1, buckets.length - 1);
  const y = (index: number) => 240 - value(index) / maximum * 200;
  const label = (index: number) => {
    const bucket = buckets[index];
    if (view === "year") return new Date(`${bucket.start}T00:00:00Z`).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
    if (view === "week") return weekdayName(locale, index, "short");
    return `${Number(bucket.start.slice(-2))}–${Number(bucket.end.slice(-2))}`;
  };
  const details = (index: number) => {
    const bucket = buckets[index];
    const duration = roundedDuration(bucket.movingSeconds);
    return `${formatDate(locale, bucket.start)}${bucket.start !== bucket.end ? ` – ${formatDate(locale, bucket.end)}` : ""}: ${distance
      ? `${Math.round(bucket.distanceMeters / 1000).toLocaleString(locale)} ${t.units.km}`
      : `${duration.hours} ${t.units.h} ${duration.minutes} ${t.units.min}`}`;
  };
  return <section data-volume-chart className="panel space-y-3">
    <h2 className="text-xl font-semibold">{text.title}</h2>
    <div role="radiogroup" aria-label={text.title} className="flex flex-wrap gap-5">
      <label className="flex items-center gap-2 text-blue-800"><input type="radio" name={radioName} checked={distance}
        onChange={() => setSeries("distance")} />{STRAVA_MESSAGES[locale].distance} ({t.units.km})</label>
      <label className="flex items-center gap-2 text-emerald-800"><input type="radio" name={radioName} checked={!distance}
        onChange={() => setSeries("time")} />{CALENDAR_MESSAGES[locale].time} ({t.units.h})</label>
    </div>
    <div className="overflow-x-auto">
    <svg role="group" aria-label={text.title} viewBox="0 0 700 300" className={`w-full ${view === "year" ? "min-w-[700px]" : "min-w-[380px]"}`}>
      <title>{text.title}</title>
      <text x="60" y="18" fill={color} fontSize="16">{distance ? t.units.km : t.units.h}</text>
      {[0, .25, .5, .75, 1].map((fraction) => <g key={fraction}>
        <line x1="60" x2="620" y1={240 - fraction * 200} y2={240 - fraction * 200} stroke="#e7e5e4" />
        <text data-volume-km-tick={distance ? "" : undefined} data-volume-hours-tick={!distance ? "" : undefined}
          x="50" y={245 - fraction * 200} textAnchor="end" fill={color} fontSize="16">{formatDecimal(locale, maximum * fraction)}</text>
      </g>)}
      <polyline data-volume-line points={buckets.map((_, index) => `${x(index)},${y(index)}`).join(" ")}
        fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {buckets.map((bucket, index) => <g key={bucket.start} data-volume-bucket={index}>
        <g role="img" aria-label={details(index)} tabIndex={0}
          onMouseEnter={() => setSelected(index)} onMouseLeave={() => setSelected(null)}
          onFocus={() => setSelected(index)} onBlur={() => setSelected(null)}
          className="focus-visible:outline-2 focus-visible:outline-stone-700">
          <title>{details(index)}</title>
          <circle cx={x(index)} cy={y(index)} r="15" fill="transparent" />
          <circle data-volume-distance={distance ? "" : undefined} data-volume-time={!distance ? "" : undefined}
            cx={x(index)} cy={y(index)} r="5" fill={color} stroke="white" strokeWidth="2" />
          <text data-volume-value x={x(index)} y={y(index) - 13} textAnchor="middle" fill={color} fontSize="14">
            {distance ? Math.round(value(index)).toLocaleString(locale) : formatDecimal(locale, value(index))}
          </text>
        </g>
        <text x={x(index)} y="267" textAnchor="middle" fontSize={view === "year" ? 14 : 16} fill="#57534e">{label(index)}</text>
      </g>)}
      {view === "month" && buckets[0] && <text data-volume-month x="350" y="292" textAnchor="middle" fontSize="16" fill="#57534e">
        {new Date(`${buckets[0].start}T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}
      </text>}
    </svg>
    </div>
    <p aria-live="polite" className="min-h-6 text-sm tabular-nums text-stone-600">{selected !== null && buckets[selected] ? details(selected) : null}</p>
  </section>;
});
