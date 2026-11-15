"use client";

import { memo, useId, useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal, formatInteger, weekdayName } from "@/features/i18n/locales";
import { STRAVA_MESSAGES } from "../messages";
import { CALENDAR_MESSAGES } from "../calendar-messages";
import { CROSS_TRAINING_MESSAGES, sportLabel } from "../cross-training-messages";
import { VOLUME_CHART_MESSAGES } from "../volume-chart-messages";
import { roundedDuration } from "../analytics";
import type { DashboardData } from "../types";
import { volumeAxisMaximum } from "../volume-chart";
import { CrossTrainingIcon, SportIcon, sportKind } from "./sport-icon";

type Bucket = DashboardData["volumeBuckets"][number];
type Series = { key: string; name: string; color: string; text: string; sport?: string; value: (bucket: Bucket) => number };
type Point = { index: number; values: Record<string, number>; total: number };

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
  const [crossMode, setCrossMode] = useState<"combined" | "sports">("combined");
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<string>>(new Set());
  // Sports are grouped by calendar color family, the largest volume first.
  const kinds = [...buckets.reduce((map, bucket) => {
    for (const [sport, seconds] of Object.entries(bucket.crossSports)) {
      const kind = sportKind(sport);
      const entry = map.get(kind) ?? { kind, sports: new Set<string>(), seconds: 0 };
      entry.sports.add(sport);
      entry.seconds += seconds;
      map.set(kind, entry);
    }
    return map;
  }, new Map<string, { kind: string; sports: Set<string>; seconds: number }>()).values()].sort((a, b) => b.seconds - a.seconds);
  const splittable = hasCross && includeCross && kinds.length > 1;
  const bySport = splittable && crossMode === "sports";
  const shownKinds = kinds.filter((entry) => !hiddenKinds.has(entry.kind));
  const visibleKinds = bySport ? (shownKinds.length > 0 || run ? shownKinds : kinds) : [];
  const crossOn = hasCross && includeCross && (!bySport || visibleKinds.length > 0);
  const runColor = distance ? "var(--chart-blue)" : hasCross ? "var(--chart-run)" : "var(--chart-emerald)";
  const crossColor = "var(--chart-cross)";
  const runText = hasCross ? "var(--chart-run-text)" : runColor;
  const crossText = "var(--chart-cross-text)";
  const lines: Series[] = [
    ...run ? [{ key: "running", name: calendarText.running, color: runColor, text: runText,
      value: (bucket: Bucket) => distance ? bucket.distanceMeters / 1000 : bucket.movingSeconds / 3600 }] : [],
    ...bySport ? visibleKinds.map((entry) => ({ key: entry.kind, sport: [...entry.sports][0],
      name: [...entry.sports].map((sport) => sportLabel(locale, sport)).join(" / "),
      color: `var(--chart-sport-${entry.kind})`, text: `var(--chart-sport-${entry.kind}-text)`,
      value: (bucket: Bucket) => Object.entries(bucket.crossSports)
        .reduce((sum, [sport, seconds]) => sum + (sportKind(sport) === entry.kind ? seconds : 0), 0) / 3600 }))
      : crossOn ? [{ key: "cross", name: crossLabel, color: crossColor, text: crossText, value: (bucket: Bucket) => bucket.crossSeconds / 3600 }] : [],
  ];
  const [layout, setLayout] = useState<"combined" | "separate">("combined");
  const separate = lines.length > 1 && layout === "separate";
  const layoutName = useId();
  const crossModeName = useId();
  const hintId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const points: Point[] = buckets.map((bucket, index) => {
    const values = Object.fromEntries(lines.map((entry) => [entry.key, entry.value(bucket)]));
    return { index, values, total: lines.reduce((sum, entry) => sum + values[entry.key], 0) };
  });
  const maximum = volumeAxisMaximum(points.map((point) => separate ? Math.max(...Object.values(point.values)) : point.total), distance ? 5 : 1);
  const ticks = [0, .25, .5, .75, 1].map((fraction) => maximum * fraction);
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
    const seconds = (entry: Series) => entry.value(bucket) * 3600;
    const parts = [
      ...lines.filter((entry) => !bySport || entry.key === "running" || seconds(entry) > 0)
        .map((entry) => `${entry.name} ${duration(seconds(entry))}`),
      ...lines.length > 1 ? [`${calendarText.total} ${duration(lines.reduce((sum, entry) => sum + seconds(entry), 0))}`] : [],
    ];
    return `${range}: ${parts.join(" · ")}`;
  };
  const periodSummary = distance ? km(buckets.reduce((sum, bucket) => sum + bucket.distanceMeters, 0))
    : duration(buckets.reduce((sum, bucket) => sum + lines.reduce((total, entry) => total + entry.value(bucket) * 3600, 0), 0));
  const formatValue = (value: number) => distance ? Math.round(value).toLocaleString(locale)
    : Math.round(value * 10) === 0 ? formatInteger(locale, 0) : formatDecimal(locale, value);
  const top = lines.at(-1);
  const topColor = top?.color ?? runColor;
  // Separate mode labels the highest line above its point (and with two lines, the lower one below), so values never overlap.
  const marker = (key: string, color: string, focusable: boolean) =>
    function Marker({ cx, cy, index }: { cx?: number | string; cy?: number | string; index: number }) {
      const point = points[index];
      if (!point || cx == null || cy == null) return <g key={index} />;
      const value = key === "total" ? point.total : point.values[key] ?? 0;
      const others = lines.filter((entry) => entry.key !== key);
      const order = lines.findIndex((entry) => entry.key === key);
      const otherValue = (entry: Series) => point.values[entry.key] ?? 0;
      // Ties keep the label on the first series in legend order.
      const highest = others.every((entry) => value > otherValue(entry) || (value === otherValue(entry) && order < lines.indexOf(entry)));
      const lowest = lines.length === 2 && others.every((entry) => value < otherValue(entry));
      const label = !separate || highest || lowest;
      const below = separate && lowest;
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
  const seriesToggle = (key: string, name: string, color: string, textColor: string, checked: boolean, onChange: (value: boolean) => void, sport?: string) =>
    <label key={key} data-volume-series-label={key} style={{ color: textColor, borderColor: checked ? color : undefined }}
      className="flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-stone-200 bg-white px-2.5 py-0.5 text-sm font-semibold has-checked:shadow-sm has-focus-visible:outline-2 has-disabled:cursor-default sm:gap-2 sm:px-3 sm:py-1">
      <input type="checkbox" data-volume-series={key} aria-label={`${text.title}: ${name}`} checked={checked} disabled={checked && lines.length === 1}
        onChange={(event) => onChange(event.target.checked)} className="size-4" style={{ accentColor: color }} />
      {sport ? <SportIcon sport={sport} className="size-4" />
        : <span aria-hidden="true" className="h-1 w-4 rounded-full" style={{ backgroundColor: color }} />}{name}
    </label>;
  const segmentClass = "relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 has-checked:bg-stone-800 has-checked:font-semibold has-checked:text-stone-50 has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-1";
  // Every option uses the same labeled segmented control so the toolbar reads as one consistent set.
  const segmented = <T extends string>(key: string, label: string, name: string, value: T,
    options: readonly { value: T; content: ReactNode; title?: string }[], onChange: (value: T) => void, describedBy?: string) =>
    <div {...{ [`data-volume-${key}`]: "" }} role="radiogroup" aria-label={`${text.title}: ${label}`} aria-describedby={describedBy}
      className="flex flex-col gap-1">
      <span aria-hidden="true" className="text-xs font-medium text-stone-500">{label}</span>
      <span className="inline-flex w-fit rounded-lg border border-stone-300 bg-white p-0.5">
        {options.map((option) => <label key={option.value} title={option.title} className={segmentClass}>
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)}
            className="absolute inset-0 cursor-pointer appearance-none opacity-0" />{option.content}
        </label>)}
      </span>
    </div>;
  const layoutIcon = (option: "combined" | "separate") => <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
    {option === "combined" ? <path d="M3 20h18M3 20v-6l6-3 6 2 6-4v11M3 14l6-5 6 1 6-6" /> : <path d="M3 20h18M3 17l6-4 6 2 6-5M3 10l6-5 6 3 6-4" />}
  </svg>;
  const sportBars = <span aria-hidden="true" className="flex gap-0.5">
    {kinds.slice(0, 3).map((entry) => <span key={entry.kind} className="h-3 w-1 rounded-full"
      style={{ backgroundColor: `var(--chart-sport-${entry.kind})` }} />)}
  </span>;
  return <section data-volume-chart className="panel space-y-4">
    <h2 className="text-xl font-semibold">{text.title}</h2>
    <div data-volume-options className="flex flex-wrap items-end gap-x-5 gap-y-3">
      {segmented("measure", text.measure, radioName, series, [
        { value: "distance", content: `${STRAVA_MESSAGES[locale].distance} (${t.units.km})` },
        { value: "time", content: `${calendarText.time} (${t.units.h})` }], setSeries)}
      {groupable && segmented("granularity", text.groupBy, granularityName, granularity, [
        { value: "week", content: text.perWeek }, { value: "month", content: text.perMonth }],
      (option) => { setGranularityChoice(option); setSelected(null); })}
      {splittable && segmented("cross-mode", crossLabel, crossModeName, crossMode, [
        { value: "combined", content: <><CrossTrainingIcon className="size-4" />{text.allSports}</> },
        { value: "sports", content: <>{sportBars}{text.bySport}</> }], setCrossMode)}
      {lines.length > 1 && segmented("layout", text.display, layoutName, layout, [
        { value: "combined", content: <>{layoutIcon("combined")}{text.combined}</>, title: text.combinedHint },
        { value: "separate", content: <>{layoutIcon("separate")}{text.separate}</>, title: text.separateHint }], setLayout, hintId)}
    </div>
    <div className="min-w-0 space-y-2 rounded-xl bg-stone-50/60 p-2">
      {hasCross && <fieldset data-volume-legend className="flex flex-wrap gap-2 px-1">
        <legend className="sr-only">{text.title}</legend>
        {seriesToggle("running", calendarText.running, runColor, runText, includeRun, setIncludeRun)}
        {bySport ? kinds.map((entry) => {
          const shown = lines.find((item) => item.key === entry.kind);
          return seriesToggle(entry.kind, [...entry.sports].map((sport) => sportLabel(locale, sport)).join(" / "),
            `var(--chart-sport-${entry.kind})`, `var(--chart-sport-${entry.kind}-text)`, !!shown, (checked) => setHiddenKinds((current) => {
              const next = new Set(current);
              if (checked) next.delete(entry.kind); else next.add(entry.kind);
              return next;
            }), [...entry.sports][0]);
        }) : seriesToggle("cross", crossLabel, crossColor, crossText, includeCross, setIncludeCross)}
      </fieldset>}
      <div className="px-1">
        <output aria-live="polite" className="block min-h-6 text-sm font-semibold tabular-nums"
          style={{ color: selected === null ? undefined : separate || lines.length > 2 ? undefined : top?.text }}>
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
              {lines.map((entry, order) => <Area key={entry.key} className={`volume-${entry.key}`} dataKey={(point: Point) => point.values[entry.key] ?? 0}
                stackId={separate ? undefined : "volume"} type="monotone" stroke={entry.color} strokeWidth={2}
                fill={entry.color} fillOpacity={!hasCross ? .08 : separate ? .1 : .24} activeDot={false} isAnimationActive={false}
                dot={separate ? marker(entry.key, entry.color, order === 0) : false} />)}
              {/* Combined: an unfilled total series puts one focusable, labeled marker per bucket on top of the stack. */}
              {!separate && <Area dataKey="total" stroke="none" fill="none" isAnimationActive={false} activeDot={false} legendType="none"
                dot={marker("total", topColor, true)} />}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      {(lines.length > 1 || ((view === "month" || view === "months") && buckets[0])) && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-stone-500">
        {lines.length > 1 && <p id={hintId} data-volume-layout-hint>{text[`${layout}Hint`]}</p>}
        {(view === "month" || view === "months") && buckets[0] && <p data-volume-month className="ml-auto">
          {view === "months"
            ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
              .formatRange(new Date(`${buckets[0].start}T00:00:00Z`), new Date(`${buckets.at(-1)?.end ?? buckets[0].start}T00:00:00Z`))
            : new Date(`${buckets[0].start}T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}
        </p>}
      </div>}
    </div>
  </section>;
});
