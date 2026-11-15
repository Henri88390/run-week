import type { Locale } from "@/features/i18n/locales";

type CalendarText = { time: string; above: string; paceZones: string; avgHr: string; running: string; total: string };
export const CALENDAR_MESSAGES: Record<Locale, CalendarText> = {
  en: { time: "Time", above: "> threshold", paceZones: "Pace distribution", avgHr: "Avg HR", running: "Running", total: "Total" },
  fr: { time: "Durée", above: "> seuil", paceZones: "Répartition des allures", avgHr: "FC moy.", running: "Course", total: "Total" },
  de: { time: "Zeit", above: "> Schwelle", paceZones: "Tempoverteilung", avgHr: "Ø HF", running: "Laufen", total: "Gesamt" },
  es: { time: "Tiempo", above: "> umbral", paceZones: "Distribución de ritmos", avgHr: "FC media", running: "Carrera", total: "Total" },
  pt: { time: "Tempo", above: "> limiar", paceZones: "Distribuição de ritmos", avgHr: "FC média", running: "Corrida", total: "Total" },
  pl: { time: "Czas", above: "> próg", paceZones: "Rozkład tempa", avgHr: "Śr. tętno", running: "Bieganie", total: "Łącznie" },
  ru: { time: "Время", above: "> порога", paceZones: "Распределение темпа", avgHr: "Ср. пульс", running: "Бег", total: "Всего" },
  uk: { time: "Час", above: "> порога", paceZones: "Розподіл темпу", avgHr: "Сер. пульс", running: "Біг", total: "Усього" },
  be: { time: "Час", above: "> парога", paceZones: "Размеркаванне тэмпу", avgHr: "Сяр. пульс", running: "Бег", total: "Усяго" },
  it: { time: "Tempo", above: "> soglia", paceZones: "Distribuzione del passo", avgHr: "FC media", running: "Corsa", total: "Totale" },
};
