"use client";

import type { CSSProperties } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { formatDecimal, formatInteger } from "@/features/i18n/locales";
import { activityZoneBounds, durationWithSeconds } from "../analytics";
import { ACTIVITY_ZONES_MESSAGES } from "../activity-zones-messages";
import { STRAVA_MESSAGES } from "../messages";
import { ACTIVITY_ZONE_COLORS } from "../activity-zone-palette";
import { DisclosureHeading } from "./disclosure-heading";

export function ActivityZones({ zoneTimes, elapsedSeconds, selected, onToggle }: {
  zoneTimes: { zones: number[]; unclassified: number }; elapsedSeconds: number;
  selected: readonly number[]; onToggle: (zone: number) => void;
}) {
  const { locale, t } = useI18n();
  const text = ACTIVITY_ZONES_MESSAGES[locale];
  const classified = zoneTimes.zones.reduce((sum, value) => sum + value, 0);
  const duration = (seconds: number) => {
    const value = durationWithSeconds(seconds);
    return `${value.hours > 0 ? `${formatInteger(locale, value.hours)} ${t.units.h} ` : ""}${formatInteger(locale, value.minutes)} ${t.units.min} ${formatInteger(locale, value.seconds)} ${t.units.sec}`;
  };
  return <details open className="group/disclosure panel min-w-0" data-activity-zones>
    <DisclosureHeading id="activity-zones-title" title={text.title} />
    <div className="mt-3 space-y-3">
    <p className="text-sm text-stone-600">{text.note}</p>
    <p id="activity-zones-help" className="text-sm text-stone-600">{text.selectionHelp}</p>
    <ul className="space-y-2">
      {zoneTimes.zones.map((seconds, index) => {
        const zone = index + 1;
        const labels = ["<70%", "70–80%", "80–85%", "85–90%", "≥90%"];
        const [min, max] = activityZoneBounds(zone);
        const color = ACTIVITY_ZONE_COLORS[index];
        const style: CSSProperties & { "--activity-zone-color": string } = { "--activity-zone-color": color };
        return <li key={zone}>
          <button type="button" data-zone-button={zone} aria-pressed={selected.includes(zone)}
            aria-describedby="activity-zones-help" onClick={() => onToggle(zone)}
            style={style}
            className="activity-zone-row block min-h-11 w-full rounded-lg border border-stone-300 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2">
            <span className="flex flex-wrap justify-between gap-x-3 text-sm tabular-nums">
              <span>Z{zone} {labels[index]} <span className="text-xs">({formatDecimal(locale, min)}–{zone < 5 ? "<" : "≤"}{formatDecimal(locale, max)} bpm)</span></span>
              <span>{classified > 0 ? duration(seconds) : STRAVA_MESSAGES[locale].unavailable}</span>
            </span>
            <span className="mt-2 block h-3 rounded bg-stone-100" aria-hidden="true">
              <span data-zone-bar={zone} className="block h-3 rounded" style={{ backgroundColor: color, width: `${elapsedSeconds > 0 ? seconds / elapsedSeconds * 100 : 0}%` }} />
            </span>
          </button>
        </li>;
      })}
    </ul>
    <p className="flex flex-wrap justify-between gap-x-3 text-sm tabular-nums"><span>{text.unclassified}</span><span>{duration(zoneTimes.unclassified)}</span></p>
    </div>
  </details>;
}
