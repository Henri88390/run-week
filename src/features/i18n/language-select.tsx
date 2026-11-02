"use client";

import { useEffect } from "react";
import { LOCALE_NAMES, LOCALES, isLocale } from "./locales";
import { setLocale, useI18n } from "./use-i18n";

export function LanguageSelect() {
  const { locale, t } = useI18n();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <label className="inline-flex items-center gap-2 text-sm text-stone-600">
    <span className="sr-only">{t.language}</span>
    <select value={locale} onChange={(event) => {
      if (isLocale(event.target.value)) setLocale(event.target.value);
    }} className="rounded-lg border border-stone-200 bg-white py-1 pr-7 pl-2 text-sm text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
      {LOCALES.map((code) => <option key={code} value={code} lang={code}>{LOCALE_NAMES[code]}</option>)}
    </select>
  </label>;
}
