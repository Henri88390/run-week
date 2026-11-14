"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal, formatInteger } from "@/features/i18n/locales";
import { ELEVATION_MESSAGES, STRAVA_MESSAGES } from "../messages";
import type { ActivitySummary } from "../types";
import { ActivityChart, type ChartPoint } from "./activity-chart";
import { MaximalEffort } from "./maximal-effort";
import { durationWithSeconds } from "../analytics";
import { useActivityImport } from "./use-activity-import";
import { formatPace } from "@/features/running-programs/domain";
import type { KilometreSplit } from "../stream-metrics";
import { KilometreSplits } from "./kilometre-splits";
import { selectedSplitIntervals, toggleSplit } from "../split-selection";
import { ActivityZones } from "./activity-zones";
import { selectedZoneIntervals, type ZoneInterval } from "../zone-selection";
import { ACTIVITY_SUMMARY_MESSAGES } from "../activity-summary-messages";
import { DisclosureHeading } from "./disclosure-heading";

export type { ChartPoint } from "./activity-chart";
export function ActivityDetail({ activity, points, splits, zoneTimes, zoneIntervals }: {
  activity: ActivitySummary; points: ChartPoint[]; splits: KilometreSplit[];
  zoneTimes: { zones: number[]; unclassified: number };
  zoneIntervals: ZoneInterval[];
}) {
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const duration = (seconds: number) => {
    const value = durationWithSeconds(seconds);
    return `${value.hours > 0 ? `${formatInteger(locale, value.hours)} ${t.units.h} ` : ""}${formatInteger(locale, value.minutes)} ${t.units.min} ${formatInteger(locale, value.seconds)} ${t.units.sec}`;
  };
  const averagePace = activity.distanceMeters > 0 && activity.movingSeconds > 0
    ? activity.movingSeconds * 1000 / activity.distanceMeters : null;
  const router = useRouter();
  const activityImport = useActivityImport();
  useEffect(() => {
    if (activity.streamState !== "pending" || !activityImport.importing) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [activity.streamState, activityImport.importing, router]);
  return <div className="space-y-4">
    <div className="flex items-start gap-3">
      <h1 className="min-w-0 flex-1 break-words text-3xl font-semibold">{activity.name || text.details}</h1>
      <div data-activity-effort className="min-w-0 max-w-[55%]">
        <MaximalEffort activity={activity} />
      </div>
    </div>
    <div data-activity-date-row className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-stone-500">
      <p><time dateTime={activity.localDate}>{formatDate(locale, activity.localDate)}</time></p>
      <a href={`https://www.strava.com/activities/${activity.sourceId}`} target="_blank" rel="noreferrer"
        className="ml-auto text-right underline">{text.source}</a>
    </div>
    <details open className="group/disclosure panel min-w-0">
      <DisclosureHeading title={ACTIVITY_SUMMARY_MESSAGES[locale]} />
      <dl data-activity-summary className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {[
        { label: text.distance, value: `${formatDecimal(locale, activity.distanceMeters / 1000)} ${t.units.km}`, color: "border-emerald-200 bg-emerald-50 text-emerald-950" },
        { label: text.time, value: duration(activity.elapsedSeconds), color: "border-amber-200 bg-amber-50 text-amber-950" },
        { label: text.hr, value: activity.averageHr === null ? text.unavailable : `${formatInteger(locale, activity.averageHr)} bpm`, color: "border-rose-200 bg-rose-50 text-rose-950" },
        { label: text.pace, value: averagePace === null ? text.unavailable : `${formatPace(averagePace)} ${t.units.min}/${t.units.km}`, color: "border-blue-200 bg-blue-50 text-blue-950" },
        { label: ELEVATION_MESSAGES[locale].gain, value: activity.elevationGainMeters === null ? text.unavailable : `${formatInteger(locale, Math.round(activity.elevationGainMeters))} m`, color: "border-stone-300 bg-stone-100 text-stone-950" },
      ].map(({ label, value, color }) => <div key={label} className={`min-w-0 rounded-xl border p-3 sm:p-4 ${color}`}>
        <dt className="text-xs leading-5 opacity-75">{label}</dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{value}</dd>
      </div>)}
      </dl>
    </details>
    {!points.length && <p>{text.streamMissing}</p>}
    <ActivityAnalysis key={activity.id} points={points} splits={splits} zoneTimes={zoneTimes}
      zoneIntervals={zoneIntervals} elapsedSeconds={activity.elapsedSeconds} />
  </div>;
}

/** Smallest shared interactive parent; navigating to another activity resets selection. */
function ActivityAnalysis({ points, splits, zoneTimes, zoneIntervals, elapsedSeconds }: {
  points: ChartPoint[]; splits: KilometreSplit[]; zoneTimes: { zones: number[]; unclassified: number };
  zoneIntervals: ZoneInterval[]; elapsedSeconds: number;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [selectedZones, setSelectedZones] = useState<number[]>([]);
  const intervals = useMemo(() => selectedSplitIntervals(splits, selected), [splits, selected]);
  const zones = useMemo(() => ({
    selected: selectedZones, intervals: selectedZoneIntervals(zoneIntervals, selectedZones),
  }), [zoneIntervals, selectedZones]);
  return <>
    <ActivityChart points={points} intervals={intervals} zones={zones} />
    <KilometreSplits splits={splits} selected={selected}
      onToggle={(number) => setSelected((current) => toggleSplit(current, number))} />
    <ActivityZones zoneTimes={zoneTimes} elapsedSeconds={elapsedSeconds} selected={selectedZones}
      onToggle={(number) => setSelectedZones((current) => toggleSplit(current, number))} />
  </>;
}
