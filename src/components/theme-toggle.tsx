"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { getThemeSnapshot, setTheme, subscribeToTheme } from "@/features/theme/theme-store";

function SunIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-4">
    <circle cx="10" cy="10" r="3.5" />
    <path strokeLinecap="round" d="M10 1.5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.51-6.01-1.42 1.42m-9.18 9.18-1.42 1.42m12.02 0-1.42-1.42m-9.18-9.18L4 2.99" />
  </svg>;
}

function MoonIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="size-4">
    <path d="M17.3 12.2A7.6 7.6 0 0 1 7.8 2.7a7.8 7.8 0 1 0 9.5 9.5Z" />
  </svg>;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => "light");
  const { t } = useI18n();
  const isDark = theme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  return <button type="button" role="switch" aria-label={t.theme.darkMode}
    aria-checked={isDark} title={isDark ? t.theme.switchToLight : t.theme.switchToDark}
    onClick={() => setTheme(nextTheme)}
    className="theme-switch inline-flex min-h-11 shrink-0 items-center rounded-full">
    <span aria-hidden="true" className="theme-switch-track">
      <span className="theme-switch-sun"><SunIcon /></span>
      <span className="theme-switch-moon"><MoonIcon /></span>
      <span className="theme-switch-thumb">{isDark ? <MoonIcon /> : <SunIcon />}</span>
    </span>
  </button>;
}
