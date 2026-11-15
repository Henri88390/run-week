"use client";

import { memo, useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal, formatInteger, weekdayName } from "@/features/i18n/locales";
import { STRAVA_MESSAGES } from "../messages";
import { CALENDAR_MESSAGES } from "../calendar-messages";
import { CROSS_TRAINING_MESSAGES } from "../cross-training-messages";
import { VOLUME_CHART_MESSAGES } from "../volume-chart-messages";
import { roundedDuration } from "../analytics";
import type { DashboardData } from "../types";
import { volumeAxisMaximum } from "../volume-chart";

type Point = { index: number; running: number; cross: number; total: number };

export const VolumeChart = memo(function VolumeChart({ buckets: periodBuckets, alternateBuckets = [], view, showCrossTraining = true }: {
  buckets: DashboardData["volumeBuckets"]; alternateBuckets?: DashboardData["volumeBuckets"];
  view: "year" | "month" | "months" | "week"; showCrossTraining?: boolean;
}) {
  const { locale, t } = useI18n();
  const text = VOLUME_CHART_MESSAGES[locale];
  const calendarText = CALENDAR_MESSAGES[locale];
  const crossLabel = CROSS_TRAINING_MESSAGES[locale].label;
  const [series, setSeries] = useState<"distance" | "time">("distance");
  const radioName = useId();
  // Periods longer than a month can be grouped by week or month; the other grouping comes precomputed.
  const defaultGranularity = view === "year" ? "month" : "week";
  const [granularityChoice, setGranularityChoice] = useState<"week" | "month" | null>(null);
  const groupable = (view === "months" || view === "year") && alternateBuckets.length > 0;
  const granularity = groupable ? granularityChoice ?? defaultGranularity : defaultGranularity;
  const buckets = granularity === defaultGranularity ? periodBuckets : alternateBuckets;
  const perMonth = view !== "week" && view !== "month" && granularity === "month";
  const granularityName = useId();
  const distance = series === "distance";
  // Distances of different sports are not comparable, so only time includes cross-training.
  const hasCross = !distance && showCrossTraining && buckets.some((bucket) => bucket.crossSeconds > 0);
  const [includeRun, setIncludeRun] = useState(true);
  const [includeCross, setIncludeCross] = useState(true);
  const run = !hasCross || includeRun;
  const crossOn = hasCross && includeCross;
  const [layout, setLayout] = useState<"combined" | "separate">("combined");
  const separate = run && crossOn && layout === "separate";
  const layoutName = useId();
  const hintId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const points: Point[] = buckets.map((bucket, index) => {
    const running = !run ? 0 : distance ? bucket.distanceMeters / 1000 : bucket.movingSeconds / 3600;
    const cross = crossOn ? bucket.crossSeconds / 3600 : 0;
    return { index, running, cross, total: running + cross };
  });
  const maximum = volumeAxisMaximum(points.map((point) => separate ? Math.max(point.running, point.cross) : point.total), distance ? 5 : 1);
  const ticks = [0, .25, .5, .75, 1].map((fraction) => maximum * fraction);
  const runColor = distance ? "var(--chart-blue)" : hasCross ? "var(--chart-run)" : "var(--chart-emerald)";
  const crossColor = "var(--chart-cross)";
  const runText = hasCross ? "var(--chart-run-text)" : runColor;
  const crossText = "var(--chart-cross-text)";
  const label = (index: number) => {
    const bucket = buckets[index];
    if (!bucket) return "";
    if (view === "week") return weekdayName(locale, index, "short");
    if (perMonth) return new Date(`${bucket.start}T00:00:00Z`).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
    if (view !== "month") return new Date(`${bucket.start}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
    return `${Number(bucket.start.slice(-2))}–${Number(bucket.end.slice(-2))}`;
  };
  // Dense weekly charts scroll horizontally and label every other week.
  const dense = buckets.length > 20;
  const chartWidth = view === "week" || view === "month" ? undefined
    : Math.max(view === "year" ? 640 : 340, buckets.length * (dense ? 30 : 52));
  const duration = (seconds: number) => {
    const { hours, minutes } = roundedDuration(seconds);
    return hours > 0 ? `${hours} ${t.units.h} ${String(minutes).padStart(2, "0")} ${t.units.min}` : `${minutes} ${t.units.min}`;
  };
  const km = (meters: number) => `${Math.round(meters / 1000).toLocaleString(locale)} ${t.units.km}`;
  const details = (index: number) => {
    const bucket = buckets[index];
    const range = `${formatDate(locale, bucket.start)}${bucket.start !== bucket.end ? ` – ${formatDate(locale, bucket.end)}` : ""}`;
    if (distance) return `${range}: ${km(bucket.distanceMeters)}`;
    if (!hasCross) return `${range}: ${duration(bucket.movingSeconds)}`;
    const parts = [
      ...run ? [`${calendarText.running} ${duration(bucket.movingSeconds)}`] : [],
      ...crossOn ? [`${crossLabel} ${duration(bucket.crossSeconds)}`] : [],
      ...run && crossOn ? [`${calendarText.total} ${duration(bucket.movingSeconds + bucket.crossSeconds)}`] : [],
    ];
    return `${range}: ${parts.join(" · ")}`;
  };
  const periodSummary = distance ? km(buckets.reduce((sum, bucket) => sum + bucket.distanceMeters, 0))
    : duration(buckets.reduce((sum, bucket) => sum + (run ? bucket.movingSeconds : 0) + (crossOn ? bucket.crossSeconds : 0), 0));
  const formatValue = (value: number) => distance ? Math.round(value).toLocaleString(locale)
    : Math.round(value * 10) === 0 ? formatInteger(locale, 0) : formatDecimal(locale, value);
  const topColor = crossOn && !separate ? crossColor : runColor;
  // Separate mode labels the higher series above its point and the lower one below, so values never overlap.
  const marker = (key: "total" | "running" | "cross", color: string, focusable: boolean) =>
    function Marker({ cx, cy, index }: { cx?: number | string; cy?: number | string; index: number }) {
      const point = points[index];
      if (!point || cx == null || cy == null) return <g key={index} />;
      const value = point[key];
      const other = key === "running" ? point.cross : key === "cross" ? point.running : -1;
      const below = separate && value < other;
      const label = !(separate && key === "cross" && value === other);
      const dot = <>
        <circle data-volume-distance={distance ? "" : undefined} data-volume-time={!distance ? "" : undefined}
          data-volume-dot={key} cx={cx} cy={cy} r={selected === index ? 5 : 3.5} fill={color} stroke="var(--chart-dot-stroke)" strokeWidth="2" />
        {label && <text data-volume-value={key} x={cx} y={Number(cy) + (below ? 16 : -10)} textAnchor="middle" fill={color} fontSize={11} fontWeight={600}>
          {formatValue(value)}
        </text>}
      </>;
      return focusable ? <g key={index} data-volume-bucket={index} role="img" aria-label={details(index)} tabIndex={0}
        onFocus={() => setSelected(index)} onBlur={() => setSelected(null)}
        className="focus-visible:outline-2 focus-visible:outline-stone-700">
        <circle cx={cx} cy={cy} r="14" fill="transparent" />{dot}
      </g> : <g key={index} aria-hidden="true">{dot}</g>;
    };
  const seriesToggle = (name: string, color: string, textColor: string, checked: boolean, onChange: (value: boolean) => void, key: string) =>
    <label key={key} data-volume-series-label={key} style={{ color: textColor, borderColor: checked ? color : undefined }}
      className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-stone-200 bg-white px-3 py-1 text-sm font-semibold has-checked:shadow-sm has-focus-visible:outline-2 has-disabled:cursor-default">
      <input type="checkbox" data-volume-series={key} aria-label={`${text.title}: ${name}`} checked={checked} disabled={checked && !(run && crossOn)}
        onChange={(event) => onChange(event.target.checked)} className="size-4" style={{ accentColor: color }} />
      <span aria-hidden="true" className="h-1 w-4 rounded-full" style={{ backgroundColor: color }} />{name}
    </label>;
  const layoutIcon = (option: "combined" | "separate") => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
    {option === "combined" ? <path d="M3 20h18M3 20v-6l6-3 6 2 6-4v11M3 14l6-5 6 1 6-6" /> : <path d="M3 20h18M3 17l6-4 6 2 6-5M3 10l6-5 6 3 6-4" />}
  </svg>;
  return <section data-volume-chart className="panel space-y-3">
    <h2 className="text-xl font-semibold">{text.title}</h2>
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div role="radiogroup" aria-label={text.title} className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-blue-800"><input type="radio" name={radioName} checked={distance}
          onChange={() => setSeries("distance")} />{STRAVA_MESSAGES[locale].distance} ({t.units.km})</label>
        <label className="flex items-center gap-2 text-emerald-800"><input type="radio" name={radioName} checked={!distance}
          onChange={() => setSeries("time")} />{calendarText.time} ({t.units.h})</label>
      </div>
      {groupable && <div data-volume-granularity role="radiogroup" aria-label={`${text.title}: ${text.groupBy}`} className="flex items-center gap-2">
        <span aria-hidden="true" className="text-xs font-medium text-stone-600">{text.groupBy}</span>
        <span className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm">
          {(["week", "month"] as const).map((option) => <label key={option}
            className="relative flex cursor-pointer items-center rounded-md px-3 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 has-checked:bg-stone-800 has-checked:font-semibold has-checked:text-stone-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-1">
            <input type="radio" name={granularityName} value={option} checked={granularity === option}
              onChange={() => { setGranularityChoice(option); setSelected(null); }}
              className="absolute inset-0 cursor-pointer appearance-none opacity-0" />
            {option === "week" ? text.perWeek : text.perMonth}
          </label>)}
        </span>
      </div>}
    </div>
    <div className="min-w-0 space-y-2 rounded-xl bg-stone-50/60 p-2">
      {hasCross && <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-1">
        <fieldset data-volume-legend className="flex flex-wrap gap-2">
          <legend className="sr-only">{text.title}</legend>
          {seriesToggle(calendarText.running, runColor, runText, includeRun, setIncludeRun, "running")}
          {seriesToggle(crossLabel, crossColor, crossText, includeCross, setIncludeCross, "cross")}
        </fieldset>
        {run && crossOn && <div className="space-y-1">
          <div data-volume-layout role="radiogroup" aria-label={`${text.title}: ${text.display}`} aria-describedby={hintId}
            className="flex items-center gap-2">
            <span aria-hidden="true" className="text-xs font-medium text-stone-600">{text.display}</span>
            <span className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm">
              {(["combined", "separate"] as const).map((option) => <label key={option} title={text[`${option}Hint`]}
                className="relative flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium text-stone-700 hover:bg-stone-100 has-checked:bg-stone-800 has-checked:font-semibold has-checked:text-stone-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-1">
                <input type="radio" name={layoutName} value={option} checked={layout === option} onChange={() => setLayout(option)}
                  className="absolute inset-0 cursor-pointer appearance-none opacity-0" />{layoutIcon(option)}{text[option]}
              </label>)}
            </span>
          </div>
          <p id={hintId} data-volume-layout-hint className="max-w-xs text-xs text-stone-600">{text[`${layout}Hint`]}</p>
        </div>}
      </div>}
      <div className="px-1">
        <output aria-live="polite" className="block min-h-6 text-sm font-semibold tabular-nums"
          style={{ color: selected === null ? undefined : crossOn && !separate ? crossText : runText }}>
          {selected !== null && buckets[selected] ? details(selected) : `${calendarText.total}: ${periodSummary}`}
        </output>
      </div>
      <div className="overflow-x-auto">
        <div role="group" aria-label={text.title}
          className={`h-60 sm:h-64 [&_.recharts-surface]:outline-none ${view === "year" ? "min-w-[640px]" : "min-w-[340px]"}`}
          style={chartWidth ? { minWidth: chartWidth } : undefined}
          onMouseLeave={() => setSelected(null)}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <AreaChart data={points} accessibilityLayer={false} margin={{ top: 26, right: 16, bottom: 0, left: 0 }}
              onMouseMove={(state) => { if (state.activeTooltipIndex != null) setSelected(Number(state.activeTooltipIndex)); }}
              onClick={(state) => { if (state.activeTooltipIndex != null) setSelected(Number(state.activeTooltipIndex)); }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 6" />
              <XAxis dataKey="index" type="number" domain={[0, Math.max(1, buckets.length - 1)]} ticks={points.filter((point) => !dense || point.index % 2 === 0).map((point) => point.index)}
                tickLine={false} axisLine={false} interval={0} padding={{ left: 18, right: 18 }}
                tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(value: number) => label(value)} />
              <YAxis domain={[0, maximum]} ticks={ticks} width={44} tickLine={false} axisLine={false}
                tick={({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: number } }) =>
                  <text data-volume-km-tick={distance ? "" : undefined} data-volume-hours-tick={!distance ? "" : undefined}
                    x={Number(x) - 4} y={Number(y)} dy={4} textAnchor="end" fill="var(--chart-axis)" fontSize={11}>
                    {formatInteger(locale, payload?.value ?? 0)}
                  </text>}
                label={{ value: distance ? t.units.km : t.units.h, position: "insideTopLeft", dy: -24, fill: "var(--chart-axis)", fontSize: 11 }} />
              <Tooltip content={() => null} cursor={false} isAnimationActive={false} />
              {selected !== null && <ReferenceLine x={selected} stroke="var(--chart-cursor)" strokeDasharray="4 4" />}
              {run && <Area className="volume-running" dataKey="running" stackId={separate ? undefined : "volume"} type="monotone" stroke={runColor} strokeWidth={2}
                fill={runColor} fillOpacity={!hasCross ? .08 : separate ? .1 : .24} activeDot={false} isAnimationActive={false}
                dot={separate ? marker("running", runColor, true) : false} />}
              {crossOn && <Area className="volume-cross" dataKey="cross" stackId={separate ? undefined : "volume"} type="monotone" stroke={crossColor} strokeWidth={2}
                fill={crossColor} fillOpacity={separate ? .1 : .24} activeDot={false} isAnimationActive={false}
                dot={separate ? marker("cross", crossColor, false) : false} />}
              {/* Combined: an unfilled total series puts one focusable, labeled marker per bucket on top of the stack. */}
              {!separate && <Area dataKey="total" stroke="none" fill="none" isAnimationActive={false} activeDot={false} legendType="none"
                dot={marker("total", topColor, true)} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      {(view === "month" || view === "months") && buckets[0] && <p data-volume-month className="text-center text-xs text-stone-500">
        {view === "months"
          ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
            .formatRange(new Date(`${buckets[0].start}T00:00:00Z`), new Date(`${buckets.at(-1)?.end ?? buckets[0].start}T00:00:00Z`))
          : new Date(`${buckets[0].start}T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}
      </p>}
    </div>
  </section>;
});
