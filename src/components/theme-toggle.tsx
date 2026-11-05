"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { getThemeSnapshot, setTheme, subscribeToTheme } from "@/features/theme/theme-store";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => "light");
  const { t } = useI18n();
  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const label = isDark ? t.theme.lightMode : t.theme.darkMode;

  return <button type="button" aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
    aria-pressed={isDark} title={isDark ? t.theme.switchToLight : t.theme.switchToDark}
    onClick={() => setTheme(nextTheme)}
    className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
    {isDark
      ? <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4">
        <circle cx="10" cy="10" r="3.5" /><path strokeLinecap="round" d="M10 1.5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.51-6.01-1.42 1.42m-9.18 9.18-1.42 1.42m12.02 0-1.42-1.42m-9.18-9.18L4 2.99" />
      </svg>
      : <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
        <path d="M17.3 12.2A7.6 7.6 0 0 1 7.8 2.7a7.8 7.8 0 1 0 9.5 9.5Z" />
      </svg>}
    <span>{label}</span>
  </button>;
}
