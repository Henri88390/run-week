import type { Locale } from "@/features/i18n/locales";

type CalendarText = { time: string; above: string; paceZones: string };
export const CALENDAR_MESSAGES: Record<Locale, CalendarText> = {
  en: { time: "Time", above: "> threshold", paceZones: "Pace distribution" },
  fr: { time: "Durée", above: "> seuil", paceZones: "Répartition des allures" },
  de: { time: "Zeit", above: "> Schwelle", paceZones: "Tempoverteilung" },
  es: { time: "Tiempo", above: "> umbral", paceZones: "Distribución de ritmos" },
  pt: { time: "Tempo", above: "> limiar", paceZones: "Distribuição de ritmos" },
  pl: { time: "Czas", above: "> próg", paceZones: "Rozkład tempa" },
  ru: { time: "Время", above: "> порога", paceZones: "Распределение темпа" },
  uk: { time: "Час", above: "> порога", paceZones: "Розподіл темпу" },
  be: { time: "Час", above: "> парога", paceZones: "Размеркаванне тэмпу" },
  it: { time: "Tempo", above: "> soglia", paceZones: "Distribuzione del passo" },
};
