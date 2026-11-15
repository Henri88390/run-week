import type { Locale } from "@/features/i18n/locales";

type VolumeChartText = {
  title: string; empty: string; display: string; combined: string; separate: string; combinedHint: string; separateHint: string;
  groupBy: string; perWeek: string; perMonth: string; allSports: string; bySport: string; measure: string;
};

export const VOLUME_CHART_MESSAGES: Record<Locale, VolumeChartText> = {
  en: { title: "Training volume", empty: "Select distance, duration, or both.", display: "Chart", combined: "Stacked total", separate: "Separate lines", groupBy: "Group by", perWeek: "Per week", perMonth: "Per month", allSports: "Combined", bySport: "By sport", measure: "Metric",
    combinedHint: "Running and cross-training stacked; the top line is the total.", separateHint: "Each sport drawn on its own from zero, to compare them." },
  fr: { title: "Volume d’entraînement", empty: "Sélectionnez la distance, la durée ou les deux.", display: "Graphique", combined: "Total empilé", separate: "Courbes séparées", groupBy: "Regrouper", perWeek: "Par semaine", perMonth: "Par mois", allSports: "Regroupé", bySport: "Par sport", measure: "Mesure",
    combinedHint: "Course et entraînement croisé empilés ; la ligne du haut est le total.", separateHint: "Chaque sport tracé depuis zéro, pour les comparer." },
  de: { title: "Trainingsumfang", empty: "Distanz, Dauer oder beides auswählen.", display: "Diagramm", combined: "Gestapelte Summe", separate: "Getrennte Linien", groupBy: "Gruppieren", perWeek: "Pro Woche", perMonth: "Pro Monat", allSports: "Zusammen", bySport: "Nach Sportart", measure: "Messgröße",
    combinedHint: "Laufen und Ausgleichstraining gestapelt; die obere Linie ist die Summe.", separateHint: "Jede Sportart ab null gezeichnet, zum Vergleichen." },
  es: { title: "Volumen de entrenamiento", empty: "Selecciona distancia, duración o ambas.", display: "Gráfico", combined: "Total apilado", separate: "Líneas separadas", groupBy: "Agrupar", perWeek: "Por semana", perMonth: "Por mes", allSports: "Agrupado", bySport: "Por deporte", measure: "Métrica",
    combinedHint: "Carrera y entrenamiento cruzado apilados; la línea superior es el total.", separateHint: "Cada deporte trazado desde cero para compararlos." },
  pt: { title: "Volume de treino", empty: "Selecione distância, duração ou ambas.", display: "Gráfico", combined: "Total empilhado", separate: "Linhas separadas", groupBy: "Agrupar", perWeek: "Por semana", perMonth: "Por mês", allSports: "Agrupado", bySport: "Por desporto", measure: "Métrica",
    combinedHint: "Corrida e treino cruzado empilhados; a linha superior é o total.", separateHint: "Cada desporto traçado a partir de zero, para os comparar." },
  pl: { title: "Objętość treningu", empty: "Wybierz dystans, czas lub oba.", display: "Wykres", combined: "Suma skumulowana", separate: "Osobne linie", groupBy: "Grupuj", perWeek: "Tygodniowo", perMonth: "Miesięcznie", allSports: "Razem", bySport: "Według sportu", measure: "Miara",
    combinedHint: "Bieganie i trening uzupełniający skumulowane; górna linia to suma.", separateHint: "Każdy sport rysowany od zera, aby je porównać." },
  ru: { title: "Объём тренировок", empty: "Выберите расстояние, время или оба показателя.", display: "График", combined: "Общая сумма", separate: "Отдельные линии", groupBy: "Группировать", perWeek: "По неделям", perMonth: "По месяцам", allSports: "Вместе", bySport: "По видам спорта", measure: "Показатель",
    combinedHint: "Бег и кросс-тренинг сложены; верхняя линия — итог.", separateHint: "Каждый вид спорта от нуля, чтобы сравнить их." },
  uk: { title: "Обсяг тренувань", empty: "Виберіть відстань, час або обидва показники.", display: "Графік", combined: "Загальна сума", separate: "Окремі лінії", groupBy: "Групувати", perWeek: "По тижнях", perMonth: "По місяцях", allSports: "Разом", bySport: "За видами спорту", measure: "Показник",
    combinedHint: "Біг і крос-тренінг складено; верхня лінія — підсумок.", separateHint: "Кожен вид спорту від нуля, щоб порівняти їх." },
  be: { title: "Аб’ём трэніровак", empty: "Выберыце адлегласць, час або абодва паказчыкі.", display: "Графік", combined: "Агульная сума", separate: "Асобныя лініі", groupBy: "Групаваць", perWeek: "Па тыднях", perMonth: "Па месяцах", allSports: "Разам", bySport: "Па відах спорту", measure: "Паказчык",
    combinedHint: "Бег і крос-трэнінг складзены; верхняя лінія — вынік.", separateHint: "Кожны від спорту ад нуля, каб параўнаць іх." },
  it: { title: "Volume di allenamento", empty: "Seleziona distanza, durata o entrambe.", display: "Grafico", combined: "Totale sovrapposto", separate: "Linee separate", groupBy: "Raggruppa", perWeek: "Per settimana", perMonth: "Per mese", allSports: "Insieme", bySport: "Per sport", measure: "Metrica",
    combinedHint: "Corsa e allenamento incrociato sovrapposti; la linea superiore è il totale.", separateHint: "Ogni sport tracciato da zero, per confrontarli." },
};
