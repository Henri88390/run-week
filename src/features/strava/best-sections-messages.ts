import type { Locale } from "@/features/i18n/locales";

type Messages = {
  title: string;
  signIn: string;
  empty: string;
  half: string;
  marathon: string;
};

export const BEST_SECTIONS_MESSAGES: Record<Locale, Messages> = {
  en: {
    title: "Top performances",
    signIn: "Sign in to view your top performances.",
    empty: "No recorded section long enough for this distance yet.",
    half: "Half marathon",
    marathon: "Marathon",
  },
  fr: {
    title: "Meilleures performances",
    signIn: "Connectez-vous pour voir vos meilleures performances.",
    empty: "Aucune section enregistrée assez longue pour cette distance.",
    half: "Semi-marathon",
    marathon: "Marathon",
  },
  de: {
    title: "Top-Leistungen",
    signIn: "Melde dich an, um deine besten Leistungen zu sehen.",
    empty: "Noch kein ausreichend langer aufgezeichneter Abschnitt.",
    half: "Halbmarathon",
    marathon: "Marathon",
  },
  es: {
    title: "Mejores resultados",
    signIn: "Inicia sesión para ver tus mejores resultados.",
    empty: "Aún no hay un tramo registrado suficientemente largo.",
    half: "Media maratón",
    marathon: "Maratón",
  },
  pt: {
    title: "Melhores desempenhos",
    signIn: "Inicie sessão para ver os seus melhores desempenhos.",
    empty: "Ainda não há um troço registado suficientemente longo.",
    half: "Meia maratona",
    marathon: "Maratona",
  },
  pl: {
    title: "Najlepsze wyniki",
    signIn: "Zaloguj się, aby zobaczyć najlepsze wyniki.",
    empty: "Brak zapisanego odcinka o wystarczającej długości.",
    half: "Półmaraton",
    marathon: "Maraton",
  },
  ru: {
    title: "Лучшие результаты",
    signIn: "Войдите, чтобы увидеть лучшие результаты.",
    empty: "Пока нет записанного отрезка достаточной длины.",
    half: "Полумарафон",
    marathon: "Марафон",
  },
  uk: {
    title: "Найкращі результати",
    signIn: "Увійдіть, щоб переглянути найкращі результати.",
    empty: "Ще немає записаного відрізка достатньої довжини.",
    half: "Півмарафон",
    marathon: "Марафон",
  },
  be: {
    title: "Найлепшыя вынікі",
    signIn: "Увайдзіце, каб убачыць найлепшыя вынікі.",
    empty: "Пакуль няма запісанага адрэзка дастатковай даўжыні.",
    half: "Паўмарафон",
    marathon: "Марафон",
  },
  it: {
    title: "Migliori prestazioni",
    signIn: "Accedi per vedere le tue migliori prestazioni.",
    empty: "Nessun tratto registrato abbastanza lungo per questa distanza.",
    half: "Mezza maratona",
    marathon: "Maratona",
  },
};
