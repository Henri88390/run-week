import type { Locale } from "@/features/i18n/locales";

export const VOLUME_CHART_MESSAGES: Record<Locale, { title: string; empty: string }> = {
  en: { title: "Training volume", empty: "Select distance, duration, or both." },
  fr: { title: "Volume d’entraînement", empty: "Sélectionnez la distance, la durée ou les deux." },
  de: { title: "Trainingsumfang", empty: "Distanz, Dauer oder beides auswählen." },
  es: { title: "Volumen de entrenamiento", empty: "Selecciona distancia, duración o ambas." },
  pt: { title: "Volume de treino", empty: "Selecione distância, duração ou ambas." },
  pl: { title: "Objętość treningu", empty: "Wybierz dystans, czas lub oba." },
  ru: { title: "Объём тренировок", empty: "Выберите расстояние, время или оба показателя." },
  uk: { title: "Обсяг тренувань", empty: "Виберіть відстань, час або обидва показники." },
  be: { title: "Аб’ём трэніровак", empty: "Выберыце адлегласць, час або абодва паказчыкі." },
  it: { title: "Volume di allenamento", empty: "Seleziona distanza, durata o entrambe." },
};
