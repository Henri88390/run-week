"use client";

import { useId, useState } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDecimal, formatInteger } from "@/features/i18n/locales";
import { averageWeeklyVolume } from "../weekly-volume";
import { roundedDuration } from "../analytics";
import { WEEKLY_VOLUME_MESSAGES } from "../weekly-volume-messages";
import type { DashboardData } from "../types";

export function WeeklyVolume({ data }: { data: DashboardData }) {
  const { locale, t } = useI18n();
  const text = WEEKLY_VOLUME_MESSAGES[locale];
  const [input, setInput] = useState("4");
  const id = useId();
  const weeks = Number(input);
  const valid = input.trim() !== "" && Number.isSafeInteger(weeks) && weeks > 0;
  const month = averageWeeklyVolume(data.weeklyVolumes, data.today, { month: data.month });
  const monthName = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString(locale, {
    month: "long", year: "numeric", timeZone: "UTC",
  });
  const recent = valid ? averageWeeklyVolume(data.weeklyVolumes, data.today, { weeks }) : null;
  const summary = (value: typeof month) => {
    if (value.movingSeconds === null || value.distanceMeters === null) return text.empty;
    const duration = roundedDuration(value.movingSeconds);
    return `${formatInteger(locale, duration.hours)} ${t.units.h} ${formatInteger(locale, duration.minutes)} ${t.units.min} · ${formatDecimal(locale, value.distanceMeters / 1000)} ${t.units.km}`;
  };
  return <section data-weekly-volume className="panel space-y-3">
    <h2 className="text-lg font-semibold">{text.title}</h2>
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><h3 className="text-sm text-stone-600">{text.month} {monthName} :</h3>
        <p data-monthly-weekly-volume className="text-sm font-semibold tabular-nums">{summary(month)}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={id} className="block text-sm text-stone-600">{text.weeks}</label>
        <div className="flex items-center gap-3">
          <input id={id} type="number" min="1" step="1" required value={input}
            aria-invalid={!valid} aria-describedby={`${id}-help${valid ? "" : ` ${id}-error`}`}
            onChange={(event) => setInput(event.target.value)}
            className="w-20 shrink-0 rounded-lg border border-stone-300 px-2 py-1 focus-visible:outline-2" />
          {recent ? <p data-recent-weekly-volume aria-live="polite" className="min-w-0 text-sm font-semibold tabular-nums">{summary(recent)}</p>
            : <p id={`${id}-error`} role="alert" className="min-w-0 text-sm text-red-700">{text.invalid}</p>}
        </div>
      </div>
    </div>
    <p id={`${id}-help`} className="text-xs text-stone-600">{text.help}</p>
  </section>;
}
