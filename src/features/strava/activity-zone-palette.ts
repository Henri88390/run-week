/** Shared theme-aware identity for activity zone rows, bars and both chart overlays. */
export const ACTIVITY_ZONE_COLORS = [
  "var(--activity-zone-1)", "var(--activity-zone-2)", "var(--activity-zone-3)",
  "var(--activity-zone-4)", "var(--activity-zone-5)",
] as const;

/** Calendar zone bars, popovers and the Activities page zone chart (Z2 is softened in dark mode). */
export const CALENDAR_ZONE_COLORS = ["#0ea5e9", "var(--calendar-zone-2)", "#eab308", "#f97316", "#f43f5e"] as const;
