export const LOCALES = ["en", "fr", "de", "es", "pt", "pl", "ru", "uk", "be", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  pt: "Português",
  pl: "Polski",
  ru: "Русский",
  uk: "Українська",
  be: "Беларуская",
  it: "Italiano",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Picks the first supported language from the browser's preference list, e.g. "fr-CA" → "fr". */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function plural(
  locale: Locale,
  count: number,
  forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string },
): string {
  return forms[new Intl.PluralRules(locale).select(count)] ?? forms.other;
}

// Chromium ships no Belarusian date or number data. These CLDR values keep the output
// identical in every browser; Russian shares Belarusian number separators.
const BELARUSIAN_DATES = {
  long: ["панядзелак", "аўторак", "серада", "чацвер", "пятніца", "субота", "нядзеля"],
  short: ["пн", "аў", "ср", "чц", "пт", "сб", "нд"],
  months: ["сту", "лют", "сак", "кра", "мая", "чэр", "ліп", "жні", "вер", "кас", "ліс", "сне"],
};

function numberLocale(locale: Locale): string {
  return locale === "be" ? "ru" : locale;
}

export function formatDecimal(locale: Locale, value: number, digits = 1): string {
  return new Intl.NumberFormat(numberLocale(locale), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function formatInteger(locale: Locale, value: number): string {
  return new Intl.NumberFormat(numberLocale(locale)).format(value);
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** Weekday name for a Monday-based index (0 = Monday). */
export function weekdayName(locale: Locale, index: number, width: "long" | "short" = "long"): string {
  if (locale === "be") return capitalize(BELARUSIAN_DATES[width][index]);
  const date = new Date(Date.UTC(2024, 0, 1 + index));
  return capitalize(new Intl.DateTimeFormat(locale, { weekday: width, timeZone: "UTC" }).format(date));
}

export function formatDate(locale: Locale, isoDate: string): string {
  if (locale === "be") {
    const [year, month, day] = isoDate.split("-").map(Number);
    return `${day} ${BELARUSIAN_DATES.months[month - 1]} ${year} г.`;
  }
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}
