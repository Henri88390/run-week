"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LOCALE, detectLocale, isLocale, type Locale } from "./locales";
import { be } from "./messages/be";
import { de } from "./messages/de";
import { en, type Messages } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { it } from "./messages/it";
import { pl } from "./messages/pl";
import { pt } from "./messages/pt";
import { ru } from "./messages/ru";
import { uk } from "./messages/uk";

const STORAGE_KEY = "run-week-locale";
export const MESSAGES: Record<Locale, Messages> = { en, fr, de, es, pt, pl, ru, uk, be, it };

let current: Locale | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function readLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage can be unavailable; fall back to the browser preference.
  }
  return detectLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

function getSnapshot(): Locale {
  current ??= readLocale();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const refresh = () => {
    current = readLocale();
    emit();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) refresh();
  };
  window.addEventListener("languagechange", refresh);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("languagechange", refresh);
    window.removeEventListener("storage", onStorage);
  };
}

export function setLocale(locale: Locale) {
  current = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // The choice still applies to this page.
  }
  emit();
}

export function useI18n(): { locale: Locale; t: Messages } {
  const locale = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_LOCALE);
  return { locale, t: MESSAGES[locale] };
}
