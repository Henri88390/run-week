import type { Locale } from "@/features/i18n/locales";

export const METRIC_DEFINITIONS: Record<Locale, { speed: string; endurance: string; speedEndurance: string }> = {
  en: {
    speed: "Ability to run fast over a short effort. It depends on muscular power, coordination and running technique.",
    endurance: "Ability to sustain an effort for a long time, mainly through aerobic energy production.",
    speedEndurance: "Ability to sustain a high running speed despite accumulating fatigue. It combines speed and endurance.",
  },
  fr: {
    speed: "Capacité à courir vite sur un effort court. Elle dépend notamment de la puissance musculaire, de la coordination et de la technique de course.",
    endurance: "Capacité à maintenir un effort dans la durée, principalement grâce à la production d’énergie aérobie.",
    speedEndurance: "Capacité à maintenir une vitesse de course élevée malgré l’accumulation de fatigue. Elle combine vitesse et endurance.",
  },
  de: {
    speed: "Fähigkeit, bei kurzer Belastung schnell zu laufen. Sie hängt unter anderem von Muskelkraft, Koordination und Lauftechnik ab.",
    endurance: "Fähigkeit, eine Belastung lange aufrechtzuerhalten, vorwiegend durch aerobe Energiebereitstellung.",
    speedEndurance: "Fähigkeit, trotz zunehmender Ermüdung eine hohe Laufgeschwindigkeit aufrechtzuerhalten. Sie verbindet Schnelligkeit und Ausdauer.",
  },
  es: {
    speed: "Capacidad de correr rápido durante un esfuerzo corto. Depende de la potencia muscular, la coordinación y la técnica de carrera.",
    endurance: "Capacidad de mantener un esfuerzo prolongado, principalmente mediante la producción de energía aeróbica.",
    speedEndurance: "Capacidad de mantener una velocidad de carrera alta pese a la fatiga acumulada. Combina velocidad y resistencia.",
  },
  pt: {
    speed: "Capacidade de correr depressa num esforço curto. Depende da potência muscular, da coordenação e da técnica de corrida.",
    endurance: "Capacidade de manter um esforço prolongado, principalmente através da produção de energia aeróbia.",
    speedEndurance: "Capacidade de manter uma velocidade de corrida elevada apesar da fadiga acumulada. Combina velocidade e resistência.",
  },
  pl: {
    speed: "Zdolność do szybkiego biegu podczas krótkiego wysiłku. Zależy od mocy mięśni, koordynacji i techniki biegu.",
    endurance: "Zdolność do długotrwałego utrzymywania wysiłku, głównie dzięki tlenowemu wytwarzaniu energii.",
    speedEndurance: "Zdolność do utrzymywania dużej prędkości biegu mimo narastającego zmęczenia. Łączy szybkość i wytrzymałość.",
  },
  ru: {
    speed: "Способность быстро бежать при коротком усилии. Зависит от мышечной мощности, координации и техники бега.",
    endurance: "Способность длительно поддерживать усилие, преимущественно за счёт аэробного производства энергии.",
    speedEndurance: "Способность поддерживать высокую скорость бега несмотря на нарастающую усталость. Сочетает скорость и выносливость.",
  },
  uk: {
    speed: "Здатність швидко бігти під час короткого зусилля. Залежить від м’язової потужності, координації та техніки бігу.",
    endurance: "Здатність тривало підтримувати зусилля, переважно завдяки аеробному виробленню енергії.",
    speedEndurance: "Здатність підтримувати високу швидкість бігу попри накопичення втоми. Поєднує швидкість і витривалість.",
  },
  be: {
    speed: "Здольнасць хутка бегчы падчас кароткага намагання. Залежыць ад мышачнай магутнасці, каардынацыі і тэхнікі бегу.",
    endurance: "Здольнасць доўга падтрымліваць намаганне, пераважна дзякуючы аэробнай вытворчасці энергіі.",
    speedEndurance: "Здольнасць падтрымліваць высокую хуткасць бегу нягледзячы на назапашванне стомы. Спалучае хуткасць і вынослівасць.",
  },
  it: {
    speed: "Capacità di correre velocemente durante uno sforzo breve. Dipende dalla potenza muscolare, dalla coordinazione e dalla tecnica di corsa.",
    endurance: "Capacità di sostenere uno sforzo a lungo, principalmente attraverso la produzione aerobica di energia.",
    speedEndurance: "Capacità di mantenere una velocità di corsa elevata nonostante la fatica crescente. Combina velocità e resistenza.",
  },
};
