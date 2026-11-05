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

export type { ChartPoint } from "./activity-chart";
export function ActivityDetail({ activity, points }: { activity: ActivitySummary; points: ChartPoint[] }) {
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const elapsed = roundedDuration(activity.elapsedSeconds);
  const router = useRouter();
  const activityImport = useActivityImport();
  useEffect(() => {
    if (activity.streamState !== "pending" || !activityImport.importing) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [activity.streamState, activityImport.importing, router]);
  return <div className="space-y-4">
    <h1 className="break-words text-3xl font-semibold">{activity.name || text.details}</h1>
    <p>{formatDate(locale, activity.localDate)} · {formatDecimal(locale, activity.distanceMeters / 1000)} {t.units.km} · {text.time}: {formatInteger(locale, elapsed.hours)} {t.units.h} {formatInteger(locale, elapsed.minutes)} {t.units.min}</p>
    {activity.averageHr !== null && <p>{text.hr}: {formatDecimal(locale, activity.averageHr)} bpm</p>}
    <MaximalEffort activity={activity} />
    <a href={`https://www.strava.com/activities/${activity.sourceId}`} target="_blank" rel="noreferrer" className="underline">{text.source}</a>
    {!points.length && <p>{text.streamMissing}</p>}
    <ActivityChart points={points} />
  </div>;
}
