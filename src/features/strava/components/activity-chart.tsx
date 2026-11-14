"use client";

import { memo, useCallback, useId, useMemo, useState } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDecimal, formatInteger } from "@/features/i18n/locales";
import { formatPace } from "@/features/running-programs/domain";
import { HEART_RATE_MESSAGES } from "../heart-rate-messages";
import { ELEVATION_MESSAGES, STRAVA_MESSAGES } from "../messages";
import { SMOOTHING_MESSAGES } from "../sync-messages";
import { ACTIVITY_CHART_MESSAGES } from "../activity-chart-messages";
import { chartExtent, chartRows, markChartWork, type ChartAxis, type ChartPoint } from "../activity-chart-data";
import { ActivityChartTrack } from "./activity-chart-track";
import type { SplitInterval } from "../split-selection";
import type { ZoneSelection } from "./activity-chart-track";
import { DisclosureHeading } from "./disclosure-heading";

export type { ChartPoint } from "../activity-chart-data";

export const ActivityChart = memo(function ActivityChart({ points, intervals, zones }: {
  points: ChartPoint[]; intervals: SplitInterval[]; zones: ZoneSelection;
}) {
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const copy = ACTIVITY_CHART_MESSAGES[locale];
  const helpId = useId();
  const [selectedAxis, setSelectedAxis] = useState<ChartAxis>("time");
  const [selected, setSelected] = useState<number | null>(null);
  const data = useMemo(() => { markChartWork("rows"); return chartRows(points); }, [points]);
  const extents = useMemo(() => {
    markChartWork("stats");
    return { pace: chartExtent(points, "pace"), hr: chartExtent(points, "hr"), altitude: chartExtent(points, "altitude") };
  }, [points]);
  const point = selected === null ? null : data[selected] ?? null;
  const firstDistance = data[0]?.distance;
  const lastDistance = data.at(-1)?.distance;
  const distanceAvailable = firstDistance != null && lastDistance != null && lastDistance > firstDistance
    && data.every((row) => row.distance !== null);
  const axis: ChartAxis = distanceAvailable ? selectedAxis : "time";
  const metrics = useMemo(() => [
    { key: "pace" as const, label: HEART_RATE_MESSAGES[locale].pace, color: "var(--chart-pace)", unit: `${t.units.min}/${t.units.km}`,
      format: (value: number) => formatPace(value) },
    { key: "hr" as const, label: text.heartRate, color: "var(--chart-hr)", unit: "bpm",
      format: (value: number) => formatInteger(locale, Math.round(value)) },
    { key: "altitude" as const, label: ELEVATION_MESSAGES[locale].altitude, color: "var(--chart-altitude)", unit: "m",
      format: (value: number) => formatDecimal(locale, value) },
  ], [locale, text.heartRate, t.units.min, t.units.km]);
  const heading = `${text.heartRate} / ${HEART_RATE_MESSAGES[locale].pace} / ${ELEVATION_MESSAGES[locale].altitude}`;
  const shown = metrics.filter((metric) => extents[metric.key] !== null);
  const choose = useCallback((index: number) => {
    if (Number.isInteger(index) && index >= 0 && index < data.length) {
      setSelected((current) => current === index ? current : index);
    }
  }, [data.length]);
  const formatTime = useCallback((value: number) => {
    const minutes = Math.floor(value / 60);
    const seconds = value - minutes * 60;
    return seconds === 0
      ? `${formatInteger(locale, minutes)} ${t.units.min}`
      : `${formatInteger(locale, minutes)} ${t.units.min} ${formatDecimal(locale, seconds)} ${t.units.sec}`;
  }, [locale, t.units.min, t.units.sec]);
  const formatDistance = useCallback((value: number) => `${formatInteger(locale, value / 1000)} ${t.units.km}`,
    [locale, t.units.km]);
  return <details open data-chart-panel className="group/disclosure panel min-w-0">
    <DisclosureHeading title={heading} />
    <div className="mt-3 space-y-4">
    <p className="text-xs text-stone-500">{SMOOTHING_MESSAGES[locale]}</p>
    {distanceAvailable && <div role="group" aria-label={`${text.time} / ${text.distance}`} className="flex gap-2">
      {([{ key: "time", label: text.time }, { key: "distance", label: text.distance }] as const).map(({ key, label }) =>
        <button key={key} type="button" aria-pressed={axis === key} onClick={() => setSelectedAxis(key)}
          className={`${axis === key ? "button-primary" : "button-secondary"} rounded-full focus-visible:outline-2 focus-visible:outline-offset-2`}>
          {label}
        </button>)}
    </div>}
    <p id={helpId} className="text-xs text-stone-500">{copy.help}</p>
    <div data-activity-chart role="group" tabIndex={0} aria-label={`${heading} · ${text.time}`}
      aria-describedby={helpId} className="min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (!data.length) return;
        let next: number;
        switch (event.key) {
          case "ArrowRight": next = Math.min(data.length - 1, selected === null ? 0 : selected + 1); break;
          case "ArrowLeft": next = Math.max(0, selected === null ? data.length - 1 : selected - 1); break;
          case "Home": next = 0; break;
          case "End": next = data.length - 1; break;
          case "Escape": event.preventDefault(); setSelected(null); return;
          default: return;
        }
        event.preventDefault(); choose(next);
      }}>
      <dl data-chart-readout
        className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-stone-200 bg-stone-50/60 p-3 text-xs tabular-nums sm:grid-cols-5">
        {[{ label: text.time, value: point
          ? `${formatInteger(locale, Math.floor(point.time / 60))} ${t.units.min} ${formatDecimal(locale, point.time % 60)} ${t.units.sec}` : text.unavailable },
          { label: text.distance, value: point?.distance != null && !point.separator
            ? `${formatDecimal(locale, point.distance / 1000, 2)} ${t.units.km}` : text.unavailable },
          ...metrics.map((metric) => {
            const value = point?.[metric.key];
            return { label: metric.label, value: value != null ? `${metric.format(value)} ${metric.unit}` : text.unavailable };
          }),
        ].map(({ label, value }) => <div key={label}><dt className="text-stone-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
      </dl>
      <div className="mt-3 space-y-3">
        {shown.map((metric) => <ActivityChartTrack key={metric.key} data={data} metric={metric.key} label={metric.label}
          color={metric.color} unit={metric.unit} format={metric.format}
          axis={axis} formatTime={formatTime} formatDistance={formatDistance}
          extent={extents[metric.key]} unavailable={text.unavailable}
          selected={point} intervals={intervals} zones={zones} onSelect={choose} />)}
        {!shown.length && <p className="py-4 text-sm text-stone-500">{text.streamMissing}</p>}
      </div>
    </div>
    {metrics.map((metric) => {
      const extent = extents[metric.key];
      return <p key={metric.key} className="text-sm" style={{ color: metric.color }}>{metric.label}: {extent
        ? `${metric.format(extent.min)}–${metric.format(extent.max)} ${metric.unit}` : text.unavailable}</p>;
    })}
    {extents.hr !== null && <p className="text-xs text-stone-500">{copy.zones}</p>}
    </div>
  </details>;
});
