"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { useI18n } from "@/features/i18n/use-i18n";
import { STRAVA_MESSAGES } from "../messages";
import { STRAVA_CONSENT_VERSION } from "../types";
import type { Locale } from "@/features/i18n/locales";
import { useActivityImport } from "./use-activity-import";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVITY_QUERY_KEY } from "./activity-query";
import { CACHE_PRIVACY_MESSAGES } from "../sync-messages";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { RequestError } from "./request-error";
import { STRAVA_STATUS_KEY } from "./connection-status";

const retention: Record<Locale, string> = {
  en: "Strava imports, manual HR settings and encrypted tokens stay until disconnect or account deletion. Consent version and acceptance time are recorded; changed consent requires reconnection. OAuth cookies and cancellable single-use tickets expire after 10 minutes. Import progress and short-lived leases are stored for safe retries. Hosting/database providers listed in this policy process this data. Logs contain only operation names and safe error codes, not activity data or tokens. Account export includes imports and settings, never tokens. Strava does not become a sign-in provider. Account deletion cancels pending imports; original Strava activities remain.",
  fr: "Imports Strava, réglages FC et jetons chiffrés restent jusqu’à déconnexion ou suppression du compte. Version et date du consentement sont enregistrées ; un changement exige une reconnexion. Cookies OAuth et tickets annulables à usage unique expirent après 10 minutes. Progression et verrous temporaires permettent les reprises. Les hébergeurs et fournisseurs de base cités ici traitent ces données. Les journaux contiennent uniquement opérations et codes d’erreur sûrs, pas d’activités ni de jetons. L’export inclut imports et réglages, jamais les jetons. Strava n’est pas un fournisseur de connexion. Supprimer le compte annule les imports en attente ; les activités Strava restent.",
  de: "Strava-Importe, manuelle HF-Einstellungen und verschlüsselte Token bleiben bis zum Trennen oder Löschen des Kontos. Einwilligungsversion und Zeitpunkt werden gespeichert; Änderungen erfordern erneute Verbindung. OAuth-Cookies und widerrufbare Einmaltickets laufen nach 10 Minuten ab. Fortschritt und kurzlebige Sperren ermöglichen sichere Wiederholungen. Genannte Hosting-/Datenbankanbieter verarbeiten diese Daten. Logs enthalten nur Vorgänge und sichere Fehlercodes, keine Aktivitäten oder Token. Export umfasst Importe und Einstellungen, niemals Token. Strava wird kein Anmeldeanbieter. Kontolöschung beendet ausstehende Importe; Strava-Aktivitäten bleiben.",
  es: "Importaciones Strava, ajustes de pulso y tokens cifrados permanecen hasta desconectar o borrar la cuenta. Se guardan versión y fecha del consentimiento; los cambios requieren reconexión. Cookies OAuth y tickets cancelables de un uso caducan en 10 minutos. Progreso y bloqueos breves permiten reintentos seguros. Los proveedores de alojamiento y base aquí indicados procesan estos datos. Los registros solo contienen operaciones y códigos seguros, no actividades ni tokens. La exportación incluye importaciones y ajustes, nunca tokens. Strava no sirve para iniciar sesión. Borrar la cuenta cancela importaciones pendientes; las actividades Strava permanecen.",
  pt: "Importações Strava, definições FC e tokens cifrados ficam até desligar ou apagar a conta. Versão e data do consentimento são guardadas; alterações exigem nova ligação. Cookies OAuth e bilhetes canceláveis de uso único expiram em 10 minutos. Progresso e bloqueios breves permitem tentativas seguras. Os fornecedores de alojamento e base aqui indicados processam estes dados. Registos contêm apenas operações e códigos seguros, não atividades nem tokens. Exportação inclui importações e definições, nunca tokens. Strava não serve para iniciar sessão. Apagar a conta cancela importações pendentes; atividades Strava permanecem.",
  it: "Importazioni Strava, impostazioni FC e token cifrati restano fino alla disconnessione o eliminazione dell’account. Versione e data del consenso sono registrate; modifiche richiedono riconnessione. Cookie OAuth e ticket annullabili monouso scadono dopo 10 minuti. Avanzamento e blocchi brevi consentono tentativi sicuri. I fornitori di hosting e database indicati qui elaborano questi dati. I log contengono solo operazioni e codici sicuri, non attività o token. L’esportazione include importazioni e impostazioni, mai token. Strava non è un metodo di accesso. Eliminare l’account annulla gli import pendenti; le attività Strava restano.",
  pl: "Importy Strava, ręczne ustawienia tętna i szyfrowane tokeny pozostają do odłączenia lub usunięcia konta. Wersja i czas zgody są zapisane; zmiany wymagają ponownego połączenia. Ciasteczka OAuth i odwoływalne bilety jednorazowe wygasają po 10 minutach. Postęp i krótkie blokady umożliwiają bezpieczne ponawianie. Wskazani dostawcy hostingu i bazy przetwarzają dane. Logi zawierają tylko operacje i bezpieczne kody, nie aktywności ani tokeny. Eksport zawiera importy i ustawienia, nigdy tokeny. Strava nie jest metodą logowania. Usunięcie konta anuluje oczekujące importy; aktywności Strava pozostają.",
  ru: "Импорты Strava, ручные настройки пульса и зашифрованные токены хранятся до отключения или удаления аккаунта. Версия и время согласия записываются; изменения требуют переподключения. Cookie OAuth и отменяемые одноразовые билеты истекают через 10 минут. Прогресс и краткие блокировки обеспечивают безопасные повторы. Указанные провайдеры хостинга и базы обрабатывают данные. Журналы содержат только операции и безопасные коды, не активности и токены. Экспорт включает импорты и настройки, не токены. Strava не используется для входа. Удаление аккаунта отменяет ожидающие импорты; активности Strava остаются.",
  uk: "Імпорт Strava, ручні налаштування пульсу й зашифровані токени зберігаються до відключення чи видалення запису. Версія й час згоди записуються; зміни потребують перепідключення. Cookie OAuth та скасовувані одноразові квитки діють 10 хвилин. Прогрес і короткі блокування забезпечують безпечні повтори. Вказані постачальники хостингу й бази обробляють дані. Журнали містять лише операції й безпечні коди, не активності чи токени. Експорт включає імпорт і налаштування, не токени. Strava не використовується для входу. Видалення запису скасовує очікувані імпорти; активності Strava лишаються.",
  be: "Імпарт Strava, ручныя налады пульсу і зашыфраваныя токены захоўваюцца да адключэння ці выдалення акаўнта. Версія і час згоды запісваюцца; змены патрабуюць перападключэння. Cookie OAuth і скасавальныя аднаразовыя квіткі дзейнічаюць 10 хвілін. Прагрэс і кароткія блакіроўкі забяспечваюць бяспечныя паўторы. Названыя пастаўшчыкі хостынгу і базы апрацоўваюць даныя. Журналы змяшчаюць толькі аперацыі і бяспечныя коды, не актыўнасці ці токены. Экспарт уключае імпарт і налады, не токены. Strava не выкарыстоўваецца для ўваходу. Выдаленне акаўнта скасоўвае чаканыя імпарты; актыўнасці Strava застаюцца.",
};
export function StravaPrivacy() {
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const { status } = useSession();
  const activityImport = useActivityImport();
  const queries = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(0);
  async function disconnect() {
    setBusy(true); setMessage("");
    setError(0);
    try {
      const response = await fetch("/api/strava/disconnect", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (response.ok) {
        activityImport.stop();
        await queries.cancelQueries({ queryKey: ACTIVITY_QUERY_KEY });
        queries.removeQueries({ queryKey: ACTIVITY_QUERY_KEY });
        await queries.cancelQueries({ queryKey: STRAVA_STATUS_KEY });
        queries.setQueryData(STRAVA_STATUS_KEY, { connected: false, consentCurrent: false });
        setConfirming(false);
        setMessage(text.deleted);
      } else {
        setError(Date.now());
      }
    } catch { setError(Date.now()); }
    finally { setBusy(false); }
  }
  return <section lang={locale} className="space-y-3">
    <h2 className="text-lg font-semibold">{text.consentTitle} · {STRAVA_CONSENT_VERSION}</h2>
    <p>{text.consent}</p>
    <p>{retention[locale]}</p>
    <p>{CACHE_PRIVACY_MESSAGES[locale]}</p>
    <Link href="/activities" className="underline">{text.overview}</Link>
    {status === "authenticated" && <button type="button" className="button-secondary block" disabled={busy} onClick={() => { setError(0); setConfirming(true); }}>{text.disconnect}</button>}
    {message && <p role="status">{message}</p>}
    {confirming && <ConfirmationDialog title={text.disconnect} confirmLabel={text.disconnect} cancelLabel={t.confirm.cancel}
      tone="danger" busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void disconnect()}>
      <p>{text.confirmDelete}</p>
      {error > 0 && <RequestError key={error} message={text.error} />}
    </ConfirmationDialog>}
  </section>;
}
