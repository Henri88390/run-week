import { createContext, memo, useContext, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea, useXAxisScale, useYAxisScale } from "recharts";
import { activityZoneBounds, PRESET_MAX_HR } from "../analytics";
import { distanceAxisTicks, markChartWork, timeAxisTicks, type ChartAxis, type ChartPoint, type ChartMetric } from "../activity-chart-data";
import { splitAxisBounds, type SplitInterval } from "../split-selection";
import type { ZoneInterval } from "../zone-selection";
import { ACTIVITY_ZONE_COLORS } from "../activity-zone-palette";
import { DisclosureHeading } from "./disclosure-heading";

export type ZoneSelection = { selected: number[]; intervals: ZoneInterval[] };

/** One reusable track: matching margins/scales align all shared cursors. */
type TrackProps = {
  data: ChartPoint[]; metric: ChartMetric; label: string; color: string; unit: string;
  format: (value: number) => string; formatTime: (value: number) => string;
  formatDistance: (value: number) => string; axis: ChartAxis;
  selected: ChartPoint | null; onSelect: (index: number) => void;
  intervals: SplitInterval[];
  zones: ZoneSelection;
  extent: { min: number; max: number } | null; unavailable: string;
};
const CursorPosition = createContext<number | null>(null);
const SplitSelection = createContext<SplitInterval[]>([]);
const ZoneSelectionContext = createContext<ZoneSelection>({ selected: [], intervals: [] });

/** HR uses horizontal ranges; other tracks use at most five memoized interval paths. */
function SelectedZones({ axis, metric }: { axis: ChartAxis; metric: ChartMetric }) {
  const zones = useContext(ZoneSelectionContext);
  const scale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  const paths = useMemo(() => {
    if (metric === "hr") return [];
    markChartWork(`zone-path:${metric}`);
    const groups = ACTIVITY_ZONE_COLORS.map(() => ({ segments: [] as string[], count: 0 }));
    if (!scale || !plot) return [];
    for (const interval of zones.intervals) {
      const bounds = splitAxisBounds(interval, axis);
      if (!bounds) continue;
      const start = scale(bounds[0]), end = scale(bounds[1]);
      if (start === undefined || end === undefined) continue;
      const left = Math.max(plot.x, start), right = Math.min(plot.x + plot.width, end);
      if (!(right > left)) continue;
      const group = groups[interval.zone - 1];
      if (!group) continue;
      group.segments.push(`M${left},${plot.y}H${right}V${plot.y + plot.height}H${left}Z`);
      group.count++;
    }
    return groups.map((group, index) => ({ zone: index + 1, d: group.segments.join(""), count: group.count }));
  }, [zones.intervals, scale, plot, axis, metric]);
  if (!plot) return null;
  return <g pointerEvents="none">
    {metric === "hr" && yScale && zones.selected.map((zone) => {
      const [min, max] = activityZoneBounds(zone);
      const start = yScale(max), end = yScale(min);
      if (start === undefined || end === undefined) return null;
      const top = Math.max(plot.y, start), bottom = Math.min(plot.y + plot.height, end);
      return bottom > top ? <rect key={zone} data-zone-range={zone} data-min={min} data-max={max}
        x={plot.x} y={top} width={plot.width} height={bottom - top}
        fill={ACTIVITY_ZONE_COLORS[zone - 1]} fillOpacity={.28} stroke={ACTIVITY_ZONE_COLORS[zone - 1]} strokeWidth={1} strokeOpacity={.6} /> : null;
    })}
    {paths.filter((path) => path.d).map((path) => <path key={path.zone} data-zone-highlight={path.zone}
      data-interval-count={path.count} d={path.d}
      fill={ACTIVITY_ZONE_COLORS[path.zone - 1]} fillOpacity={.22}
      stroke={ACTIVITY_ZONE_COLORS[path.zone - 1]} strokeOpacity={.65} strokeWidth={1} strokeDasharray="3 3" />)}
  </g>;
}

/** Only the lightweight overlay subscribes; selecting rows never rebuilds chart geometry. */
function SelectedSplits({ axis }: { axis: ChartAxis }) {
  const intervals = useContext(SplitSelection);
  const scale = useXAxisScale();
  const plot = usePlotArea();
  if (!scale || !plot) return null;
  return <g pointerEvents="none">{intervals.map((interval) => {
    const bounds = splitAxisBounds(interval, axis);
    if (!bounds) return null;
    const start = scale(bounds[0]), end = scale(bounds[1]);
    if (start === undefined || end === undefined) return null;
    const left = Math.max(plot.x, start);
    const right = Math.min(plot.x + plot.width, end);
    if (!(right > left)) return null;
    return <rect key={interval.number} data-split-highlight={interval.number}
      data-start={bounds[0]} data-end={bounds[1]}
      x={left} y={plot.y} width={right - left} height={plot.height}
      fill="var(--chart-emerald)" fillOpacity={.18}
      stroke="var(--chart-emerald)" strokeWidth={1} />;
  })}</g>;
}

/** Context updates only this line, without passing selection through AreaChart. */
function SharedCursor() {
  const value = useContext(CursorPosition);
  const scale = useXAxisScale();
  const plot = usePlotArea();
  const x = value !== null && scale ? scale(value) : null;
  if (x == null || !plot) return null;
  return <line className="recharts-reference-line-line" x1={x} x2={x} y1={plot.y} y2={plot.y + plot.height}
    stroke="var(--chart-cursor)" strokeDasharray="4 4" pointerEvents="none" />;
}

export function ActivityChartTrack({ selected, intervals, zones, unavailable, ...props }: TrackProps) {
  const { label, color, unit, metric, format, axis } = props;
  const value = selected?.[metric];
  return <details open data-chart-track={metric} data-chart-axis={axis} className="group/disclosure min-w-0 rounded-xl bg-stone-50/60 p-2">
    <DisclosureHeading title={`${label} (${unit})`} level={3} color={color} />
    <div style={{ color }}>
      <output data-chart-track-readout aria-label={label} aria-live="off" className="font-semibold tabular-nums">
        {value != null ? `${format(value)} ${unit}` : unavailable}
      </output>
    </div>
    <CursorPosition value={selected?.[axis] ?? null}>
      <SplitSelection value={intervals}>
        <ZoneSelectionContext value={zones}>
          <StaticChart {...props} />
        </ZoneSelectionContext>
      </SplitSelection>
    </CursorPosition>
  </details>;
}

const StaticChart = memo(function StaticChart({ data, metric, color, format, formatTime, formatDistance, axis, onSelect, extent }: Omit<TrackProps, "selected" | "intervals" | "zones" | "unavailable">) {
  markChartWork(`static:${metric}`);
  const domain = useMemo(() => {
    markChartWork(`domain:${metric}`);
    const { min, max } = extent ?? { min: 0, max: 1 };
    const padding = Math.max(metric === "pace" ? 5 : 1, (max - min) * .08);
    return metric === "hr"
      ? [Math.min(PRESET_MAX_HR * .5, min - padding), Math.max(PRESET_MAX_HR, max + padding)]
      : [Math.max(metric === "altitude" ? -Infinity : 0, min - padding), max + padding];
  }, [extent, metric]);
  const duration = Math.max(0, data.at(-1)?.time ?? 0);
  const end = duration > 0 ? duration : 1;
  const axisDomain = axis === "time"
    ? [0, end]
    : [data[0]?.distance ?? 0, data.at(-1)?.distance ?? 1];
  const axisTicks = axis === "distance"
    ? distanceAxisTicks(axisDomain[0], axisDomain[1])
    : timeAxisTicks(duration);
  return <div className="h-40 min-w-0 sm:h-44 [&_*]:outline-none" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={data} accessibilityLayer={false} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}
          onMouseMove={(state) => { if (state.activeTooltipIndex != null) onSelect(Number(state.activeTooltipIndex)); }}
          onClick={(state) => { if (state.activeTooltipIndex != null) onSelect(Number(state.activeTooltipIndex)); }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 6" />
          <XAxis dataKey={axis} type="number" domain={axisDomain} ticks={axisTicks} tickLine={false} axisLine={false}
            tick={{ fill: "var(--chart-axis)", fontSize: 11 }} minTickGap={35} interval="preserveEnd"
            tickFormatter={axis === "time" ? formatTime : formatDistance} />
          <YAxis domain={domain} width={64} reversed={metric === "pace"} tickCount={4} tickLine={false} axisLine={false}
            tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={format} />
          {metric === "hr" && ACTIVITY_ZONE_COLORS.map((color, index) => {
            const [min, max] = activityZoneBounds(index + 1);
            return <ReferenceArea key={index} y1={Math.max(domain[0], min)} y2={Math.min(domain[1], max)}
              fill={color} fillOpacity={.08} stroke="none"
              label={{ value: `Z${index + 1}`, position: "insideTopLeft", fill: "var(--chart-axis)", fontSize: 10 }} />;
          })}
          <Tooltip content={() => null} cursor={false} isAnimationActive={false} />
          <Area dataKey={metric} type="linear" stroke={color} strokeWidth={2} fill={color} fillOpacity={.08}
            baseValue={metric === "pace" ? domain[1] : domain[0]} dot={false} activeDot={false}
            connectNulls={false} isAnimationActive={false} />
          <SelectedZones axis={axis} metric={metric} />
          <SelectedSplits axis={axis} />
          <SharedCursor />
        </AreaChart>
      </ResponsiveContainer>
    </div>;
});
