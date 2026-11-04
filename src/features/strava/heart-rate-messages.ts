import type { Locale } from "@/features/i18n/locales";

type HeartRateText = {
  pace: string;
  maxHr: string; help: string; totalTime: string; aboveTime: string; weeklyKm: string;
  partial: string; importing: string;
};
export const HEART_RATE_MESSAGES: Record<Locale, HeartRateText> = {
  en: {
    pace: "Pace",
    maxHr: "Maximum heart rate (bpm)",
    help: "Enter your own HRmax (60–240 bpm). Z1 <70%, Z2 70–80%, Z3 80–85%, Z4 85–90%, Z5 90–100%. Above threshold means strictly >90% HRmax. Calendar colors use average HR, weighted by moving time for multiple runs. Missing HR stays unclassified.",
    totalTime: "Total running time", aboveTime: "Time above threshold", weeklyKm: "Total kilometers",
    partial: "Partial HR coverage: only valid recorded intervals count. Gaps over 15 seconds and HR above configured HRmax are excluded.",
    importing: "Importing all activities and recorded samples…",
  },
  fr: {
    pace: "Allure",
    maxHr: "Fréquence cardiaque maximale (bpm)",
    help: "Saisissez votre FCmax (60–240 bpm). Z1 <70 %, Z2 70–80 %, Z3 80–85 %, Z4 85–90 %, Z5 90–100 %. Au-dessus du seuil signifie strictement >90 % FCmax. Les couleurs utilisent la FC moyenne, pondérée par le temps en mouvement pour plusieurs courses. Sans FC, aucune zone n’est attribuée.",
    totalTime: "Temps total de course", aboveTime: "Temps passé au-dessus du seuil", weeklyKm: "Total de kilomètres",
    partial: "Couverture FC partielle : seuls les intervalles valides enregistrés comptent. Les lacunes de plus de 15 s et les FC supérieures à la FCmax configurée sont exclues.",
    importing: "Import de toutes les activités et séries enregistrées…",
  },
  de: {
    pace: "Tempo",
    maxHr: "Maximale Herzfrequenz (bpm)",
    help: "Eigene HFmax eingeben (60–240 bpm). Z1 <70 %, Z2 70–80 %, Z3 80–85 %, Z4 85–90 %, Z5 90–100 %. Über der Schwelle bedeutet strikt >90 % HFmax. Kalenderfarben nutzen die nach Bewegungszeit gewichtete mittlere HF. Ohne HF keine Zone.",
    totalTime: "Gesamtlaufzeit", aboveTime: "Zeit über der Schwelle", weeklyKm: "Gesamtkilometer",
    partial: "Unvollständige HF-Daten: nur gültige Intervalle zählen. Lücken über 15 Sekunden und HF über der eingestellten HFmax sind ausgeschlossen.",
    importing: "Alle Aktivitäten und Messreihen werden importiert…",
  },
  es: {
    pace: "Ritmo",
    maxHr: "Frecuencia cardíaca máxima (bpm)",
    help: "Introduce tu FCmáx (60–240 bpm). Z1 <70 %, Z2 70–80 %, Z3 80–85 %, Z4 85–90 %, Z5 90–100 %. Sobre el umbral significa estrictamente >90 % FCmáx. Los colores usan la FC media ponderada por tiempo en movimiento. Sin FC no hay zona.",
    totalTime: "Tiempo total de carrera", aboveTime: "Tiempo sobre el umbral", weeklyKm: "Kilómetros totales",
    partial: "Cobertura cardíaca parcial: solo cuentan intervalos válidos. Se excluyen huecos de más de 15 s y valores superiores a la FCmáx configurada.",
    importing: "Importando todas las actividades y muestras…",
  },
  pt: {
    pace: "Ritmo",
    maxHr: "Frequência cardíaca máxima (bpm)",
    help: "Introduza a sua FCmáx (60–240 bpm). Z1 <70 %, Z2 70–80 %, Z3 80–85 %, Z4 85–90 %, Z5 90–100 %. Acima do limiar significa estritamente >90 % FCmáx. As cores usam a FC média ponderada pelo tempo em movimento. Sem FC não há zona.",
    totalTime: "Tempo total de corrida", aboveTime: "Tempo acima do limiar", weeklyKm: "Quilómetros totais",
    partial: "Cobertura FC parcial: contam apenas intervalos válidos. Excluem-se lacunas superiores a 15 s e valores acima da FCmáx configurada.",
    importing: "A importar todas as atividades e amostras…",
  },
  pl: {
    pace: "Tempo",
    maxHr: "Tętno maksymalne (bpm)",
    help: "Podaj własne HRmax (60–240 bpm). Z1 <70%, Z2 70–80%, Z3 80–85%, Z4 85–90%, Z5 90–100%. Powyżej progu oznacza ściśle >90% HRmax. Kolory wykorzystują średnie tętno ważone czasem ruchu. Bez tętna nie ma strefy.",
    totalTime: "Łączny czas biegu", aboveTime: "Czas powyżej progu", weeklyKm: "Łączne kilometry",
    partial: "Niepełne dane tętna: liczą się tylko poprawne przedziały. Luki ponad 15 s i tętno powyżej ustawionego HRmax są wykluczone.",
    importing: "Importowanie wszystkich aktywności i próbek…",
  },
  ru: {
    pace: "Темп",
    maxHr: "Максимальная ЧСС (уд/мин)",
    help: "Введите свою ЧССмакс (60–240 уд/мин). Z1 <70%, Z2 70–80%, Z3 80–85%, Z4 85–90%, Z5 90–100%. Выше порога — строго >90% ЧССмакс. Цвета используют среднюю ЧСС, взвешенную по времени движения. Без ЧСС зона не назначается.",
    totalTime: "Общее время бега", aboveTime: "Время выше порога", weeklyKm: "Всего километров",
    partial: "Неполные данные ЧСС: учитываются только корректные интервалы. Пропуски более 15 с и ЧСС выше заданной максимальной исключены.",
    importing: "Импорт всех тренировок и записанных данных…",
  },
  uk: {
    pace: "Темп",
    maxHr: "Максимальна ЧСС (уд/хв)",
    help: "Введіть власну ЧССмакс (60–240 уд/хв). Z1 <70%, Z2 70–80%, Z3 80–85%, Z4 85–90%, Z5 90–100%. Вище порога — строго >90% ЧССмакс. Кольори використовують середню ЧСС, зважену за часом руху. Без ЧСС зона не призначається.",
    totalTime: "Загальний час бігу", aboveTime: "Час вище порога", weeklyKm: "Усього кілометрів",
    partial: "Неповні дані ЧСС: враховуються лише коректні інтервали. Прогалини понад 15 с і ЧСС вище заданого максимуму виключені.",
    importing: "Імпорт усіх тренувань і записаних даних…",
  },
  be: {
    pace: "Тэмп",
    maxHr: "Максімальная ЧСС (уд/хв)",
    help: "Увядзіце сваю ЧССмакс (60–240 уд/хв). Z1 <70%, Z2 70–80%, Z3 80–85%, Z4 85–90%, Z5 90–100%. Вышэй парога — строга >90% ЧССмакс. Колеры выкарыстоўваюць сярэднюю ЧСС, узважаную па часе руху. Без ЧСС зона не прызначаецца.",
    totalTime: "Агульны час бегу", aboveTime: "Час вышэй парога", weeklyKm: "Усяго кіламетраў",
    partial: "Няпоўныя даныя ЧСС: улічваюцца толькі карэктныя інтэрвалы. Прагалы больш за 15 с і ЧСС вышэй зададзенага максімуму выключаны.",
    importing: "Імпарт усіх трэніровак і запісаных даных…",
  },
  it: {
    pace: "Passo",
    maxHr: "Frequenza cardiaca massima (bpm)",
    help: "Inserisci la tua FCmax (60–240 bpm). Z1 <70%, Z2 70–80%, Z3 80–85%, Z4 85–90%, Z5 90–100%. Sopra soglia significa strettamente >90% FCmax. I colori usano la FC media ponderata per il tempo in movimento. Senza FC non viene assegnata una zona.",
    totalTime: "Tempo totale di corsa", aboveTime: "Tempo sopra soglia", weeklyKm: "Chilometri totali",
    partial: "Copertura FC parziale: contano solo gli intervalli validi. Sono esclusi vuoti oltre 15 s e valori superiori alla FCmax impostata.",
    importing: "Importazione di tutte le attività e dei campioni…",
  },
};
