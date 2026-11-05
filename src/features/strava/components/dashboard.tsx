"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal, formatInteger, weekdayName } from "@/features/i18n/locales";
import { STRAVA_MESSAGES, stravaNoticeMessage } from "../messages";
import type { DashboardData } from "../types";
import { calendarRange, roundedDuration, PRESET_MAX_HR, speedRetention, danielsEstimates } from "../analytics";
import { HEART_RATE_MESSAGES } from "../heart-rate-messages";
import { CalendarDay } from "./calendar-day";
import { CALENDAR_MESSAGES } from "../calendar-messages";
import { formatPace } from "@/features/running-programs/domain";
import { CALENDAR_NAVIGATION } from "../calendar-navigation-messages";
import { RequestError } from "./request-error";
import { EFFORT_MESSAGES } from "../effort-messages";
import { PERFORMANCE_MESSAGES } from "../performance-messages";
import { useActivityQuery } from "./activity-query";
import { MaximalEffort } from "./maximal-effort";
import { PaceHistogram } from "./pace-histogram";
import { MetricDefinition } from "./metric-definition";
import { METRIC_DEFINITIONS } from "../metric-definitions";
import { INDICATOR_MESSAGES } from "../indicator-messages";
import { DANIELS_MESSAGES } from "../daniels-messages";
import { VolumeChart } from "./volume-chart";

const zoneColors: Record<number, string> = {
  1: "border-sky-300 bg-sky-50", 2: "border-emerald-300 bg-emerald-50",
  3: "border-yellow-300 bg-yellow-50", 4: "border-orange-300 bg-orange-50", 5: "border-rose-300 bg-rose-50",
};
const zoneLabels = ["Z1 <70%", "Z2 70–80%", "Z3 80–85%", "Z4 85–90%", "Z5 90–100%"];

export function ActivityDashboard({ data: initialData, metrics = false, notice, linkedEmail }: { data: DashboardData; metrics?: boolean; notice?: string; linkedEmail?: string }) {
  const query = useActivityQuery(initialData);
  const data = query.data;
  const calendarMonths = useMemo(() => {
    if (!data.months.length) return [];
    const byMonth = new Map<string, DashboardData["activities"]>();
    for (const activity of data.activities) {
      const month = activity.localDate.slice(0, 7);
      const runs = byMonth.get(month) ?? [];
      runs.push(activity);
      byMonth.set(month, runs);
    }
    return data.months.map(({ month, zoneSeconds }) => ({
      date: `${month}-01`, activities: byMonth.get(month) ?? [], zoneSeconds,
      future: month > data.today.slice(0, 7),
    }));
  }, [data.activities, data.months, data.today]);
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const hrText = HEART_RATE_MESSAGES[locale];
  const calendarText = CALENDAR_MESSAGES[locale];
  const navigation = CALENDAR_NAVIGATION[locale];
  const performanceText = PERFORMANCE_MESSAGES[locale];
  const indicatorText = INDICATOR_MESSAGES[locale];
  const retention = speedRetention(data.criticalSpeed?.speed ?? null, data.performance?.speed ?? null);
  const daniels = danielsEstimates(data.performance?.vdot ?? null);
  const weekly = data.weekDate !== null;
  const yearly = data.year !== null;
  const yearLabel = EFFORT_MESSAGES[locale].year;
  const router = useRouter();
  const distance = data.activities.reduce((s, a) => s + a.distanceMeters, 0);
  const moving = data.activities.reduce((s, a) => s + a.movingSeconds, 0);
  const unit = (seconds: number) => {
    const { hours, minutes } = roundedDuration(seconds);
    return `${formatInteger(locale, hours)} ${t.units.h} ${formatInteger(locale, minutes)} ${t.units.min}`;
  };
  const noticeText = stravaNoticeMessage(locale, notice, linkedEmail);
  const zoneTotal = data.zones.reduce((s, z) => s + z.seconds, 0);
  const thresholdTotal = data.threshold ? data.threshold.below + data.threshold.above : 0;
  const periodUrl = (week: boolean, value: string) => metrics
    ? `/running-metrics?month=${value.slice(0, 7)}`
    : week ? `/activities?view=week&date=${value}` : `/activities?month=${value.slice(0, 7)}`;
  const yearUrl = (value: string) => `/activities?view=year&year=${value.slice(0, 4)}`;
  const shiftedPeriod = (direction: number) => {
    const date = new Date(`${data.weekDate ?? `${data.month}-01`}T00:00:00Z`);
    if (yearly) date.setUTCFullYear(date.getUTCFullYear() + direction);
    else if (weekly) date.setUTCDate(date.getUTCDate() + direction * 7);
    else date.setUTCMonth(date.getUTCMonth() + direction);
    const value = date.toISOString().slice(0, 10);
    return /^(19|20)\d{2}-/.test(value) ? yearly ? yearUrl(value) : periodUrl(weekly, value) : null;
  };
  const previous = shiftedPeriod(-1);
  const currentWeek = calendarRange(data.today.slice(0, 7), data.today).start;
  const periodStart = data.weekDate ?? `${data.month}-01`;
  const canGoNext = yearly ? Number(data.year) < Number(data.today.slice(0, 4))
    : weekly ? periodStart < currentWeek : data.month < data.today.slice(0, 7);
  const next = canGoNext ? shiftedPeriod(1) : null;
  return <div className="space-y-6">
    {query.isError && <RequestError key={query.errorUpdatedAt} message={text.error} />}
    {metrics && <h1 className="text-3xl font-semibold">{text.metrics}</h1>}
    {!metrics && <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
    {(noticeText || !data.connected || !data.consentCurrent) && <div className="space-y-2">
      {noticeText && (notice === "connected" ? <p role="status">{noticeText}</p>
        : <RequestError key={notice} message={noticeText} />)}
      <div className="flex flex-wrap gap-3">
        {(!data.connected || !data.consentCurrent) && <Link className="button-primary" href="/strava/consent">{text.connect}</Link>}
      </div>
    </div>}
      <div className="w-full space-y-3 lg:col-start-2 lg:w-80">
        {!metrics && <div className="flex rounded-xl bg-stone-100 p-1" aria-label={text.calendar}>
          {[{ week: true, label: navigation.week }, { week: false, label: navigation.month }].map((view) =>
            <Link key={view.label} href={periodUrl(view.week, data.weekDate ?? `${data.month}-01`)}
              aria-current={!yearly && weekly === view.week ? "page" : undefined}
              className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold focus-visible:outline-2 ${!yearly && weekly === view.week ? "bg-white text-emerald-900 shadow-sm" : "text-stone-600 hover:bg-white/60"}`}>
              {view.label}
            </Link>)}
          <Link href={yearUrl(data.month)} aria-current={yearly ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold focus-visible:outline-2 ${yearly ? "bg-white text-emerald-900 shadow-sm" : "text-stone-600 hover:bg-white/60"}`}>{yearLabel}</Link>
        </div>}
        <div className="flex items-center gap-2">
          <button type="button" aria-label={navigation.previous} disabled={previous === null}
            onClick={() => { if (previous) router.push(previous); }}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white hover:bg-stone-100 focus-visible:outline-2 disabled:opacity-40">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 6-6 6 6 6" /></svg>
          </button>
          <label className="block min-w-0 flex-1">
            <span className="sr-only">{yearly ? yearLabel : weekly ? navigation.week : navigation.month}</span>
            {yearly ? <select data-calendar-date-picker aria-label={yearLabel} className="block h-12 w-full rounded-xl border-2 border-emerald-700/40 bg-emerald-50 px-3 text-base font-semibold text-emerald-950 focus-visible:outline-2"
              value={data.year ?? ""} onChange={(event) => router.push(yearUrl(event.target.value))}>
              {Array.from({ length: Number(data.today.slice(0, 4)) - 1900 + 1 }, (_, i) => <option key={i} value={1900 + i}>{1900 + i}</option>)}
            </select> : <input data-calendar-date-picker type={weekly ? "date" : "month"} className="block h-12 w-full min-w-0 cursor-pointer rounded-xl border-2 border-emerald-700/40 bg-emerald-50 px-3 py-2 text-base font-semibold text-emerald-950 shadow-sm focus-visible:outline-2 focus-visible:outline-emerald-700"
              value={data.weekDate ?? data.month} min={weekly ? "1900-01-01" : "1900-01"} max={weekly ? data.today : data.today.slice(0, 7)}
              onClick={(event) => {
                if (typeof event.currentTarget.showPicker === "function" && !event.currentTarget.disabled) event.currentTarget.showPicker();
              }}
              onChange={(event) => { if (event.target.validity.valid && event.target.value) router.push(periodUrl(weekly, event.target.value)); }} />}
          </label>
          <button type="button" aria-label={navigation.next} disabled={next === null}
            onClick={() => { if (next) router.push(next); }}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white hover:bg-stone-100 focus-visible:outline-2 disabled:opacity-40">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </div>
    </div>}
    {data.truncated && <p role="alert">{text.truncated}</p>}
    {!metrics && <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[[text.runs, formatInteger(locale, data.activities.length)], [text.distance, `${formatDecimal(locale, distance / 1000)} ${t.units.km}`],
        [text.duration, unit(moving)], [text.pace, distance > 0 ? `${formatPace(moving * 1000 / distance)} ${t.units.min}/${t.units.km}` : "—"]].map(([label, value]) =>
        <div key={label} className="panel"><dt className="text-sm text-stone-600">{label}</dt><dd className="mt-2 text-xl font-semibold">{value}</dd></div>)}
    </dl>}
    {metrics ? <>
      {data.performance && !data.criticalSpeed && <section data-provisional-performance className="panel space-y-3">
        <h2 className="text-xl font-semibold">{performanceText.title}</h2>
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{performanceText.warning}</p>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><dt>{text.speed}</dt><dd>{formatDecimal(locale, data.performance.speed * 3.6, 2)} {t.units.km}/{t.units.h}</dd></div>
          <div><dt>VDOT</dt><dd>{data.performance.vdot === null ? text.unavailable : formatDecimal(locale, data.performance.vdot)}</dd></div>
          <div><dt>D′</dt><dd>{text.unavailable}</dd></div>
          <div><dt>{text.count}</dt><dd>{data.performance.count}</dd></div>
        </dl>
        <Link href={`/activities/${data.performance.activityId}`} className="inline-block text-sm underline">{text.details}</Link>
      </section>}
      <section className="grid gap-4 md:grid-cols-3">
        {(["speed", "endurance", "speedEndurance"] as const).map((metric) => <article key={metric} data-performance-indicator={metric} className="panel space-y-2">
          <MetricDefinition title={text[metric]} definition={METRIC_DEFINITIONS[locale][metric]} />
          <p className="text-xs font-medium text-amber-900">{indicatorText.estimate}</p>
          {metric === "speed" && (data.performance ? <>
            <p data-indicator-value className="text-xl font-semibold">{formatDecimal(locale, data.performance.speed * 3.6, 2)} {t.units.km}/{t.units.h}</p>
            <p>{formatPace(1000 / data.performance.speed)} {t.units.min}/{t.units.km}</p>
            <Link href={`/activities/${data.performance.activityId}`} className="inline-block text-sm underline">{text.details}</Link>
          </> : <p data-indicator-value>{text.unavailable}</p>)}
          {metric === "endurance" && (data.endurance ? <>
            <p data-indicator-value className="text-xl font-semibold">{unit(data.endurance.movingSeconds)} · {formatDecimal(locale, data.endurance.distanceMeters / 1000)} {t.units.km}</p>
            <Link href={`/activities/${data.endurance.id}`} className="inline-block text-sm underline">{data.endurance.name || text.details} · {formatDate(locale, data.endurance.localDate)}</Link>
          </> : <p data-indicator-value>{text.unavailable}</p>)}
          {metric === "speedEndurance" && <>
            <p data-indicator-value className="text-xl font-semibold">{retention === null ? text.unavailable : `${formatDecimal(locale, retention)}%`}</p>
            {retention === null && <p className="text-sm text-stone-600">{indicatorText.missing}</p>}
          </>}
          <p className="text-sm text-stone-600">{indicatorText[metric]}</p>
        </article>)}
      </section>
      <section className="panel space-y-3"><h2 className="text-xl font-semibold">{text.cs}</h2>
        {data.criticalSpeed ? <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><dt>{text.cs}</dt><dd>{formatDecimal(locale, data.criticalSpeed.speed * 3.6, 2)} {t.units.km}/{t.units.h}
            <span className="block text-sm text-stone-600">{formatPace(1000 / data.criticalSpeed.speed)} {t.units.min}/{t.units.km}</span>
          </dd></div>
          <div><dt>D′</dt><dd>{formatDecimal(locale, data.criticalSpeed.dPrime)} m</dd></div>
          <div><dt>{text.fit}</dt><dd>{formatDecimal(locale, data.criticalSpeed.rSquared, 3)}</dd></div>
          <div><dt>{text.count}</dt><dd>{data.criticalSpeed.count}</dd></div>
        </dl> : <p>{text.unavailable}</p>}
        <p className="text-sm text-stone-600">{text.csHelp}</p>
        <p className="text-sm text-stone-600">{performanceText.scope}</p>
      </section>
      <section data-daniels-estimates className="panel space-y-3">
        <p className="text-xs font-medium text-amber-900">{indicatorText.estimate}</p>
        <div className="flex justify-between gap-4 border-b border-stone-100 pb-2"><h2>{text.vma}</h2>
          <p data-estimate-vma className="text-right">{daniels ? <>{formatDecimal(locale, daniels.vmaKmh, 2)} {t.units.km}/{t.units.h}
            <span className="block text-sm text-stone-600">{formatPace(daniels.vmaPace)} {t.units.min}/{t.units.km}</span></> : text.unavailable}</p>
        </div>
        <div className="flex justify-between gap-4 border-b border-stone-100 pb-2"><h2>{text.thresholdPace}</h2>
          <p data-estimate-threshold>{daniels ? `${formatPace(daniels.thresholdPace)} ${t.units.min}/${t.units.km}` : text.unavailable}</p>
        </div>
        <div className="flex justify-between gap-4 border-b border-stone-100 pb-2"><h2>{text.ratio}</h2>
          <p data-estimate-ratio>{daniels ? `${formatDecimal(locale, daniels.ratio)}%` : text.unavailable}</p>
        </div>
        <p className="text-sm text-stone-600">{DANIELS_MESSAGES[locale]}</p>
      </section>
    </> : <>
      {yearly ? <section className="panel space-y-4">
        <h2 className="text-xl font-semibold">{text.calendar} · {data.year}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {calendarMonths.map((month, i) =>
            <CalendarDay key={month.date} month={month} index={i % 3} />)}
        </div>
      </section> : <section className="panel space-y-4">
        <h2 className="text-xl font-semibold">{text.calendar}</h2>
        <div className="flex flex-wrap gap-2 text-xs" aria-label={text.zones}>
          {zoneLabels.map((label, index) => <span key={label} className={`rounded border px-2 py-1 ${zoneColors[index + 1]}`}>{label}</span>)}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-7 gap-1 text-center text-xs md:mr-56 sm:text-sm">
            {Array.from({ length: 7 }, (_, i) => <span key={i} className="py-1 font-medium">{weekdayName(locale, i, "short")}</span>)}
          </div>
          {data.weeks.map((week) => <div key={week.startDate} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]" data-week={week.startDate}>
            <div className="grid min-w-0 grid-cols-7 gap-1 text-center text-sm">
              {week.days.map((day, index) => <CalendarDay key={day.date} day={day} index={index}
                outside={!day.date.startsWith(data.month)}
                color={day.zone === null ? "border-stone-200 bg-stone-50" : zoneColors[day.zone]} />)}
            </div>
            <aside aria-label={`${formatDate(locale, week.startDate)} · ${hrText.totalTime}`}><CalendarDay week={week} /></aside>
          </div>)}
        </div>
      </section>}
      <VolumeChart buckets={data.volumeBuckets} view={yearly ? "year" : weekly ? "week" : "month"} />
      <section className="grid gap-4 md:grid-cols-2">
        <article className="panel space-y-3"><div className="flex items-baseline justify-between gap-2">
          <h2 className="min-w-0 text-xl font-semibold">{text.zones}</h2>
          <p className="shrink-0 text-sm text-stone-600">HRMax: {PRESET_MAX_HR} bpm</p>
        </div>
          {zoneTotal > 0 ? <ul className="space-y-3">{data.zones.map((zone) => <li key={zone.zone}>
            <div className="flex justify-between gap-2 text-sm"><span>{zoneLabels[zone.zone - 1]} · {formatDecimal(locale, zone.min)}–{formatDecimal(locale, zone.max)} bpm</span><span>{unit(zone.seconds)} ({formatDecimal(locale, zone.seconds / zoneTotal * 100)}%)</span></div>
            <div className="mt-1 h-3 rounded bg-stone-100" aria-hidden="true"><div className="h-3 rounded bg-emerald-600" style={{ width: `${zone.seconds / zoneTotal * 100}%` }} /></div>
          </li>)}</ul> : <p>{text.unavailable}</p>}
        </article>
        <PaceHistogram distribution={data.paceDistribution} />
        <article className="panel space-y-3"><h2 className="text-xl font-semibold">{hrText.aboveTime} (&gt;90%)</h2>
          {data.threshold && thresholdTotal > 0 ? <ul className="space-y-3">{[[text.below, data.threshold.below], [calendarText.above, data.threshold.above]].map(([label, value]) => {
            const seconds = typeof value === "number" ? value : 0;
            return <li key={label}><div className="flex justify-between gap-2 text-sm"><span>{label}</span><span>{unit(seconds)} ({formatDecimal(locale, seconds / thresholdTotal * 100)}%)</span></div>
              <div className="mt-1 h-3 rounded bg-stone-100" aria-hidden="true"><div className="h-3 rounded bg-orange-600" style={{ width: `${seconds / thresholdTotal * 100}%` }} /></div>
            </li>;
          })}</ul> : <p>{text.unavailable}</p>}
        </article>
      </section>
    </>}
    {metrics && <section data-maximal-efforts className="panel space-y-3">
      <h2 className="text-xl font-semibold">{performanceText.efforts}</h2>
      {data.maximalEfforts.length ? <ul className="grid max-h-80 gap-2 overflow-auto sm:grid-cols-2">
        {data.maximalEfforts.map((activity) => <li key={activity.id} className="relative">
          <Link href={`/activities/${activity.id}`} className="block h-full rounded-lg border border-violet-200 bg-violet-50 p-3 pr-11 hover:bg-violet-100 focus-visible:outline-2">
            <span className="block break-words font-semibold text-violet-950">{activity.name || text.details}</span>
            <span className="text-sm text-stone-600">{formatDate(locale, activity.localDate)} · {formatDecimal(locale, activity.distanceMeters / 1000)} {t.units.km} · {unit(activity.elapsedSeconds)}</span>
          </Link>
          <MaximalEffort activity={activity} removeOnly />
        </li>)}
      </ul> : <p className="text-sm text-stone-600">{performanceText.empty}</p>}
    </section>}
  </div>;
}
