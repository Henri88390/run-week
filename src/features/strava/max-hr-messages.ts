import type { Locale } from "@/features/i18n/locales";

type MaxHrText = {
  short: string; custom: string; preset: string; edit: string; editLabel: string; save: string; cancel: string;
  reset: (bpm: string) => string; invalid: string; failed: string; saved: string; restored: string; hint: string;
};

export const MAX_HR_MESSAGES: Record<Locale, MaxHrText> = {
  en: {
    short: "HRmax", custom: "Custom", preset: "Default", edit: "Edit", editLabel: "Edit maximum heart rate",
    save: "Save", cancel: "Cancel", reset: (bpm) => `Reset to default (${bpm} bpm)`,
    invalid: "Enter a whole number between 60 and 240.",
    failed: "Could not save the maximum heart rate. Try again.",
    saved: "Maximum heart rate saved. Zones were updated.", restored: "Default maximum heart rate restored.",
    hint: "Used for the heart-rate zones of all your activities.",
  },
  fr: {
    short: "FCmax", custom: "Personnalisée", preset: "Par défaut", edit: "Modifier", editLabel: "Modifier la fréquence cardiaque maximale",
    save: "Enregistrer", cancel: "Annuler", reset: (bpm) => `Rétablir la valeur par défaut (${bpm} bpm)`,
    invalid: "Saisissez un nombre entier entre 60 et 240.",
    failed: "Impossible d’enregistrer la fréquence cardiaque maximale. Réessayez.",
    saved: "Fréquence cardiaque maximale enregistrée. Les zones ont été mises à jour.", restored: "Fréquence cardiaque maximale par défaut rétablie.",
    hint: "Utilisée pour les zones cardiaques de toutes vos activités.",
  },
  de: {
    short: "HFmax", custom: "Eigene", preset: "Standard", edit: "Bearbeiten", editLabel: "Maximale Herzfrequenz bearbeiten",
    save: "Speichern", cancel: "Abbrechen", reset: (bpm) => `Auf Standard zurücksetzen (${bpm} bpm)`,
    invalid: "Gib eine ganze Zahl zwischen 60 und 240 ein.",
    failed: "Die maximale Herzfrequenz konnte nicht gespeichert werden. Bitte erneut versuchen.",
    saved: "Maximale Herzfrequenz gespeichert. Die Zonen wurden aktualisiert.", restored: "Standardwert der maximalen Herzfrequenz wiederhergestellt.",
    hint: "Wird für die Herzfrequenzzonen aller Aktivitäten verwendet.",
  },
  es: {
    short: "FCmáx", custom: "Personalizada", preset: "Predeterminada", edit: "Editar", editLabel: "Editar la frecuencia cardíaca máxima",
    save: "Guardar", cancel: "Cancelar", reset: (bpm) => `Restablecer el valor predeterminado (${bpm} bpm)`,
    invalid: "Introduce un número entero entre 60 y 240.",
    failed: "No se pudo guardar la frecuencia cardíaca máxima. Inténtalo de nuevo.",
    saved: "Frecuencia cardíaca máxima guardada. Las zonas se han actualizado.", restored: "Frecuencia cardíaca máxima predeterminada restablecida.",
    hint: "Se usa para las zonas cardíacas de todas tus actividades.",
  },
  pt: {
    short: "FCmáx", custom: "Personalizada", preset: "Predefinida", edit: "Editar", editLabel: "Editar a frequência cardíaca máxima",
    save: "Guardar", cancel: "Cancelar", reset: (bpm) => `Repor o valor predefinido (${bpm} bpm)`,
    invalid: "Introduza um número inteiro entre 60 e 240.",
    failed: "Não foi possível guardar a frequência cardíaca máxima. Tente novamente.",
    saved: "Frequência cardíaca máxima guardada. As zonas foram atualizadas.", restored: "Frequência cardíaca máxima predefinida reposta.",
    hint: "Usada nas zonas cardíacas de todas as suas atividades.",
  },
  pl: {
    short: "HRmax", custom: "Własne", preset: "Domyślne", edit: "Edytuj", editLabel: "Edytuj tętno maksymalne",
    save: "Zapisz", cancel: "Anuluj", reset: (bpm) => `Przywróć domyślne (${bpm} bpm)`,
    invalid: "Podaj liczbę całkowitą od 60 do 240.",
    failed: "Nie udało się zapisać tętna maksymalnego. Spróbuj ponownie.",
    saved: "Zapisano tętno maksymalne. Strefy zostały zaktualizowane.", restored: "Przywrócono domyślne tętno maksymalne.",
    hint: "Używane do stref tętna we wszystkich aktywnościach.",
  },
  ru: {
    short: "ЧССмакс", custom: "Своя", preset: "По умолчанию", edit: "Изменить", editLabel: "Изменить максимальную ЧСС",
    save: "Сохранить", cancel: "Отмена", reset: (bpm) => `Вернуть значение по умолчанию (${bpm} уд/мин)`,
    invalid: "Введите целое число от 60 до 240.",
    failed: "Не удалось сохранить максимальную ЧСС. Попробуйте ещё раз.",
    saved: "Максимальная ЧСС сохранена. Зоны обновлены.", restored: "Восстановлена максимальная ЧСС по умолчанию.",
    hint: "Используется для пульсовых зон всех тренировок.",
  },
  uk: {
    short: "ЧССмакс", custom: "Власна", preset: "Типова", edit: "Змінити", editLabel: "Змінити максимальну ЧСС",
    save: "Зберегти", cancel: "Скасувати", reset: (bpm) => `Відновити типове значення (${bpm} уд/хв)`,
    invalid: "Введіть ціле число від 60 до 240.",
    failed: "Не вдалося зберегти максимальну ЧСС. Спробуйте ще раз.",
    saved: "Максимальну ЧСС збережено. Зони оновлено.", restored: "Відновлено типову максимальну ЧСС.",
    hint: "Використовується для пульсових зон усіх тренувань.",
  },
  be: {
    short: "ЧССмакс", custom: "Уласная", preset: "Тыповая", edit: "Змяніць", editLabel: "Змяніць максімальную ЧСС",
    save: "Захаваць", cancel: "Скасаваць", reset: (bpm) => `Аднавіць тыповае значэнне (${bpm} уд/хв)`,
    invalid: "Увядзіце цэлы лік ад 60 да 240.",
    failed: "Не ўдалося захаваць максімальную ЧСС. Паспрабуйце яшчэ раз.",
    saved: "Максімальная ЧСС захавана. Зоны абноўлены.", restored: "Адноўлена тыповая максімальная ЧСС.",
    hint: "Выкарыстоўваецца для пульсавых зон усіх трэніровак.",
  },
  it: {
    short: "FCmax", custom: "Personalizzata", preset: "Predefinita", edit: "Modifica", editLabel: "Modifica la frequenza cardiaca massima",
    save: "Salva", cancel: "Annulla", reset: (bpm) => `Ripristina il valore predefinito (${bpm} bpm)`,
    invalid: "Inserisci un numero intero tra 60 e 240.",
    failed: "Impossibile salvare la frequenza cardiaca massima. Riprova.",
    saved: "Frequenza cardiaca massima salvata. Le zone sono state aggiornate.", restored: "Frequenza cardiaca massima predefinita ripristinata.",
    hint: "Usata per le zone cardiache di tutte le tue attività.",
  },
};
