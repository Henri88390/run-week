import type { Locale } from "@/features/i18n/locales";

type NativeStrings = {
  editWorkout: string;
  duration: string;
  intensity: string;
  increase: string;
  decrease: string;
  normal: string;
  equivalents: string;
  regenerate: string;
  editSetup: string;
  deletePlanner: string;
  deletePlannerConfirm: string;
  plannerConflict: string;
  useAccountPlanner: string;
  useLocalPlanner: string;
  privacy: string;
  exportData: string;
  deleteLocal: string;
  deleteAccount: string;
  exportOk: string;
  exportFailed: string;
  deleteLocalConfirm: string;
  deleteAccountConfirm: string;
  deleteLocalOk: string;
  deleteAccountOk: string;
  cancelled: string;
  copyOk: string;
  copyFailed: string;
  fitExportFailed: string;
  signedOut: string;
  consent: string;
  neverIncludeTokens: string;
  exportedAt: string;
  accountData: string;
  sessionExpired: string;
  sessionCheckFailed: string;
  secureStorageFailed: string;
};

export const NATIVE_STRINGS: Record<Locale, NativeStrings> = {
  en: {
    editWorkout: "Edit workout", duration: "Duration (minutes)", intensity: "Intensity", increase: "Harder", decrease: "Easier", normal: "Default",
    equivalents: "Equivalent performances", regenerate: "Regenerate week", deletePlanner: "Delete planner", privacy: "Privacy and data controls",
    editSetup: "Edit setup",
    deletePlannerConfirm: "Delete the saved planner? This cannot be undone.",
    plannerConflict: "A planner is saved on this device and another is saved in your account. Choose which one to use; neither copy will be overwritten without your choice.",
    useAccountPlanner: "Use account planner", useLocalPlanner: "Use this device's planner",
    exportData: "Export data", deleteLocal: "Delete local data", deleteAccount: "Delete account",
    exportOk: "Your data export is ready to share. Garmin tokens are excluded.", exportFailed: "Could not export your data. Try again.",
    deleteLocalConfirm: "Delete this device's saved planner and language choice?",
    deleteAccountConfirm: "Permanently delete your account and its planner? Garmin workouts already in Garmin Connect are not removed. Data saved on this device is unaffected.",
    deleteLocalOk: "Local planner and language choice deleted.", deleteAccountOk: "Account deleted.",
    cancelled: "Sign-in or Garmin connection was cancelled.", copyOk: "Week copied.", copyFailed: "Could not copy the week.",
    signedOut: "Signed out", consent: "Continue in your browser to review Garmin consent.",
    fitExportFailed: "Could not create or share the FIT workout.",
    neverIncludeTokens: "Garmin tokens are never included.", exportedAt: "Exported",
    accountData: "Account and planner",
    sessionExpired: "Your sign-in expired. Sign in again.", sessionCheckFailed: "Could not verify your saved sign-in. Check your connection.",
    secureStorageFailed: "Secure sign-in storage is unavailable.",
  },
  fr: {
    editWorkout: "Modifier la sortie", duration: "Durée (minutes)", intensity: "Intensité", increase: "Plus difficile", decrease: "Plus facile", normal: "Par défaut",
    equivalents: "Performances équivalentes", regenerate: "Régénérer la semaine", deletePlanner: "Supprimer le planning", privacy: "Confidentialité et données",
    editSetup: "Modifier les paramètres",
    deletePlannerConfirm: "Supprimer le planning enregistré ? Cette action est irréversible.",
    plannerConflict: "Un planning est enregistré sur cet appareil et un autre dans votre compte. Choisissez lequel utiliser ; aucun ne sera écrasé sans votre choix.",
    useAccountPlanner: "Utiliser le planning du compte", useLocalPlanner: "Utiliser le planning de cet appareil",
    exportData: "Exporter les données", deleteLocal: "Supprimer les données locales", deleteAccount: "Supprimer le compte",
    exportOk: "Votre export est prêt à être partagé. Les jetons Garmin sont exclus.", exportFailed: "Impossible d’exporter les données. Réessayez.",
    deleteLocalConfirm: "Supprimer le planning et la langue enregistrés sur cet appareil ?",
    deleteAccountConfirm: "Supprimer définitivement votre compte et son planning ? Les séances déjà dans Garmin Connect ne seront pas supprimées. Les données enregistrées sur cet appareil ne sont pas concernées.",
    deleteLocalOk: "Planning local et langue supprimés.", deleteAccountOk: "Compte supprimé.",
    cancelled: "La connexion ou l’association Garmin a été annulée.", copyOk: "Semaine copiée.", copyFailed: "Impossible de copier la semaine.",
    signedOut: "Déconnecté", consent: "Continuez dans votre navigateur pour examiner le consentement Garmin.",
    fitExportFailed: "Impossible de créer ou partager l’entraînement FIT.",
    neverIncludeTokens: "Les jetons Garmin ne sont jamais inclus.", exportedAt: "Exporté",
    accountData: "Compte et planning",
    sessionExpired: "Votre connexion a expiré. Reconnectez-vous.", sessionCheckFailed: "Impossible de vérifier votre connexion enregistrée. Vérifiez votre connexion Internet.",
    secureStorageFailed: "Le stockage sécurisé de la connexion est indisponible.",
  },
  de: {
    editWorkout: "Lauf bearbeiten", duration: "Dauer (Minuten)", intensity: "Intensität", increase: "Schwerer", decrease: "Leichter", normal: "Standard",
    equivalents: "Leistungsgleichwerte", regenerate: "Woche neu erstellen", deletePlanner: "Trainingsplan löschen", privacy: "Datenschutz und Daten",
    editSetup: "Einstellungen bearbeiten",
    deletePlannerConfirm: "Gespeicherten Trainingsplan löschen? Dies kann nicht rückgängig gemacht werden.",
    plannerConflict: "Auf diesem Gerät und in deinem Konto ist jeweils ein Trainingsplan gespeichert. Wähle einen aus; keine Kopie wird ohne deine Entscheidung überschrieben.",
    useAccountPlanner: "Konto-Trainingsplan verwenden", useLocalPlanner: "Geräte-Trainingsplan verwenden",
    exportData: "Daten exportieren", deleteLocal: "Lokale Daten löschen", deleteAccount: "Konto löschen",
    exportOk: "Dein Datenexport kann geteilt werden. Garmin-Tokens sind ausgeschlossen.", exportFailed: "Daten konnten nicht exportiert werden. Versuche es erneut.",
    deleteLocalConfirm: "Gespeicherten Trainingsplan und Sprache auf diesem Gerät löschen?",
    deleteAccountConfirm: "Konto und Trainingsplan dauerhaft löschen? Bereits in Garmin Connect gespeicherte Einheiten bleiben erhalten. Daten auf diesem Gerät bleiben erhalten.",
    deleteLocalOk: "Lokaler Trainingsplan und Sprache gelöscht.", deleteAccountOk: "Konto gelöscht.",
    cancelled: "Anmeldung oder Garmin-Verbindung abgebrochen.", copyOk: "Woche kopiert.", copyFailed: "Woche konnte nicht kopiert werden.",
    signedOut: "Abgemeldet", consent: "Setze im Browser fort, um die Garmin-Einwilligung zu prüfen.",
    fitExportFailed: "FIT-Training konnte nicht erstellt oder geteilt werden.",
    neverIncludeTokens: "Garmin-Tokens werden niemals exportiert.", exportedAt: "Exportiert",
    accountData: "Konto und Trainingsplan",
    sessionExpired: "Deine Anmeldung ist abgelaufen. Melde dich erneut an.", sessionCheckFailed: "Gespeicherte Anmeldung konnte nicht geprüft werden. Prüfe deine Verbindung.",
    secureStorageFailed: "Sicherer Anmeldespeicher ist nicht verfügbar.",
  },
  es: {
    editWorkout: "Editar carrera", duration: "Duración (minutos)", intensity: "Intensidad", increase: "Más difícil", decrease: "Más fácil", normal: "Predeterminada",
    equivalents: "Rendimientos equivalentes", regenerate: "Regenerar semana", deletePlanner: "Eliminar plan", privacy: "Privacidad y datos",
    editSetup: "Editar configuración",
    deletePlannerConfirm: "¿Eliminar el plan guardado? Esta acción no se puede deshacer.",
    plannerConflict: "Hay un plan guardado en este dispositivo y otro en tu cuenta. Elige cuál usar; ninguna copia se sobrescribirá sin tu decisión.",
    useAccountPlanner: "Usar el plan de la cuenta", useLocalPlanner: "Usar el plan de este dispositivo",
    exportData: "Exportar datos", deleteLocal: "Eliminar datos locales", deleteAccount: "Eliminar cuenta",
    exportOk: "La exportación está lista para compartir. Se excluyen los tokens de Garmin.", exportFailed: "No se pudieron exportar los datos. Inténtalo de nuevo.",
    deleteLocalConfirm: "¿Eliminar el plan y el idioma guardados en este dispositivo?",
    deleteAccountConfirm: "¿Eliminar permanentemente la cuenta y su plan? No se eliminarán las carreras que ya estén en Garmin Connect. Los datos guardados en este dispositivo no se verán afectados.",
    deleteLocalOk: "Plan local e idioma eliminados.", deleteAccountOk: "Cuenta eliminada.",
    cancelled: "Se canceló el inicio de sesión o la conexión con Garmin.", copyOk: "Semana copiada.", copyFailed: "No se pudo copiar la semana.",
    signedOut: "Sesión cerrada", consent: "Continúa en el navegador para revisar el consentimiento de Garmin.",
    fitExportFailed: "No se pudo crear ni compartir el entrenamiento FIT.",
    neverIncludeTokens: "Los tokens de Garmin nunca se incluyen.", exportedAt: "Exportado",
    accountData: "Cuenta y plan",
    sessionExpired: "Tu sesión ha caducado. Inicia sesión de nuevo.", sessionCheckFailed: "No se pudo verificar la sesión guardada. Comprueba tu conexión.",
    secureStorageFailed: "El almacenamiento seguro de inicio de sesión no está disponible.",
  },
  pt: {
    editWorkout: "Editar corrida", duration: "Duração (minutos)", intensity: "Intensidade", increase: "Mais difícil", decrease: "Mais fácil", normal: "Predefinida",
    equivalents: "Desempenhos equivalentes", regenerate: "Gerar semana novamente", deletePlanner: "Eliminar plano", privacy: "Privacidade e dados",
    editSetup: "Editar parâmetros",
    deletePlannerConfirm: "Eliminar o plano guardado? Esta ação não pode ser desfeita.",
    plannerConflict: "Existe um plano guardado neste dispositivo e outro na conta. Escolha qual utilizar; nenhuma cópia será substituída sem a sua decisão.",
    useAccountPlanner: "Utilizar o plano da conta", useLocalPlanner: "Utilizar o plano deste dispositivo",
    exportData: "Exportar dados", deleteLocal: "Eliminar dados locais", deleteAccount: "Eliminar conta",
    exportOk: "A exportação está pronta para partilhar. Os tokens Garmin foram excluídos.", exportFailed: "Não foi possível exportar os dados. Tente novamente.",
    deleteLocalConfirm: "Eliminar o plano e o idioma guardados neste dispositivo?",
    deleteAccountConfirm: "Eliminar permanentemente a conta e o respetivo plano? Os treinos já existentes no Garmin Connect não serão eliminados. Os dados guardados neste dispositivo não são afetados.",
    deleteLocalOk: "Plano local e idioma eliminados.", deleteAccountOk: "Conta eliminada.",
    cancelled: "Início de sessão ou ligação Garmin cancelados.", copyOk: "Semana copiada.", copyFailed: "Não foi possível copiar a semana.",
    signedOut: "Sessão terminada", consent: "Continue no navegador para rever o consentimento Garmin.",
    fitExportFailed: "Não foi possível criar ou partilhar o treino FIT.",
    neverIncludeTokens: "Os tokens Garmin nunca são incluídos.", exportedAt: "Exportado",
    accountData: "Conta e plano",
    sessionExpired: "A sua sessão expirou. Inicie sessão novamente.", sessionCheckFailed: "Não foi possível verificar a sessão guardada. Verifique a ligação.",
    secureStorageFailed: "O armazenamento seguro da sessão não está disponível.",
  },
  pl: {
    editWorkout: "Edytuj bieg", duration: "Czas trwania (minuty)", intensity: "Intensywność", increase: "Trudniej", decrease: "Łatwiej", normal: "Domyślna",
    equivalents: "Równoważne wyniki", regenerate: "Wygeneruj tydzień ponownie", deletePlanner: "Usuń plan", privacy: "Prywatność i dane",
    editSetup: "Edytuj ustawienia",
    deletePlannerConfirm: "Usunąć zapisany plan? Tej czynności nie można cofnąć.",
    plannerConflict: "Plan jest zapisany na tym urządzeniu i inny na koncie. Wybierz, którego użyć; żadna kopia nie zostanie zastąpiona bez Twojej decyzji.",
    useAccountPlanner: "Użyj planu z konta", useLocalPlanner: "Użyj planu z urządzenia",
    exportData: "Eksportuj dane", deleteLocal: "Usuń dane lokalne", deleteAccount: "Usuń konto",
    exportOk: "Eksport danych jest gotowy do udostępnienia. Tokeny Garmin są wykluczone.", exportFailed: "Nie udało się wyeksportować danych. Spróbuj ponownie.",
    deleteLocalConfirm: "Usunąć zapisany plan i język z tego urządzenia?",
    deleteAccountConfirm: "Trwale usunąć konto i jego plan? Treningi już zapisane w Garmin Connect nie zostaną usunięte. Dane zapisane na tym urządzeniu pozostaną bez zmian.",
    deleteLocalOk: "Usunięto lokalny plan i język.", deleteAccountOk: "Usunięto konto.",
    cancelled: "Anulowano logowanie lub połączenie z Garmin.", copyOk: "Skopiowano tydzień.", copyFailed: "Nie udało się skopiować tygodnia.",
    signedOut: "Wylogowano", consent: "Kontynuuj w przeglądarce, aby sprawdzić zgodę Garmin.",
    fitExportFailed: "Nie udało się utworzyć ani udostępnić treningu FIT.",
    neverIncludeTokens: "Tokeny Garmin nigdy nie są dołączane.", exportedAt: "Wyeksportowano",
    accountData: "Konto i plan",
    sessionExpired: "Sesja wygasła. Zaloguj się ponownie.", sessionCheckFailed: "Nie udało się zweryfikować zapisanej sesji. Sprawdź połączenie.",
    secureStorageFailed: "Bezpieczny magazyn logowania jest niedostępny.",
  },
  ru: {
    editWorkout: "Изменить тренировку", duration: "Длительность (минуты)", intensity: "Интенсивность", increase: "Сложнее", decrease: "Легче", normal: "Обычная",
    equivalents: "Эквивалентные результаты", regenerate: "Создать неделю заново", deletePlanner: "Удалить план", privacy: "Конфиденциальность и данные",
    editSetup: "Изменить параметры",
    deletePlannerConfirm: "Удалить сохранённый план? Это действие нельзя отменить.",
    plannerConflict: "План сохранён на устройстве, и другой план — в аккаунте. Выберите, какой использовать; без вашего решения ни одна копия не будет перезаписана.",
    useAccountPlanner: "Использовать план аккаунта", useLocalPlanner: "Использовать план устройства",
    exportData: "Экспортировать данные", deleteLocal: "Удалить локальные данные", deleteAccount: "Удалить аккаунт",
    exportOk: "Экспорт данных готов к отправке. Токены Garmin исключены.", exportFailed: "Не удалось экспортировать данные. Попробуйте ещё раз.",
    deleteLocalConfirm: "Удалить сохранённый план и язык на этом устройстве?",
    deleteAccountConfirm: "Безвозвратно удалить аккаунт и его план? Тренировки в Garmin Connect не будут удалены. Данные на этом устройстве не затрагиваются.",
    deleteLocalOk: "Локальный план и язык удалены.", deleteAccountOk: "Аккаунт удалён.",
    cancelled: "Вход или подключение Garmin отменены.", copyOk: "Неделя скопирована.", copyFailed: "Не удалось скопировать неделю.",
    signedOut: "Вы вышли", consent: "Продолжите в браузере, чтобы проверить согласие Garmin.",
    fitExportFailed: "Не удалось создать или отправить FIT-тренировку.",
    neverIncludeTokens: "Токены Garmin никогда не включаются.", exportedAt: "Экспортировано",
    accountData: "Аккаунт и план",
    sessionExpired: "Срок входа истёк. Войдите снова.", sessionCheckFailed: "Не удалось проверить сохранённый вход. Проверьте подключение.",
    secureStorageFailed: "Защищённое хранилище входа недоступно.",
  },
  uk: {
    editWorkout: "Змінити тренування", duration: "Тривалість (хвилини)", intensity: "Інтенсивність", increase: "Складніше", decrease: "Легше", normal: "Звичайна",
    equivalents: "Еквівалентні результати", regenerate: "Створити тиждень знову", deletePlanner: "Видалити план", privacy: "Конфіденційність і дані",
    editSetup: "Змінити параметри",
    deletePlannerConfirm: "Видалити збережений план? Цю дію не можна скасувати.",
    plannerConflict: "План збережено на цьому пристрої та інший план — в обліковому записі. Виберіть, який використовувати; без вашого рішення жодну копію не буде перезаписано.",
    useAccountPlanner: "Використати план облікового запису", useLocalPlanner: "Використати план пристрою",
    exportData: "Експортувати дані", deleteLocal: "Видалити локальні дані", deleteAccount: "Видалити обліковий запис",
    exportOk: "Експорт даних готовий до поширення. Токени Garmin не включено.", exportFailed: "Не вдалося експортувати дані. Спробуйте ще раз.",
    deleteLocalConfirm: "Видалити збережений план і мову на цьому пристрої?",
    deleteAccountConfirm: "Назавжди видалити обліковий запис і його план? Тренування в Garmin Connect не буде видалено. Дані на цьому пристрої не зміняться.",
    deleteLocalOk: "Локальний план і мову видалено.", deleteAccountOk: "Обліковий запис видалено.",
    cancelled: "Вхід або підключення Garmin скасовано.", copyOk: "Тиждень скопійовано.", copyFailed: "Не вдалося скопіювати тиждень.",
    signedOut: "Ви вийшли", consent: "Продовжте в браузері, щоб переглянути згоду Garmin.",
    fitExportFailed: "Не вдалося створити або надіслати FIT-тренування.",
    neverIncludeTokens: "Токени Garmin ніколи не додаються.", exportedAt: "Експортовано",
    accountData: "Обліковий запис і план",
    sessionExpired: "Термін входу минув. Увійдіть знову.", sessionCheckFailed: "Не вдалося перевірити збережений вхід. Перевірте з’єднання.",
    secureStorageFailed: "Захищене сховище входу недоступне.",
  },
  be: {
    editWorkout: "Змяніць трэніроўку", duration: "Працягласць (хвіліны)", intensity: "Інтэнсіўнасць", increase: "Цяжэй", decrease: "Лягчэй", normal: "Звычайная",
    equivalents: "Эквівалентныя вынікі", regenerate: "Стварыць тыдзень зноў", deletePlanner: "Выдаліць план", privacy: "Канфідэнцыяльнасць і даныя",
    editSetup: "Змяніць параметры",
    deletePlannerConfirm: "Выдаліць захаваны план? Гэтае дзеянне нельга скасаваць.",
    plannerConflict: "План захаваны на гэтай прыладзе, а іншы план — ва ўліковым запісе. Выберыце, які выкарыстоўваць; без вашага рашэння ніводная копія не будзе перазапісана.",
    useAccountPlanner: "Выкарыстаць план уліковага запісу", useLocalPlanner: "Выкарыстаць план прылады",
    exportData: "Экспартаваць даныя", deleteLocal: "Выдаліць лакальныя даныя", deleteAccount: "Выдаліць уліковы запіс",
    exportOk: "Экспарт даных гатовы да абагульвання. Токены Garmin выключаны.", exportFailed: "Не ўдалося экспартаваць даныя. Паспрабуйце яшчэ раз.",
    deleteLocalConfirm: "Выдаліць захаваны план і мову на гэтай прыладзе?",
    deleteAccountConfirm: "Назаўсёды выдаліць уліковы запіс і яго план? Трэніроўкі ў Garmin Connect не будуць выдалены. Даныя на гэтай прыладзе не закранаюцца.",
    deleteLocalOk: "Лакальны план і мова выдалены.", deleteAccountOk: "Уліковы запіс выдалены.",
    cancelled: "Уваход або падключэнне Garmin скасаваны.", copyOk: "Тыдзень скапіяваны.", copyFailed: "Не ўдалося скапіяваць тыдзень.",
    signedOut: "Вы выйшлі", consent: "Працягніце ў браўзеры, каб прагледзець згоду Garmin.",
    fitExportFailed: "Не ўдалося стварыць або абагуліць FIT-трэніроўку.",
    neverIncludeTokens: "Токены Garmin ніколі не дадаюцца.", exportedAt: "Экспартавана",
    accountData: "Уліковы запіс і план",
    sessionExpired: "Тэрмін уваходу скончыўся. Увайдзіце зноў.", sessionCheckFailed: "Не ўдалося праверыць захаваны ўваход. Праверце злучэнне.",
    secureStorageFailed: "Бяспечнае сховішча ўваходу недаступнае.",
  },
  it: {
    editWorkout: "Modifica corsa", duration: "Durata (minuti)", intensity: "Intensità", increase: "Più difficile", decrease: "Più facile", normal: "Predefinita",
    equivalents: "Prestazioni equivalenti", regenerate: "Rigenera settimana", deletePlanner: "Elimina piano", privacy: "Privacy e dati",
    editSetup: "Modifica impostazioni",
    deletePlannerConfirm: "Eliminare il piano salvato? L'operazione non può essere annullata.",
    plannerConflict: "Un piano è salvato su questo dispositivo e un altro nel tuo account. Scegli quale usare; nessuna copia verrà sovrascritta senza il tuo consenso.",
    useAccountPlanner: "Usa il piano dell'account", useLocalPlanner: "Usa il piano del dispositivo",
    exportData: "Esporta dati", deleteLocal: "Elimina dati locali", deleteAccount: "Elimina account",
    exportOk: "L'esportazione è pronta per la condivisione. I token Garmin sono esclusi.", exportFailed: "Impossibile esportare i dati. Riprova.",
    deleteLocalConfirm: "Eliminare il piano e la lingua salvati su questo dispositivo?",
    deleteAccountConfirm: "Eliminare definitivamente l'account e il relativo piano? Gli allenamenti già presenti in Garmin Connect non verranno rimossi. I dati salvati su questo dispositivo non saranno modificati.",
    deleteLocalOk: "Piano locale e lingua eliminati.", deleteAccountOk: "Account eliminato.",
    cancelled: "Accesso o connessione Garmin annullati.", copyOk: "Settimana copiata.", copyFailed: "Impossibile copiare la settimana.",
    signedOut: "Disconnesso", consent: "Continua nel browser per rivedere il consenso Garmin.",
    fitExportFailed: "Impossibile creare o condividere l'allenamento FIT.",
    neverIncludeTokens: "I token Garmin non vengono mai inclusi.", exportedAt: "Esportato",
    accountData: "Account e piano",
    sessionExpired: "La sessione è scaduta. Accedi di nuovo.", sessionCheckFailed: "Impossibile verificare l'accesso salvato. Controlla la connessione.",
    secureStorageFailed: "L'archiviazione sicura dell'accesso non è disponibile.",
  },
};
