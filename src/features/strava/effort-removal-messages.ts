import type { Locale } from "@/features/i18n/locales";

export const EFFORT_REMOVAL_MESSAGES: Record<Locale, { title: string; body: string }> = {
  en: { title: "Remove maximal-effort mark", body: "This activity will no longer be used as a maximal effort in running metrics. The activity stays in your calendar and on Strava." },
  fr: { title: "Retirer le marquage d’effort maximal", body: "Cette activité ne sera plus utilisée comme effort maximal dans les indicateurs de course. Elle reste dans votre calendrier et sur Strava." },
  de: { title: "Markierung als maximale Belastung entfernen", body: "Diese Aktivität wird nicht mehr als maximale Belastung für Laufkennzahlen verwendet. Sie bleibt im Kalender und auf Strava." },
  es: { title: "Quitar la marca de esfuerzo máximo", body: "Esta actividad dejará de usarse como esfuerzo máximo en las métricas de carrera. Permanecerá en tu calendario y en Strava." },
  pt: { title: "Remover a marca de esforço máximo", body: "Esta atividade deixa de ser usada como esforço máximo nos indicadores de corrida. Permanece no calendário e no Strava." },
  it: { title: "Rimuovi il contrassegno di sforzo massimale", body: "Questa attività non sarà più usata come sforzo massimale nelle metriche di corsa. Resta nel calendario e su Strava." },
  pl: { title: "Usuń oznaczenie maksymalnego wysiłku", body: "Ta aktywność nie będzie już używana jako maksymalny wysiłek we wskaźnikach biegu. Pozostanie w kalendarzu i na Strava." },
  ru: { title: "Снять отметку максимального усилия", body: "Эта активность больше не будет использоваться как максимальное усилие в беговых показателях. Она останется в календаре и Strava." },
  uk: { title: "Зняти позначку максимального зусилля", body: "Ця активність більше не використовуватиметься як максимальне зусилля в бігових показниках. Вона залишиться в календарі та Strava." },
  be: { title: "Зняць пазнаку максімальнага намагання", body: "Гэта актыўнасць больш не будзе выкарыстоўвацца як максімальнае намаганне ў бегавых паказчыках. Яна застанецца ў календары і Strava." },
};
