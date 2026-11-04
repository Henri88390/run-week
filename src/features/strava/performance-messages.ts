import type { Locale } from "@/features/i18n/locales";

export const PERFORMANCE_MESSAGES: Record<Locale, { efforts: string; empty: string; title: string; warning: string; scope: string; help: string }> = {
  en: {
    efforts: "Maximal efforts", empty: "No activities marked as maximal effort.", title: "Provisional performance",
    warning: "Low confidence: no reliable multi-effort fit. These values describe the fastest marked effort, not critical speed. D′ and fit quality are unavailable.",
    scope: "Uses maximal efforts from all imported dates. Average speed and race-equivalent VDOT use elapsed time, including stops.",
    help: "Marks an all-out race or test for performance estimates (average speed and race-equivalent VDOT). At least 3 distinct efforts of 2–120 minutes are needed for a reliable critical-speed and D′ fit. One or two efforts give provisional values only. Does not change HR zones or the planner.",
  },
  fr: {
    efforts: "Efforts maximaux", empty: "Aucune activité marquée comme effort maximal.", title: "Performance provisoire",
    warning: "Faible fiabilité : aucun ajustement multi-efforts fiable. Ces valeurs décrivent l’effort marqué le plus rapide, pas la vitesse critique. D′ et la qualité d’ajustement sont indisponibles.",
    scope: "Utilise les efforts maximaux de toutes les dates importées. Vitesse moyenne et VDOT équivalent course utilisent le temps écoulé, arrêts inclus.",
    help: "Marque une course ou un test à fond pour estimer la performance (vitesse moyenne et VDOT équivalent course). Au moins 3 efforts de durées distinctes de 2 à 120 minutes sont nécessaires pour ajuster la vitesse critique et D′. Un ou deux efforts donnent des valeurs provisoires. Ne modifie ni les zones FC ni le programme.",
  },
  de: {
    efforts: "Maximale Leistungen", empty: "Keine Aktivität als maximale Leistung markiert.", title: "Vorläufige Leistung",
    warning: "Geringe Zuverlässigkeit: keine zuverlässige Mehrfachanpassung. Die Werte beschreiben die schnellste markierte Leistung, nicht die kritische Geschwindigkeit. D′ und Anpassungsgüte sind nicht verfügbar.",
    scope: "Nutzt maximale Leistungen aller importierten Daten. Durchschnittsgeschwindigkeit und Wettkampf-VDOT verwenden die verstrichene Zeit einschließlich Pausen.",
    help: "Markiert einen maximalen Wettkampf oder Test für Leistungsschätzungen (Durchschnittsgeschwindigkeit und Wettkampf-VDOT). Mindestens 3 verschiedene Dauern von 2–120 Minuten sind für kritische Geschwindigkeit und D′ nötig. Ein oder zwei Leistungen liefern nur vorläufige Werte. Ändert weder HF-Zonen noch Trainingsplan.",
  },
  es: {
    efforts: "Esfuerzos máximos", empty: "No hay actividades marcadas como esfuerzo máximo.", title: "Rendimiento provisional",
    warning: "Baja confianza: sin ajuste fiable de varios esfuerzos. Los valores describen el esfuerzo marcado más rápido, no la velocidad crítica. D′ y la calidad del ajuste no están disponibles.",
    scope: "Usa esfuerzos máximos de todas las fechas importadas. La velocidad media y el VDOT equivalente usan tiempo transcurrido, incluidas las paradas.",
    help: "Marca una carrera o prueba al máximo para estimar rendimiento (velocidad media y VDOT equivalente). Se requieren al menos 3 esfuerzos de distinta duración de 2–120 minutos para velocidad crítica y D′. Uno o dos dan valores provisionales. No cambia zonas cardíacas ni el plan.",
  },
  pt: {
    efforts: "Esforços máximos", empty: "Nenhuma atividade marcada como esforço máximo.", title: "Desempenho provisório",
    warning: "Baixa confiança: sem ajuste fiável de vários esforços. Os valores descrevem o esforço marcado mais rápido, não a velocidade crítica. D′ e a qualidade do ajuste estão indisponíveis.",
    scope: "Usa esforços máximos de todas as datas importadas. A velocidade média e o VDOT equivalente usam tempo decorrido, incluindo paragens.",
    help: "Marca uma prova ou teste ao máximo para estimar desempenho (velocidade média e VDOT equivalente). São necessários pelo menos 3 esforços de durações diferentes de 2–120 minutos para velocidade crítica e D′. Um ou dois dão valores provisórios. Não altera zonas cardíacas nem o plano.",
  },
  pl: {
    efforts: "Wysiłki maksymalne", empty: "Brak aktywności oznaczonych jako wysiłek maksymalny.", title: "Wstępna ocena wydolności",
    warning: "Niska wiarygodność: brak wiarygodnego modelu wielu wysiłków. Wartości opisują najszybszy oznaczony wysiłek, nie prędkość krytyczną. D′ i jakość dopasowania są niedostępne.",
    scope: "Uwzględnia wysiłki maksymalne ze wszystkich zaimportowanych dat. Średnia prędkość i równoważny VDOT używają czasu z postojami.",
    help: "Oznacza zawody lub test na maksimum do oceny wydolności (średnia prędkość i równoważny VDOT). Prędkość krytyczna i D′ wymagają co najmniej 3 wysiłków różnej długości, 2–120 minut. Jeden lub dwa dają wartości wstępne. Nie zmienia stref tętna ani planu.",
  },
  ru: {
    efforts: "Максимальные усилия", empty: "Нет активностей с отметкой максимального усилия.", title: "Предварительная оценка",
    warning: "Низкая достоверность: нет надёжной модели нескольких усилий. Значения описывают самое быстрое отмеченное усилие, не критическую скорость. D′ и качество регрессии недоступны.",
    scope: "Учитывает максимальные усилия за все импортированные даты. Средняя скорость и эквивалентный VDOT используют время с остановками.",
    help: "Отмечает гонку или тест на пределе для оценки средней скорости и эквивалентного VDOT. Для критической скорости и D′ нужны минимум 3 усилия разной длительности, 2–120 минут. Одно или два дают предварительные значения. Не меняет зоны пульса или план.",
  },
  uk: {
    efforts: "Максимальні зусилля", empty: "Немає активностей із позначкою максимального зусилля.", title: "Попередня оцінка",
    warning: "Низька достовірність: немає надійної моделі кількох зусиль. Значення описують найшвидше позначене зусилля, не критичну швидкість. D′ та якість регресії недоступні.",
    scope: "Враховує максимальні зусилля за всі імпортовані дати. Середня швидкість та еквівалентний VDOT використовують час із зупинками.",
    help: "Позначає перегони або тест на максимумі для оцінки середньої швидкості та еквівалентного VDOT. Для критичної швидкості та D′ потрібні щонайменше 3 зусилля різної тривалості, 2–120 хвилин. Одне або два дають попередні значення. Не змінює зони пульсу чи план.",
  },
  be: {
    efforts: "Максімальныя намаганні", empty: "Няма актыўнасцей з пазнакай максімальнага намагання.", title: "Папярэдняя ацэнка",
    warning: "Нізкая дакладнасць: няма надзейнай мадэлі некалькіх намаганняў. Значэнні апісваюць самае хуткае пазначанае намаганне, не крытычную хуткасць. D′ і якасць рэгрэсіі недаступныя.",
    scope: "Улічвае максімальныя намаганні за ўсе імпартаваныя даты. Сярэдняя хуткасць і эквівалентны VDOT выкарыстоўваюць час з прыпынкамі.",
    help: "Пазначае гонку або тэст на максімуме для ацэнкі сярэдняй хуткасці і эквівалентнага VDOT. Для крытычнай хуткасці і D′ патрэбны мінімум 3 намаганні рознай працягласці, 2–120 хвілін. Адно або два даюць папярэднія значэнні. Не змяняе зоны пульсу ці план.",
  },
  it: {
    efforts: "Sforzi massimali", empty: "Nessuna attività segnata come sforzo massimale.", title: "Prestazione provvisoria",
    warning: "Bassa affidabilità: nessun modello affidabile su più sforzi. I valori descrivono lo sforzo segnato più veloce, non la velocità critica. D′ e qualità della regressione non sono disponibili.",
    scope: "Usa gli sforzi massimali di tutte le date importate. Velocità media e VDOT equivalente usano il tempo trascorso, soste incluse.",
    help: "Segna una gara o un test al massimo per stimare velocità media e VDOT equivalente. Velocità critica e D′ richiedono almeno 3 sforzi di durate diverse, 2–120 minuti. Uno o due danno valori provvisori. Non modifica zone cardiache o piano.",
  },
};
