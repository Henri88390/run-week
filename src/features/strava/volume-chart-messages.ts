import type { Locale } from "@/features/i18n/locales";

type VolumeChartText = {
  title: string; empty: string; display: string; combined: string; separate: string; combinedHint: string; separateHint: string;
};

export const VOLUME_CHART_MESSAGES: Record<Locale, VolumeChartText> = {
  en: { title: "Training volume", empty: "Select distance, duration, or both.", display: "Chart", combined: "Stacked total", separate: "Separate lines",
    combinedHint: "Running and cross-training stacked; the top line is the total.", separateHint: "Each sport drawn on its own from zero, to compare them." },
  fr: { title: "Volume d’entraînement", empty: "Sélectionnez la distance, la durée ou les deux.", display: "Graphique", combined: "Total empilé", separate: "Courbes séparées",
    combinedHint: "Course et entraînement croisé empilés ; la ligne du haut est le total.", separateHint: "Chaque sport tracé depuis zéro, pour les comparer." },
  de: { title: "Trainingsumfang", empty: "Distanz, Dauer oder beides auswählen.", display: "Diagramm", combined: "Gestapelte Summe", separate: "Getrennte Linien",
    combinedHint: "Laufen und Ausgleichstraining gestapelt; die obere Linie ist die Summe.", separateHint: "Jede Sportart ab null gezeichnet, zum Vergleichen." },
  es: { title: "Volumen de entrenamiento", empty: "Selecciona distancia, duración o ambas.", display: "Gráfico", combined: "Total apilado", separate: "Líneas separadas",
    combinedHint: "Carrera y entrenamiento cruzado apilados; la línea superior es el total.", separateHint: "Cada deporte trazado desde cero para compararlos." },
  pt: { title: "Volume de treino", empty: "Selecione distância, duração ou ambas.", display: "Gráfico", combined: "Total empilhado", separate: "Linhas separadas",
    combinedHint: "Corrida e treino cruzado empilhados; a linha superior é o total.", separateHint: "Cada desporto traçado a partir de zero, para os comparar." },
  pl: { title: "Objętość treningu", empty: "Wybierz dystans, czas lub oba.", display: "Wykres", combined: "Suma skumulowana", separate: "Osobne linie",
    combinedHint: "Bieganie i trening uzupełniający skumulowane; górna linia to suma.", separateHint: "Każdy sport rysowany od zera, aby je porównać." },
  ru: { title: "Объём тренировок", empty: "Выберите расстояние, время или оба показателя.", display: "График", combined: "Общая сумма", separate: "Отдельные линии",
    combinedHint: "Бег и кросс-тренинг сложены; верхняя линия — итог.", separateHint: "Каждый вид спорта от нуля, чтобы сравнить их." },
  uk: { title: "Обсяг тренувань", empty: "Виберіть відстань, час або обидва показники.", display: "Графік", combined: "Загальна сума", separate: "Окремі лінії",
    combinedHint: "Біг і крос-тренінг складено; верхня лінія — підсумок.", separateHint: "Кожен вид спорту від нуля, щоб порівняти їх." },
  be: { title: "Аб’ём трэніровак", empty: "Выберыце адлегласць, час або абодва паказчыкі.", display: "Графік", combined: "Агульная сума", separate: "Асобныя лініі",
    combinedHint: "Бег і крос-трэнінг складзены; верхняя лінія — вынік.", separateHint: "Кожны від спорту ад нуля, каб параўнаць іх." },
  it: { title: "Volume di allenamento", empty: "Seleziona distanza, durata o entrambe.", display: "Grafico", combined: "Totale sovrapposto", separate: "Linee separate",
    combinedHint: "Corsa e allenamento incrociato sovrapposti; la linea superiore è il totale.", separateHint: "Ogni sport tracciato da zero, per confrontarli." },
};
