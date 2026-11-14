import type { Locale } from "@/features/i18n/locales";

type ChartMessages = { help: string; zones: string };
export const ACTIVITY_CHART_MESSAGES: Record<Locale, ChartMessages> = {
  en: { help: "Hover or tap a chart to inspect all measurements. Keyboard: ← / →, Home / End; Escape clears the cursor. Cursor selection stays in memory only.", zones: "Zone shading uses the fixed reference HRmax of 190 bpm, not your personal zones." },
  fr: { help: "Survolez ou touchez un graphique pour examiner toutes les mesures. Clavier : ← / →, Début / Fin ; Échap efface le curseur. La sélection du curseur reste uniquement en mémoire.", zones: "Les zones utilisent une FCmax de référence fixe de 190 bpm, pas vos zones personnelles." },
  de: { help: "Mit Maus oder Antippen alle Messwerte ansehen. Tastatur: ← / →, Pos1 / Ende; Esc löscht den Cursor. Die Cursor-Auswahl bleibt nur im Arbeitsspeicher.", zones: "Die Zonen basieren auf dem festen Referenz-HFmax von 190 bpm, nicht auf persönlichen Zonen." },
  es: { help: "Pasa el cursor o toca un gráfico para ver todas las medidas. Teclado: ← / →, Inicio / Fin; Escape borra el cursor. La selección del cursor solo permanece en memoria.", zones: "Las zonas usan una FCmáx de referencia fija de 190 bpm, no tus zonas personales." },
  pt: { help: "Passe o cursor ou toque num gráfico para ver todas as medidas. Teclado: ← / →, Início / Fim; Escape limpa o cursor. A seleção do cursor fica apenas na memória.", zones: "As zonas usam uma FCmáx de referência fixa de 190 bpm, não as suas zonas pessoais." },
  pl: { help: "Najedź lub dotknij wykresu, aby zobaczyć wszystkie pomiary. Klawiatura: ← / →, Home / End; Escape usuwa kursor. Wybór kursora pozostaje tylko w pamięci.", zones: "Strefy używają stałego referencyjnego HRmax 190 bpm, nie Twoich osobistych stref." },
  ru: { help: "Наведите курсор или коснитесь графика для просмотра всех измерений. Клавиатура: ← / →, Home / End; Escape убирает курсор. Выбор положения курсора хранится только в памяти.", zones: "Зоны основаны на фиксированном эталонном HRmax 190 bpm, а не на ваших личных зонах." },
  uk: { help: "Наведіть курсор або торкніться графіка для перегляду всіх вимірів. Клавіатура: ← / →, Home / End; Escape прибирає курсор. Вибір положення курсора зберігається лише в пам’яті.", zones: "Зони базуються на фіксованій еталонній ЧССмакс 190 bpm, а не на ваших особистих зонах." },
  be: { help: "Навядзіце курсор або дакраніцеся да графіка для прагляду ўсіх вымярэнняў. Клавіятура: ← / →, Home / End; Escape прыбірае курсор. Выбар становішча курсора захоўваецца толькі ў памяці.", zones: "Зоны заснаваныя на фіксаваным эталонным HRmax 190 bpm, а не на вашых асабістых зонах." },
  it: { help: "Passa il cursore o tocca un grafico per vedere tutte le misure. Tastiera: ← / →, Home / End; Escape cancella il cursore. La selezione del cursore resta solo in memoria.", zones: "Le zone usano una FCmax di riferimento fissa di 190 bpm, non le tue zone personali." },
};
