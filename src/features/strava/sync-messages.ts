import type { Locale } from "@/features/i18n/locales";

export const SYNC_PROGRESS_MESSAGES: Record<Locale, string> = {
  en: "Synchronizing Strava data…", fr: "Synchronisation des données Strava…",
  de: "Strava-Daten werden synchronisiert…", es: "Sincronizando datos de Strava…",
  pt: "A sincronizar dados do Strava…", pl: "Synchronizowanie danych Strava…",
  ru: "Синхронизация данных Strava…", uk: "Синхронізація даних Strava…",
  be: "Сінхранізацыя даных Strava…", it: "Sincronizzazione dei dati Strava…",
};

export const CACHE_PRIVACY_MESSAGES: Record<Locale, string> = {
  en: "Activity views are cached in browser memory for five minutes and cleared on sign-out or disconnect. When configured, Redis stores encrypted activity views and completed-import markers for five minutes. Reconnecting, disconnecting or deleting the account clears this server cache.",
  fr: "Les vues d’activités sont mises en cache en mémoire du navigateur cinq minutes et effacées à la déconnexion. Si configuré, Redis conserve les vues chiffrées et marqueurs d’import terminé cinq minutes. Reconnecter Strava, le déconnecter ou supprimer le compte efface ce cache serveur.",
  de: "Aktivitätsansichten bleiben fünf Minuten im Browserspeicher und werden beim Abmelden oder Trennen gelöscht. Falls konfiguriert, speichert Redis verschlüsselte Ansichten und Importabschlussmarker fünf Minuten. Erneutes Verbinden, Trennen oder Kontolöschung leert diesen Servercache.",
  es: "Las vistas de actividades se guardan cinco minutos en la memoria del navegador y se borran al cerrar sesión o desconectar. Si se configura, Redis guarda vistas cifradas y marcadores de importación completa cinco minutos. Reconectar, desconectar o borrar la cuenta vacía esta caché del servidor.",
  pt: "As vistas de atividades ficam cinco minutos na memória do navegador e são apagadas ao sair ou desligar. Se configurado, o Redis guarda vistas cifradas e marcadores de importação concluída cinco minutos. Voltar a ligar, desligar ou apagar a conta limpa esta cache do servidor.",
  pl: "Widoki aktywności pozostają przez pięć minut w pamięci przeglądarki i są usuwane po wylogowaniu lub odłączeniu. Jeśli skonfigurowano Redis, przechowuje on zaszyfrowane widoki i znaczniki ukończonego importu przez pięć minut. Ponowne połączenie, odłączenie lub usunięcie konta czyści tę pamięć serwera.",
  ru: "Данные просмотров хранятся в памяти браузера пять минут и удаляются при выходе или отключении. Если Redis настроен, он хранит зашифрованные данные и отметки завершённых импортов пять минут. Переподключение, отключение или удаление аккаунта очищает этот серверный кеш.",
  uk: "Дані переглядів зберігаються в пам’яті браузера п’ять хвилин і видаляються під час виходу чи відключення. Якщо Redis налаштовано, він зберігає зашифровані дані та позначки завершених імпортів п’ять хвилин. Перепідключення, відключення чи видалення облікового запису очищує цей серверний кеш.",
  be: "Даныя праглядаў захоўваюцца ў памяці браўзера пяць хвілін і выдаляюцца пры выхадзе ці адключэнні. Калі Redis наладжаны, ён захоўвае зашыфраваныя даныя і пазнакі завершаных імпартаў пяць хвілін. Перападключэнне, адключэнне ці выдаленне акаўнта ачышчае гэты серверны кэш.",
  it: "Le viste delle attività restano cinque minuti nella memoria del browser e vengono eliminate uscendo o scollegando Strava. Se configurato, Redis conserva viste cifrate e indicatori di importazione completata per cinque minuti. Riconnettere, scollegare o eliminare l’account svuota questa cache del server.",
};

export const SMOOTHING_MESSAGES: Record<Locale, string> = {
  en: "Smoothed curves · 15 s", fr: "Courbes lissées · 15 s", de: "Geglättete Kurven · 15 s",
  es: "Curvas suavizadas · 15 s", pt: "Curvas suavizadas · 15 s", pl: "Wygładzone krzywe · 15 s",
  ru: "Сглаженные кривые · 15 с", uk: "Згладжені криві · 15 с", be: "Згладжаныя крывыя · 15 с", it: "Curve smussate · 15 s",
};
