import type { Locale } from "@/features/i18n/locales";

type IndicatorText = { estimate: string; speed: string; endurance: string; speedEndurance: string; missing: string };
export const INDICATOR_MESSAGES: Record<Locale, IndicatorText> = {
  en: {
    estimate: "Descriptive estimate",
    speed: "Fastest average speed among marked maximal efforts, using elapsed time including stops. Not sprint speed or VMA; depends on the efforts you mark.",
    endurance: "Longest imported run by moving time in the last 12 weeks, including today. Shows demonstrated duration and distance, not your maximum endurance capacity.",
    speedEndurance: "Critical speed / fastest marked-effort speed × 100. Describes speed retention across these efforts, not a standardized fitness score. Depends on their durations and dates.",
    missing: "Requires a reliable critical-speed fit and a marked maximal effort. No value is inferred when those conditions are not met.",
  },
  fr: {
    estimate: "Estimation descriptive",
    speed: "Meilleure vitesse moyenne parmi les efforts maximaux marqués, calculée sur le temps écoulé, arrêts inclus. Ce n’est ni la vitesse de sprint ni la VMA ; elle dépend des efforts sélectionnés.",
    endurance: "Plus longue sortie importée en temps de mouvement sur les 12 dernières semaines, aujourd’hui inclus. Indique une durée et une distance réalisées, pas votre capacité maximale d’endurance.",
    speedEndurance: "Vitesse critique / vitesse du meilleur effort maximal × 100. Décrit le maintien de vitesse entre ces efforts, pas un score de forme standardisé. Dépend de leurs durées et de leurs dates.",
    missing: "Nécessite un ajustement fiable de la vitesse critique et un effort maximal marqué. Aucune valeur n’est déduite si ces conditions ne sont pas remplies.",
  },
  de: {
    estimate: "Beschreibende Schätzung",
    speed: "Höchste Durchschnittsgeschwindigkeit markierter maximaler Leistungen, mit verstrichener Zeit einschließlich Pausen. Keine Sprintgeschwindigkeit oder VMA; hängt von den markierten Leistungen ab.",
    endurance: "Längster importierter Lauf nach Bewegungszeit in den letzten 12 Wochen einschließlich heute. Zeigt erreichte Dauer und Strecke, nicht die maximale Ausdauerfähigkeit.",
    speedEndurance: "Kritische Geschwindigkeit / schnellste markierte Leistung × 100. Beschreibt den Geschwindigkeitserhalt, keinen standardisierten Fitnesswert. Hängt von Dauer und Datum der Leistungen ab.",
    missing: "Erfordert eine zuverlässige Anpassung der kritischen Geschwindigkeit und eine markierte maximale Leistung. Andernfalls wird kein Wert geschätzt.",
  },
  es: {
    estimate: "Estimación descriptiva",
    speed: "Mayor velocidad media de los esfuerzos máximos marcados, con tiempo transcurrido y paradas. No es velocidad de esprint ni VMA; depende de los esfuerzos seleccionados.",
    endurance: "Carrera importada más larga por tiempo en movimiento en las últimas 12 semanas, incluido hoy. Muestra duración y distancia realizadas, no la capacidad máxima de resistencia.",
    speedEndurance: "Velocidad crítica / velocidad del mejor esfuerzo marcado × 100. Describe el mantenimiento de velocidad, no una puntuación física estándar. Depende de la duración y fecha de los esfuerzos.",
    missing: "Requiere un ajuste fiable de velocidad crítica y un esfuerzo máximo marcado. Sin esas condiciones no se estima ningún valor.",
  },
  pt: {
    estimate: "Estimativa descritiva",
    speed: "Maior velocidade média dos esforços máximos marcados, com tempo decorrido e paragens. Não é velocidade de sprint nem VMA; depende dos esforços selecionados.",
    endurance: "Corrida importada mais longa por tempo em movimento nas últimas 12 semanas, incluindo hoje. Mostra duração e distância realizadas, não a capacidade máxima de resistência.",
    speedEndurance: "Velocidade crítica / velocidade do melhor esforço marcado × 100. Descreve a manutenção de velocidade, não uma pontuação física padrão. Depende das durações e datas dos esforços.",
    missing: "Requer um ajuste fiável da velocidade crítica e um esforço máximo marcado. Sem essas condições não se estima um valor.",
  },
  pl: {
    estimate: "Oszacowanie opisowe",
    speed: "Najwyższa średnia prędkość oznaczonych wysiłków maksymalnych, z czasem postojów. To nie prędkość sprintu ani VMA; zależy od wybranych wysiłków.",
    endurance: "Najdłuższy zaimportowany bieg według czasu ruchu z ostatnich 12 tygodni, łącznie z dzisiaj. Pokazuje osiągnięty czas i dystans, nie maksymalną wytrzymałość.",
    speedEndurance: "Prędkość krytyczna / prędkość najlepszego oznaczonego wysiłku × 100. Opisuje utrzymanie prędkości, nie standardową ocenę formy. Zależy od czasu trwania i dat wysiłków.",
    missing: "Wymaga wiarygodnego modelu prędkości krytycznej i oznaczonego wysiłku maksymalnego. Bez nich wartość nie jest szacowana.",
  },
  ru: {
    estimate: "Описательная оценка",
    speed: "Наибольшая средняя скорость отмеченных максимальных усилий, по времени с остановками. Это не скорость спринта и не VMA; зависит от выбранных усилий.",
    endurance: "Самая длительная импортированная пробежка по времени движения за последние 12 недель, включая сегодня. Показывает достигнутые время и расстояние, не предел выносливости.",
    speedEndurance: "Критическая скорость / скорость лучшего отмеченного усилия × 100. Описывает сохранение скорости, не стандартную оценку формы. Зависит от длительности и дат усилий.",
    missing: "Нужны надёжная модель критической скорости и отмеченное максимальное усилие. Иначе значение не оценивается.",
  },
  uk: {
    estimate: "Описова оцінка",
    speed: "Найвища середня швидкість позначених максимальних зусиль, за часом із зупинками. Це не швидкість спринту й не VMA; залежить від вибраних зусиль.",
    endurance: "Найтриваліша імпортована пробіжка за часом руху за останні 12 тижнів, включно із сьогодні. Показує досягнуті час і відстань, не межу витривалості.",
    speedEndurance: "Критична швидкість / швидкість найкращого позначеного зусилля × 100. Описує збереження швидкості, не стандартну оцінку форми. Залежить від тривалості та дат зусиль.",
    missing: "Потрібні надійна модель критичної швидкості та позначене максимальне зусилля. Інакше значення не оцінюється.",
  },
  be: {
    estimate: "Апісальная ацэнка",
    speed: "Найвышэйшая сярэдняя хуткасць пазначаных максімальных намаганняў, паводле часу з прыпынкамі. Гэта не хуткасць спрынту і не VMA; залежыць ад выбраных намаганняў.",
    endurance: "Найдаўжэйшая імпартаваная прабежка паводле часу руху за апошнія 12 тыдняў, уключаючы сёння. Паказвае дасягнутыя час і адлегласць, не мяжу вынослівасці.",
    speedEndurance: "Крытычная хуткасць / хуткасць найлепшага пазначанага намагання × 100. Апісвае захаванне хуткасці, не стандартную ацэнку формы. Залежыць ад працягласці і дат намаганняў.",
    missing: "Патрэбныя надзейная мадэль крытычнай хуткасці і пазначанае максімальнае намаганне. Інакш значэнне не ацэньваецца.",
  },
  it: {
    estimate: "Stima descrittiva",
    speed: "Velocità media più alta degli sforzi massimali contrassegnati, con tempo trascorso e soste. Non è velocità di sprint né VMA; dipende dagli sforzi selezionati.",
    endurance: "Corsa importata più lunga per tempo in movimento nelle ultime 12 settimane, oggi incluso. Mostra durata e distanza raggiunte, non la capacità massima di resistenza.",
    speedEndurance: "Velocità critica / velocità del miglior sforzo contrassegnato × 100. Descrive il mantenimento della velocità, non un punteggio fisico standard. Dipende da durata e data degli sforzi.",
    missing: "Richiede un modello affidabile della velocità critica e uno sforzo massimale contrassegnato. Altrimenti non viene stimato alcun valore.",
  },
};
