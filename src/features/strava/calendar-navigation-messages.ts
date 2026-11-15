import type { Locale } from "@/features/i18n/locales";

export const CALENDAR_NAVIGATION: Record<Locale, { week: string; month: string; monthCount: string; previous: string; next: string }> = {
  en: { week: "Week", month: "Month", monthCount: "Number of months", previous: "Previous period", next: "Next period" },
  fr: { week: "Semaine", month: "Mois", monthCount: "Nombre de mois", previous: "Période précédente", next: "Période suivante" },
  de: { week: "Woche", month: "Monat", monthCount: "Anzahl der Monate", previous: "Vorheriger Zeitraum", next: "Nächster Zeitraum" },
  es: { week: "Semana", month: "Mes", monthCount: "Número de meses", previous: "Periodo anterior", next: "Periodo siguiente" },
  pt: { week: "Semana", month: "Mês", monthCount: "Número de meses", previous: "Período anterior", next: "Período seguinte" },
  pl: { week: "Tydzień", month: "Miesiąc", monthCount: "Liczba miesięcy", previous: "Poprzedni okres", next: "Następny okres" },
  ru: { week: "Неделя", month: "Месяц", monthCount: "Количество месяцев", previous: "Предыдущий период", next: "Следующий период" },
  uk: { week: "Тиждень", month: "Місяць", monthCount: "Кількість місяців", previous: "Попередній період", next: "Наступний період" },
  be: { week: "Тыдзень", month: "Месяц", monthCount: "Колькасць месяцаў", previous: "Папярэдні перыяд", next: "Наступны перыяд" },
  it: { week: "Settimana", month: "Mese", monthCount: "Numero di mesi", previous: "Periodo precedente", next: "Periodo successivo" },
};
