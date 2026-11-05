"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal, formatInteger } from "@/features/i18n/locales";
import { STRAVA_MESSAGES } from "../messages";
import type { ActivitySummary } from "../types";
import { ActivityChart, type ChartPoint } from "./activity-chart";
import { MaximalEffort } from "./maximal-effort";
import { roundedDuration } from "../analytics";
import { useActivityImport } from "./use-activity-import";
import { formatPace } from "@/features/running-programs/domain";

export type { ChartPoint } from "./activity-chart";
export function ActivityDetail({ activity, points }: { activity: ActivitySummary; points: ChartPoint[] }) {
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const elapsed = roundedDuration(activity.elapsedSeconds);
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
    <h1 className="break-words text-3xl font-semibold">{activity.name || text.details}</h1>
    <p className="text-sm text-stone-500"><time dateTime={activity.localDate}>{formatDate(locale, activity.localDate)}</time></p>
    <dl data-activity-summary className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: text.distance, value: `${formatDecimal(locale, activity.distanceMeters / 1000)} ${t.units.km}`, color: "border-emerald-200 bg-emerald-50 text-emerald-950" },
        { label: text.time, value: `${elapsed.hours > 0 ? `${formatInteger(locale, elapsed.hours)} ${t.units.h} ` : ""}${formatInteger(locale, elapsed.minutes)} ${t.units.min}`, color: "border-amber-200 bg-amber-50 text-amber-950" },
        { label: text.hr, value: activity.averageHr === null ? text.unavailable : `${formatInteger(locale, activity.averageHr)} bpm`, color: "border-rose-200 bg-rose-50 text-rose-950" },
        { label: text.pace, value: averagePace === null ? text.unavailable : `${formatPace(averagePace)} ${t.units.min}/${t.units.km}`, color: "border-blue-200 bg-blue-50 text-blue-950" },
      ].map(({ label, value, color }) => <div key={label} className={`min-w-0 rounded-xl border p-3 sm:p-4 ${color}`}>
        <dt className="text-xs leading-5 opacity-75">{label}</dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">{value}</dd>
      </div>)}
    </dl>
    <MaximalEffort activity={activity} />
    <a href={`https://www.strava.com/activities/${activity.sourceId}`} target="_blank" rel="noreferrer" className="underline">{text.source}</a>
    {!points.length && <p>{text.streamMissing}</p>}
    <ActivityChart points={points} />
  </div>;
}
