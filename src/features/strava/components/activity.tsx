"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal, formatInteger } from "@/features/i18n/locales";
import { STRAVA_MESSAGES } from "../messages";
import type { ActivitySummary } from "../types";
import { ActivityChart, type ChartPoint } from "./activity-chart";
import { RequestError } from "./request-error";
import { MaximalEffort } from "./maximal-effort";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVITY_QUERY_KEY } from "./activity-query";
import { roundedDuration } from "../analytics";

export type { ChartPoint } from "./activity-chart";
const importErrorSchema = z.object({ error: z.string(), retrySeconds: z.number().optional() });
export function ActivityDetail({ activity, points }: { activity: ActivitySummary; points: ChartPoint[] }) {
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const elapsed = roundedDuration(activity.elapsedSeconds);
  const router = useRouter();
  const queries = useQueryClient();
  const [busy, setBusy] = useState(activity.streamState === "pending");
  const [message, setMessage] = useState("");
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const [importOnOpen] = useState(activity.streamState === "pending");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!retryAt) return;
    const timer = setTimeout(() => {
      setRetryAt(null); setBusy(true); setMessage(""); setAttempt((value) => value + 1);
    }, Math.max(0, Date.parse(retryAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [retryAt]);
  useEffect(() => {
    if (!importOnOpen && attempt === 0) return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    async function importStreams() {
      try {
        const response = await fetch(`/api/strava/activities/${encodeURIComponent(activity.id)}`, {
          method: "POST", cache: "no-store", signal: controller.signal,
        });
        if (!active) return;
        if (!response.ok) {
          const parsed = importErrorSchema.safeParse(await response.json().catch(() => null));
          if (!active) return;
          const limited = parsed.success && ["rateLimited", "busy"].includes(parsed.data.error);
          if (!limited) setMessage(text.error);
          if (parsed.success && parsed.data.retrySeconds)
            setRetryAt(new Date(Date.now() + parsed.data.retrySeconds * 1000).toISOString());
        } else {
          await queries.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
          router.refresh();
        }
      } catch {
        if (active) setMessage(text.error);
      } finally {
        clearTimeout(timeout);
        if (active) setBusy(false);
      }
    }
    void importStreams();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [activity.id, importOnOpen, attempt, router, text.error, text.rateLimited, queries]);
  return <div className="space-y-4">
    <h1 className="break-words text-3xl font-semibold">{activity.name || text.details}</h1>
    <p>{formatDate(locale, activity.localDate)} · {formatDecimal(locale, activity.distanceMeters / 1000)} {t.units.km} · {text.time}: {formatInteger(locale, elapsed.hours)} {t.units.h} {formatInteger(locale, elapsed.minutes)} {t.units.min}</p>
    {activity.averageHr !== null && <p>{text.hr}: {formatDecimal(locale, activity.averageHr)} bpm</p>}
    <MaximalEffort activity={activity} />
    <a href={`https://www.strava.com/activities/${activity.sourceId}`} target="_blank" rel="noreferrer" className="underline">{text.source}</a>
    {busy && <p role="status">{text.loading}</p>}
    {message && <RequestError key={`${attempt}-${message}`} message={message} />}
    {retryAt && <p role="status">{text.retry}: {new Date(retryAt).toLocaleString(locale)}</p>}
    {!points.length && <p>{text.streamMissing}</p>}
    <ActivityChart points={points} />
  </div>;
}
