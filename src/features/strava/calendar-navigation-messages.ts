import type { Locale } from "@/features/i18n/locales";

export const CALENDAR_NAVIGATION: Record<Locale, { week: string; month: string; previous: string; next: string }> = {
  en: { week: "Week", month: "Month", previous: "Previous period", next: "Next period" },
  fr: { week: "Semaine", month: "Mois", previous: "Période précédente", next: "Période suivante" },
  de: { week: "Woche", month: "Monat", previous: "Vorheriger Zeitraum", next: "Nächster Zeitraum" },
  es: { week: "Semana", month: "Mes", previous: "Periodo anterior", next: "Periodo siguiente" },
  pt: { week: "Semana", month: "Mês", previous: "Período anterior", next: "Período seguinte" },
  pl: { week: "Tydzień", month: "Miesiąc", previous: "Poprzedni okres", next: "Następny okres" },
  ru: { week: "Неделя", month: "Месяц", previous: "Предыдущий период", next: "Следующий период" },
  uk: { week: "Тиждень", month: "Місяць", previous: "Попередній період", next: "Наступний період" },
  be: { week: "Тыдзень", month: "Месяц", previous: "Папярэдні перыяд", next: "Наступны перыяд" },
  it: { week: "Settimana", month: "Mese", previous: "Periodo precedente", next: "Periodo successivo" },
};
