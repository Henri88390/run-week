"use client";

import Link from "next/link";
import { memo, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDate, formatDecimal } from "@/features/i18n/locales";
import { formatPace } from "@/features/running-programs/domain";
import { STRAVA_MESSAGES } from "../messages";
import { HEART_RATE_MESSAGES } from "../heart-rate-messages";
import { CALENDAR_MESSAGES } from "../calendar-messages";
import type { ActivitySummary, CalendarWeek } from "../types";
import { activityAverages, aboveThresholdPercent, roundedDuration } from "../analytics";
import { EFFORT_MESSAGES } from "../effort-messages";
import { crossTraining, isRunning } from "../sports";
import { CROSS_TRAINING_MESSAGES, sportLabel } from "../cross-training-messages";
import { CrossTrainingIcon, SportIcon, sportKind } from "./sport-icon";
import { CALENDAR_ZONE_COLORS } from "../activity-zone-palette";

const zoneColors = CALENDAR_ZONE_COLORS;

export const CalendarDay = memo(function CalendarDay(props: ({
  day: CalendarWeek["days"][number]; color: string; outside: boolean; index: number;
} | { week: CalendarWeek } | { month: { date: string; activities: ActivitySummary[]; zoneSeconds: number[]; future: boolean }; index: number }) & { showCrossTraining?: boolean }) {
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const hrText = HEART_RATE_MESSAGES[locale];
  const calendarText = CALENDAR_MESSAGES[locale];
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ above: false, height: 400 });
  const popupId = useId();
  const week = "week" in props ? props.week : null;
  const month = "month" in props ? props.month : null;
  const day = "day" in props ? props.day : "month" in props ? { ...props.month, zone: null } : {
    date: props.week.startDate, activities: props.week.days.flatMap((entry) => entry.activities), zone: null,
    zoneSeconds: Array.from({ length: 5 }, (_, i) => props.week.days.reduce((sum, entry) => sum + entry.zoneSeconds[i], 0)),
  };
  const { color: dayColor, outside, index } = "day" in props ? props : { color: "", outside: false, index: "month" in props ? props.index * 3 : 6 };
  const { date, zone, zoneSeconds } = day;
  const showCrossTraining = props.showCrossTraining ?? true;
  const activities = showCrossTraining ? day.activities : day.activities.filter((activity) => isRunning(activity.sport));
  const runs = activities.filter((activity) => isRunning(activity.sport));
  const cross = crossTraining(activities);
  const crossSeconds = cross.reduce((sum, entry) => sum + entry.seconds, 0);
  const crossText = CROSS_TRAINING_MESSAGES[locale];
  const split = !week && !month && runs.length > 0 && cross.length > 0;
  const color = cross.length > 0 && runs.length === 0
    ? "border-indigo-300 bg-indigo-50 text-indigo-950" : dayColor;
  const measuredSeconds = zoneSeconds.reduce((sum, seconds) => sum + seconds, 0);
  const percentages = zoneSeconds.map((seconds) => measuredSeconds > 0 ? seconds / measuredSeconds * 100 : null);
  const zoneSummary = percentages.map((percent, i) =>
    `Z${i + 1}: ${percent === null ? text.unavailable : `${formatDecimal(locale, percent)}%`}`).join(", ");
  const open = !dismissed && !month?.future && (hovered || focused || pinned) && (week !== null || month !== null || activities.length > 0);
  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const bounds = container.current?.getBoundingClientRect();
      if (!bounds) return;
      const aboveSpace = Math.max(0, bounds.top - 8);
      const belowSpace = Math.max(0, window.innerHeight - bounds.bottom - 8);
      const desired = (popup.current?.firstElementChild?.scrollHeight ?? 400) + 4;
      const above = belowSpace < desired && aboveSpace > belowSpace;
      const height = Math.max(64, above ? aboveSpace : belowSpace);
      setPlacement((previous) => previous.above === above && previous.height === height ? previous : { above, height });
    }
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") { setPinned(false); setDismissed(true); }
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        setPinned(false); setDismissed(true);
      }
    }
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  const km = runs.reduce((sum, activity) => sum + activity.distanceMeters, 0) / 1000;
  const label = runs.length === 0 && cross.length > 0
    ? `${formatDate(locale, date)}: ${cross.map((entry) => sportLabel(locale, entry.sport)).join(", ")}`
    : `${formatDate(locale, date)}: ${runs.length} ${text.runs}, ${formatDecimal(locale, km)} ${t.units.km}${cross.length ? ` · ${crossText.label}` : ""}`;
  const duration = (seconds: number) => {
    const { hours, minutes } = roundedDuration(seconds);
    return hours > 0 ? `${hours} ${t.units.h} ${String(minutes).padStart(2, "0")} ${t.units.min}` : `${minutes} ${t.units.min}`;
  };
  const abovePercent = week ? aboveThresholdPercent(week.aboveSeconds, week.movingSeconds) : null;
  const averages = activityAverages(runs);
  const maximalCount = runs.filter((activity) => activity.maximalEffort).length;
  const summaries = week || month ? [{
    id: date, sport: "Run", name: `${runs.length} ${text.runs}`, distanceMeters: km * 1000,
    movingSeconds: runs.reduce((sum, run) => sum + run.movingSeconds, 0), averageHr: averages.averageHr, maximalEffort: maximalCount > 0,
  }] : activities;
  const monthName = new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const header = month ? monthName : week ? `${formatDate(locale, date)} – ${formatDate(locale, week.days[6].date)}` : formatDate(locale, date);
  const dayDuration = runs.reduce((sum, activity) => sum + activity.movingSeconds, 0);
  const content = <>
    <span className="flex items-center justify-between gap-0.5">
      <time dateTime={date} className={`inline-flex min-w-5 items-center justify-center rounded bg-white/80 px-1 py-0.5 font-semibold text-stone-700 ring-1 ring-stone-900/10 ${month ? "text-sm" : "text-xs sm:min-w-6"}`}>
        {month ? monthName : Number(date.slice(-2))}
      </time>
      {maximalCount > 0 && <span data-maximal-effort role="img" aria-label={`${EFFORT_MESSAGES[locale].label}: ${maximalCount}`}
        title={`${EFFORT_MESSAGES[locale].label}: ${maximalCount}`} className="rounded bg-violet-100 p-0.5 text-violet-800">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-3"><path d="m10 1.5 2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.9Z" /></svg>
      </span>}
    </span>
    {(month || runs.length > 0) && <>
      <span data-run-distance className={`flex items-center gap-0.5 text-xs sm:text-sm ${month ? "" : "justify-center"}`}>
        <SportIcon sport="Run" className="size-3 sm:size-3.5" />
        <span>{formatDecimal(locale, km)}<span className="hidden sm:inline"> {t.units.km}</span></span>
      </span>
      <span data-day-duration className="block text-[10px] font-medium tabular-nums sm:text-xs">{duration(dayDuration)}</span>
      {(month || runs.length > 1) && <span data-run-count className="block text-[10px] font-medium text-stone-600 sm:text-xs">{runs.length} {text.runs}</span>}
      <span role="img" aria-label={`${text.zones}: ${zoneSummary}`} data-zone-bars
        className={`mx-auto mt-1 flex h-7 w-full max-w-16 shrink-0 items-end gap-0.5 sm:h-8 ${split ? "mb-1" : ""}`}>
        {percentages.map((percent, i) => <span key={i} aria-hidden="true" className="relative block h-full min-w-0 flex-1 overflow-hidden rounded-sm bg-stone-200/60">
          <span data-zone-bar={i + 1} className="absolute bottom-0 block w-full rounded-t-sm"
            style={{ height: `${percent ?? 0}%`, backgroundColor: zoneColors[i] }} />
        </span>)}
      </span>
    </>}
    {cross.length > 0 && (() => {
      const chipClass = `flex shrink-0 flex-col items-center gap-px overflow-hidden text-[10px] font-medium leading-tight ${split
        ? "border-t px-1 py-1" : "mt-1 max-w-full rounded border px-0.5 py-0.5"}`;
      const sportChip = (entry: { key: string; sport: string; seconds: number }) => <span key={entry.key} data-cross-training-event data-split={split || undefined}
        data-cross-sport={entry.sport} data-sport-tone={sportKind(entry.sport)} className={`sport-tone ${chipClass}`}
        title={`${sportLabel(locale, entry.sport)}: ${duration(entry.seconds)}`}>
        <span className="sr-only">{sportLabel(locale, entry.sport)}: </span>
        <span className="flex max-w-full items-center gap-0.5">
          <SportIcon sport={entry.sport} />
          <span aria-hidden="true" className="hidden truncate sm:inline">{sportLabel(locale, entry.sport)}</span>
        </span>
        <span className="whitespace-nowrap tabular-nums">{duration(entry.seconds)}</span>
      </span>;
      const totalChip = () => <span key="total" data-cross-training-event data-cross-total
        className={`border-indigo-300 bg-indigo-100 text-indigo-950 ${chipClass}`}
        title={`${crossText.label}: ${duration(crossSeconds)}\n${cross.map((entry) => `${sportLabel(locale, entry.sport)}: ${duration(entry.seconds)}`).join("\n")}`}>
        <span className="flex items-center gap-0.5 whitespace-nowrap tabular-nums">
          <CrossTrainingIcon /><span className="sr-only">{crossText.label}</span>
        </span>
        <span className="sr-only"> ({cross.map((entry) => sportLabel(locale, entry.sport)).join(", ")}): </span>
        <span className="whitespace-nowrap font-semibold tabular-nums">{duration(crossSeconds)}</span>
      </span>;
      if (month) return cross.length === 1 ? sportChip({ key: cross[0].sport, ...cross[0] }) : totalChip();
      // One chip per session, grouped by sport and kept in start order within a sport.
      const sessions = activities.filter((activity) => !isRunning(activity.sport))
        .sort((a, b) => a.sport.localeCompare(b.sport))
        .map((activity) => ({ key: activity.id, sport: activity.sport, seconds: activity.movingSeconds }));
      if (split) return <span data-cross-training-stack
        className="-mx-1 -mb-1 mt-auto flex shrink-0 flex-col overflow-hidden rounded-b-[5px] sm:-mx-2 sm:-mb-2">{sessions.map(sportChip)}</span>;
      return sessions.map(sportChip);
    })()}
  </>;
  return <div ref={container} data-date={week || month ? undefined : date} data-zone={zone ?? ""}
    data-year-month={month ? date.slice(0, 7) : undefined} aria-disabled={month?.future || undefined}
    className={`relative flex min-h-40 min-w-0 flex-col sm:min-h-44 ${open ? "z-20" : ""}`}
    onMouseEnter={() => { setHovered(true); setDismissed(false); }}
    onMouseLeave={() => setHovered(false)}
    onFocus={() => { setFocused(true); setDismissed(false); }}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setPinned(false); }
    }}
    onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        button.current?.focus();
        setPinned(false); setDismissed(true);
      }
    }}>
    {month ? month.future ? <div className="flex-1 rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-400">{content}</div>
      : <Link href={`/activities?month=${date.slice(0, 7)}`} aria-label={`${monthName}: ${label}`} aria-describedby={open ? popupId : undefined}
        className="flex flex-1 flex-col space-y-1 rounded-xl border border-stone-200 p-4 hover:bg-emerald-50 focus-visible:outline-2">{content}</Link>
      : week ? <button ref={button} type="button"
      aria-describedby={open ? popupId : undefined}
      onClick={() => { setPinned(true); setDismissed(false); }}
      className="flex w-full flex-1 flex-col gap-1 rounded-md border border-stone-200 p-1.5 text-left text-[11px] leading-tight focus-visible:outline-2">
      <span className="sr-only">{header}: </span>
      <span data-week-running className={`flex flex-col gap-0.5 rounded border px-1.5 py-1 ${showCrossTraining ? "run-tone" : "border-stone-200"}`}>
        <span className="sr-only">{calendarText.running}: </span>
        <span className="flex items-baseline justify-between gap-1">
          <span data-week-distance className="text-base font-bold leading-none tabular-nums">
            {formatDecimal(locale, week.distanceMeters / 1000)} <span className="text-[10px] font-medium">{t.units.km}</span>
          </span>
          <span className="flex items-center gap-0.5 whitespace-nowrap font-semibold tabular-nums">
            <SportIcon sport="Run" /><span className="sr-only">{text.runs}: </span><span data-week-runs>{runs.length}</span>
          </span>
        </span>
        <span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 tabular-nums">
          <span className="opacity-75">{calendarText.time}</span>
          <span data-week-time className="text-right font-semibold">{runs.length ? duration(week.movingSeconds) : "—"}</span>
          <span className="opacity-75" title={hrText.aboveTime}>{calendarText.above}</span>
          <span data-week-above className="text-right font-semibold">{week.aboveSeconds === null ? "—" : <>
            {duration(week.aboveSeconds)}{abovePercent !== null && <span className="font-normal opacity-75"> · {formatDecimal(locale, abovePercent)}%</span>}
          </>}</span>
          {abovePercent !== null && <span aria-hidden="true" className="col-span-2 my-0.5 block h-1 overflow-hidden rounded-full bg-stone-200">
            <span className="block h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, abovePercent)}%` }} />
          </span>}
          <span className="opacity-75">{calendarText.avgHr}</span>
          <span data-week-hr className="text-right font-semibold">{averages.averageHr === null ? "—" : `${Math.round(averages.averageHr)} bpm`}</span>
          <span className="opacity-75">{hrText.pace}</span>
          <span data-week-pace className="text-right font-semibold">{averages.pace === null ? "—" : `${formatPace(averages.pace)} /${t.units.km}`}</span>
        </span>
      </span>
      {showCrossTraining && crossSeconds > 0 && <>
        <span data-week-cross-training className="flex items-center gap-1 rounded border border-indigo-300 bg-indigo-100 px-1.5 py-0.5 text-indigo-950">
          <span className="sr-only">{crossText.label}: </span>
          {cross.map((entry) => <SportIcon key={entry.sport} sport={entry.sport} />)}
          <strong className="ml-auto whitespace-nowrap tabular-nums">{duration(crossSeconds)}</strong>
        </span>
        <span data-week-total className="flex items-center gap-1 rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5">
          <span>{calendarText.total}</span><span className="sr-only">: </span>
          <strong className="ml-auto whitespace-nowrap tabular-nums">{duration(dayDuration + crossSeconds)}</strong>
        </span>
      </>}
    </button> : activities.length === 1 ? <Link href={`/activities/${activities[0].id}`} aria-label={label}
      aria-describedby={open ? popupId : undefined}
      className={`flex min-h-20 w-full flex-1 flex-col rounded-md border p-1 text-center focus-visible:outline-2 sm:p-2 ${color} ${outside ? "border-dashed" : ""}`}>
      {content}
    </Link> : activities.length > 1 ? <button ref={button} type="button" aria-label={label}
      aria-expanded={open} aria-controls={popupId}
      onClick={() => { setPinned(true); setDismissed(false); }}
      className={`flex min-h-20 w-full flex-1 flex-col rounded-md border p-1 text-center focus-visible:outline-2 sm:p-2 ${color} ${outside ? "border-dashed" : ""}`}>
      {content}
    </button> : <div className={`flex min-h-20 flex-1 flex-col rounded-md border p-1 text-center sm:p-2 ${color} ${outside ? "border-dashed" : ""}`}>{content}</div>}
    {open && <div ref={popup} id={popupId} role={!week && !month && activities.length > 1 ? "group" : "tooltip"} aria-label={text.details}
      data-placement={placement.above ? "above" : "below"}
      className={`absolute w-56 max-w-[calc(100vw-2rem)] text-left ${placement.above ? "bottom-full pb-1" : "top-full pt-1"} ${index >= 4 ? "right-0" : index === 3 ? "left-1/2 -translate-x-1/2" : "left-0"}`}>
      <div style={{ maxHeight: placement.height }} className="overflow-auto rounded-xl border border-stone-200 bg-white text-sm text-stone-900 shadow-xl">
        <div className="border-b border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold">{header}</div>
        {cross.length > 0 && (week || month) && <section data-cross-training-breakdown className="border-b border-indigo-200 bg-indigo-50 p-3 text-indigo-950">
          <h3 className="font-semibold">{crossText.label} · {duration(crossSeconds)}</h3>
          <ul>{cross.map((entry) => <li key={entry.sport} className="flex justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5 break-words"><SportIcon sport={entry.sport} className="size-3.5" />{sportLabel(locale, entry.sport)}</span><span className="shrink-0 tabular-nums">{duration(entry.seconds)}</span></li>)}</ul>
        </section>}
        {summaries.map((activity) => <div key={activity.id} className="space-y-2 border-b border-stone-100 p-3">
          {isRunning(activity.sport) && activity.maximalEffort && <p className="text-xs font-semibold text-violet-800">{EFFORT_MESSAGES[locale].label}</p>}
          {!week && !month && activities.length > 1
            ? <Link className={`flex items-start gap-1.5 break-words font-semibold underline underline-offset-2 focus-visible:outline-2 ${isRunning(activity.sport) ? "text-emerald-800 decoration-emerald-300" : "text-indigo-800 decoration-indigo-300"}`} href={`/activities/${activity.id}`}>{!isRunning(activity.sport) && <SportIcon sport={activity.sport} className="mt-1 size-3.5" />}<span className="min-w-0">{activity.name || text.details}</span></Link>
            : <p className="flex items-start gap-1.5 break-words font-semibold">{!isRunning(activity.sport) && <SportIcon sport={activity.sport} className="mt-1 size-3.5 text-indigo-800" />}<span className="min-w-0">{activity.name || text.details}</span></p>}
          <div className="grid grid-cols-2 gap-2 tabular-nums">
            <p aria-label={text.distance} className="rounded-md bg-stone-100 px-2 py-1.5 font-semibold">{formatDecimal(locale, activity.distanceMeters / 1000)} <span className="text-xs font-normal text-stone-500">{t.units.km}</span></p>
            <p aria-label={calendarText.time} className="rounded-md bg-stone-100 px-2 py-1.5 font-semibold">{duration(activity.movingSeconds)}</p>
            <p aria-label={text.hr} className="rounded-md bg-rose-50 px-2 py-1.5 font-semibold text-rose-800">{activity.averageHr === null ? "—" : formatDecimal(locale, activity.averageHr)} <span className="text-xs font-normal">bpm</span></p>
            {isRunning(activity.sport) && <p aria-label={hrText.pace} className="rounded-md bg-sky-50 px-2 py-1.5 font-semibold text-sky-800">{activity.distanceMeters > 0 && activity.movingSeconds > 0
              ? formatPace(activity.movingSeconds * 1000 / activity.distanceMeters) : "—"} <span className="text-xs font-normal">{t.units.min}/{t.units.km}</span></p>
            }
          </div>
        </div>)}
        {runs.length > 0 && <div className="space-y-2 p-3">
          <h3 className="text-xs font-medium text-stone-500">{text.zones}</h3>
          <ul className="space-y-1.5 tabular-nums" aria-label={text.zones}>
            {percentages.map((percent, i) => <li key={i} data-zone-percent={i + 1} className="flex items-center gap-2 text-xs">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: zoneColors[i] }} aria-hidden="true" />
              <span className="font-medium">Z{i + 1}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${percent ?? 0}%`, backgroundColor: zoneColors[i] }} />
              </span>
              <span className="text-right font-semibold">{percent === null ? "—" : `${duration(zoneSeconds[i])} · ${formatDecimal(locale, percent)}%`}</span>
            </li>)}
          </ul>
        </div>}
      </div>
    </div>}
  </div>;
});
