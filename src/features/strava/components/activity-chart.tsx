"use client";

import { memo, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDecimal } from "@/features/i18n/locales";
import { formatPace } from "@/features/running-programs/domain";
import { PRESET_MAX_HR, ZONE_FRACTIONS } from "../analytics";
import { HEART_RATE_MESSAGES } from "../heart-rate-messages";
import { STRAVA_MESSAGES } from "../messages";
import { SMOOTHING_MESSAGES } from "../sync-messages";

export type ChartPoint = { time: number; hr: number | null; pace: number | null; gap: boolean };
const zoneColors = ["#e0f2fe", "#d1fae5", "#fef9c3", "#ffedd5", "#ffe4e6"];
const hrColor = "#be123c";
const paceColor = "#1d4ed8";

export const ActivityChart = memo(function ActivityChart({ points }: { points: ChartPoint[] }) {
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const hrText = HEART_RATE_MESSAGES[locale];
  const [showHr, setShowHr] = useState(true);
  const [showPace, setShowPace] = useState(true);
  const { hrs, paces, hrMin, hrMax, paceMin, paceMax, lastTime, data } = useMemo(() => {
    const hrs = points.flatMap((point) => point.hr === null ? [] : [point.hr]);
    const paces = points.flatMap((point) => point.pace === null ? [] : [point.pace]);
    const hrMin = Math.min(PRESET_MAX_HR * .5, ...hrs);
    const hrMax = Math.max(PRESET_MAX_HR, ...hrs);
    const paceMin = paces.length ? Math.min(...paces) : 0;
    const paceMax = paces.length ? Math.max(paceMin + 1, ...paces) : 1;
    const lastTime = Math.max(1, points.at(-1)?.time ?? 1);
    const data = points.flatMap((point, index) => {
      const previous = points[index - 1];
      return point.gap && previous
        ? [{ time: (previous.time + point.time) / 2, hr: null, pace: null }, point]
        : [point];
    });
    return { hrs, paces, hrMin, hrMax, paceMin, paceMax, lastTime, data };
  }, [points]);
  const title = `${text.heartRate} / ${hrText.pace} · ${text.time}`;
  return <section className="panel space-y-3">
    <h2 className="text-xl font-semibold">{text.heartRate} / {hrText.pace}</h2>
    <p className="text-xs text-stone-500">{SMOOTHING_MESSAGES[locale]}</p>
    <div className="flex flex-wrap gap-5">
      <label className="flex items-center gap-2" style={{ color: hrColor }}>
        <input type="checkbox" checked={showHr} onChange={(event) => setShowHr(event.target.checked)} />
        {text.heartRate}
      </label>
      <label className="flex items-center gap-2" style={{ color: paceColor }}>
        <input type="checkbox" checked={showPace} onChange={(event) => setShowPace(event.target.checked)} />
        {hrText.pace}
      </label>
    </div>
    <div data-activity-chart className="h-80 min-w-0 rounded-xl bg-stone-50/60 pt-3 sm:h-96">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} accessibilityLayer aria-label={title} margin={{ top: 24, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#e7e5e4" strokeDasharray="3 5" />
          <XAxis dataKey="time" type="number" domain={[0, lastTime]} tickLine={false} axisLine={false}
            tick={{ fill: "#78716c", fontSize: 11 }} minTickGap={30}
            tickFormatter={(value: number) => `${formatDecimal(locale, value / 60)} ${t.units.min}`} />
          <YAxis yAxisId="hr" hide={!showHr} domain={[hrMin, hrMax]} width={46}
            tickLine={false} axisLine={false} tick={{ fill: hrColor, fontSize: 11 }}
            tickFormatter={(value: number) => String(Math.round(value))}
            label={{ value: "bpm", position: "top", fill: hrColor, fontSize: 11 }} />
          <YAxis yAxisId="pace" hide={!showPace || !paces.length} orientation="right" reversed
            domain={[paceMin, paceMax]} width={55} tickLine={false} axisLine={false}
            tick={{ fill: paceColor, fontSize: 11 }} tickFormatter={formatPace}
            label={{ value: `${t.units.min}/${t.units.km}`, position: "top", fill: paceColor, fontSize: 11 }} />
          {showHr && ZONE_FRACTIONS.slice(0, -1).map((fraction, index) => <ReferenceArea
            key={index} yAxisId="hr" y1={index === 0 ? hrMin : PRESET_MAX_HR * fraction}
            y2={PRESET_MAX_HR * ZONE_FRACTIONS[index + 1]} fill={zoneColors[index]} fillOpacity={.5} stroke="none"
            label={{ value: `Z${index + 1}`, position: "insideTopLeft", fill: "#78716c", fontSize: 10 }} />)}
          <Tooltip filterNull isAnimationActive={false}
            cursor={{ stroke: "#a8a29e", strokeDasharray: "4 4" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", boxShadow: "0 8px 24px #0000000d", fontSize: 12 }}
            labelFormatter={(value) => `${text.time}: ${formatDecimal(locale, Number(value) / 60)} ${t.units.min}`}
            formatter={(value, name) => [typeof value === "number"
              ? name === text.heartRate ? `${formatDecimal(locale, value)} bpm` : `${formatPace(value)} ${t.units.min}/${t.units.km}`
              : text.streamMissing, name]} />
          {showHr && <Line yAxisId="hr" dataKey="hr" name={text.heartRate} type="monotoneX"
            stroke={hrColor} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "white", strokeWidth: 2 }}
            connectNulls={false} isAnimationActive={false} />}
          {showPace && <Line yAxisId="pace" dataKey="pace" name={hrText.pace} type="monotoneX"
            stroke={paceColor} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "white", strokeWidth: 2 }}
            connectNulls={false} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
    {showHr && <p className="text-sm" style={{ color: hrColor }}>{text.heartRate}: {hrs.length
      ? `${formatDecimal(locale, Math.min(...hrs))}–${formatDecimal(locale, Math.max(...hrs))} bpm` : text.streamMissing}</p>}
    {showPace && <p className="text-sm" style={{ color: paceColor }}>{hrText.pace}: {paces.length
      ? `${formatPace(paceMin)}–${formatPace(Math.max(...paces))} ${t.units.min}/${t.units.km}` : text.streamMissing}</p>}
    <p className="text-sm text-stone-600">HRmax: {PRESET_MAX_HR} bpm</p>
  </section>;
});
