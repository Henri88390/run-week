import "server-only";
import { currentUserId } from "@/features/account/server/auth";
import { db } from "@/features/account/server/db";
import { ActivityDashboard } from "../components/dashboard";
import { ActivityDetail, type ChartPoint } from "../components/activity";
import { AnalyticsPrompt, StravaConnectionPrompt } from "../components/shell";
import { STRAVA_CONSENT_VERSION, streamSchema } from "../types";
import { logStravaFailure } from "./diagnostics";
import type { DashboardData } from "../types";
import { cachedDashboard } from "./cached-dashboard";
import { monthValue } from "./http";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { calendarRange, recordedPace } from "../analytics";
import { z } from "zod";
import { smoothSeries } from "../chart-smoothing";

export async function DashboardContent({ searchParams, metrics = false }: {
  searchParams: Promise<{ month?: string; strava?: string; view?: string; date?: string; year?: string }>; metrics?: boolean;
}) {
  await connection();
  const userId = await currentUserId();
  if (!userId) return <AnalyticsPrompt />;
  let data: DashboardData | null = null;
  let notice: string | undefined;
  let futureUrl: string | undefined;
  try {
    const search = await searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const view = z.enum(["month", "week", "year"]).parse(search.view ?? "month");
    const year = !metrics && view === "year"
      ? z.string().regex(/^(19|20)\d{2}$/).parse(search.year ?? today.slice(0, 4)) : undefined;
    const weekDate = !metrics && view === "week"
      ? z.iso.date().refine((value) => /^(19|20)\d{2}-/.test(value)).parse(search.date ?? (search.month ? `${monthValue(search.month)}-01` : today)) : undefined;
    const month = year ? `${year}-01` : weekDate?.slice(0, 7) ?? monthValue(search.month ?? null);
    if (year && year > today.slice(0, 4)) futureUrl = `/activities?view=year&year=${today.slice(0, 4)}`;
    else if (weekDate && calendarRange(month, weekDate).start > calendarRange(today.slice(0, 7), today).start)
      futureUrl = `/activities?view=week&date=${today}`;
    else if (!year && !weekDate && month > today.slice(0, 7))
      futureUrl = `${metrics ? "/running-metrics" : "/activities"}?month=${today.slice(0, 7)}`;
    if (!futureUrl) {
      const linked = await db().stravaConnection.findUnique({ where: { userId }, select: { consentVersion: true } });
      if (linked?.consentVersion === STRAVA_CONSENT_VERSION) data = await cachedDashboard(userId, month, weekDate, year, today);
    }
    notice = search.strava;
  } catch (error) {
    logStravaFailure(error, "dashboard");
    return <AnalyticsPrompt failed />;
  }
  if (futureUrl) redirect(futureUrl);
  if (!data) return <StravaConnectionPrompt notice={notice} />;
  return <ActivityDashboard data={data} metrics={metrics} notice={notice} />;
}
export async function DetailContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const userId = await currentUserId();
  if (!userId) return <AnalyticsPrompt />;
  const { id } = await params;
  let row;
  let connected = false;
  try {
    const linked = await db().stravaConnection.findUnique({ where: { userId }, select: { consentVersion: true } });
    connected = linked?.consentVersion === STRAVA_CONSENT_VERSION;
    if (connected) row = await db().stravaActivity.findFirst({ where: { userId, id } });
  }
  catch (error) {
    logStravaFailure(error, "detail");
    return <AnalyticsPrompt failed />;
  }
  if (!connected) return <StravaConnectionPrompt />;
  if (!row) notFound();
  const parsed = streamSchema.safeParse(row.streams);
  const points: ChartPoint[] = [];
  if (parsed.success) {
    const stream = parsed.data;
    const hrs = smoothSeries(stream.time, stream.time.map((_, i) => stream.heartrate?.[i] ?? null));
    const speeds = smoothSeries(stream.time, stream.time.map((_, i) =>
      recordedPace(stream.velocity_smooth?.[i]) === null ? null : stream.velocity_smooth?.[i] ?? null));
    const stride = Math.max(1, Math.ceil(stream.time.length / 600));
    let gap = false;
    let hrMissing = false;
    let speedMissing = false;
    for (let i = 0; i < stream.time.length; i++) {
      gap ||= i > 0 && stream.time[i] - stream.time[i - 1] > 15;
      hrMissing ||= stream.heartrate?.[i] == null;
      speedMissing ||= recordedPace(stream.velocity_smooth?.[i]) === null;
      if (i % stride === 0 || i === stream.time.length - 1) {
        const velocity = speeds[i];
        points.push({ time: stream.time[i], hr: hrMissing ? null : hrs[i],
          pace: speedMissing ? null : recordedPace(velocity), gap });
        gap = false; hrMissing = false; speedMissing = false;
      }
    }
  }
  return <ActivityDetail key={row.id} activity={{
    id: row.id, sourceId: row.sourceId, name: row.name, sport: row.sport, localDate: row.localDate,
    distanceMeters: row.distanceMeters, movingSeconds: row.movingSeconds, elapsedSeconds: row.elapsedSeconds,
    averageHr: row.averageHr, maxHr: row.maxHr, maximalEffort: row.maximalEffort, streamState: row.streamState,
  }} points={points} />;
}
