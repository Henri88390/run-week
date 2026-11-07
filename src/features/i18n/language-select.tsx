"use client";

import { useEffect, type ComponentType } from "react";
import { BY, DE, ES, FR, GB, IT, PL, PT, RU, UA } from "country-flag-icons/react/3x2";
import { Dropdown } from "@/components/dropdown";
import { LOCALE_NAMES, LOCALES, type Locale } from "./locales";
import { setLocale, useI18n } from "./use-i18n";

const FLAGS: Record<Locale, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  en: GB, fr: FR, de: DE, es: ES, pt: PT, pl: PL, ru: RU, uk: UA, be: BY, it: IT,
};

export function Flag({ locale }: { locale: Locale }) {
  const Icon = FLAGS[locale];
  return <Icon aria-hidden className="h-3.5 w-5 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />;
}

export function DocumentLanguage() {
  const { locale } = useI18n();
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return null;
}

export function LanguageSelect({ className = "", menuClassName }: { className?: string; menuClassName?: string }) {
  const { locale, t } = useI18n();
  return <div className={className}>
    <div className="inline-block text-sm">
      <Dropdown value={locale} aria-label={`${t.language}: ${LOCALE_NAMES[locale]}`} menuClassName={menuClassName}
        options={LOCALES.map((code) => ({
          value: code,
          text: LOCALE_NAMES[code],
          label: <><Flag locale={code} /><span lang={code}>{LOCALE_NAMES[code]}</span></>,
        }))}
        onChange={(value) => {
          const code = LOCALES.find((entry) => entry === value);
          if (code) setLocale(code);
        }}
        className="min-h-9 rounded-lg border border-stone-200 bg-white py-1.5 pr-2 pl-2 text-stone-800 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" />
    </div>
  </div>;
}
