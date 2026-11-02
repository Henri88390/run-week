"use client";

import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { BY, DE, ES, FR, GB, IT, PL, PT, RU, UA } from "country-flag-icons/react/3x2";
import { LOCALE_NAMES, LOCALES, type Locale } from "./locales";
import { setLocale, useI18n } from "./use-i18n";

const FLAGS: Record<Locale, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  en: GB,
  fr: FR,
  de: DE,
  es: ES,
  pt: PT,
  pl: PL,
  ru: RU,
  uk: UA,
  be: BY,
  it: IT,
};

function Flag({ locale }: { locale: Locale }) {
  const Icon = FLAGS[locale];
  return <Icon aria-hidden className="h-3.5 w-5 shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" />;
}

export function DocumentLanguage() {
  const { locale } = useI18n();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}

export function LanguageSelect({ className = "" }: { className?: string }) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const options = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    options.current[LOCALES.indexOf(locale)]?.focus();
    const close = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
    // Focus the current language only when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (code: Locale) => {
    setLocale(code);
    setOpen(false);
    button.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = options.current.findIndex((option) => option === document.activeElement);
    const move = (next: number) => {
      event.preventDefault();
      options.current[(next + LOCALES.length) % LOCALES.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(LOCALES.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "Tab") setOpen(false);
  };

  return <div className={className}>
    <div ref={container} className="relative inline-block text-sm">
      <button ref={button} type="button" aria-haspopup="true" aria-expanded={open} aria-controls={listId}
        aria-label={`${t.language}: ${LOCALE_NAMES[locale]}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white py-1 pr-2 pl-2 text-stone-800 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
        <Flag locale={locale} />
        <span lang={locale}>{LOCALE_NAMES[locale]}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className={`size-4 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>
      <ul id={listId} hidden={!open} aria-label={t.language} onKeyDown={onMenuKeyDown}
        className="absolute right-0 z-10 mt-1 min-w-full space-y-0.5 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
        {LOCALES.map((code, index) => <li key={code}>
          <button ref={(element) => { options.current[index] = element; }} type="button" lang={code}
            aria-current={code === locale ? "true" : undefined}
            onClick={() => choose(code)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left whitespace-nowrap hover:bg-stone-100 focus-visible:bg-stone-100 focus-visible:outline-none ${code === locale ? "font-semibold text-stone-900" : "text-stone-700"}`}>
            <Flag locale={code} />
            {LOCALE_NAMES[code]}
          </button>
        </li>)}
      </ul>
    </div>
  </div>;
}
