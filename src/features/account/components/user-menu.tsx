"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import type { GarminDisconnectResult } from "@/features/garmin/use-garmin";
import { Flag } from "@/features/i18n/language-select";
import { LOCALE_NAMES, LOCALES } from "@/features/i18n/locales";
import { setLocale, useI18n } from "@/features/i18n/use-i18n";

type GarminControls = {
  configured: boolean;
  connected: boolean;
  countSent: () => Promise<number | null>;
  disconnect: (options?: { notify?: boolean }) => Promise<GarminDisconnectResult>;
};

const ITEMS = '[role="menuitem"], [role="menuitemradio"]';
const itemClass = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left whitespace-nowrap text-stone-700 hover:bg-stone-100 focus-visible:bg-stone-100 focus-visible:outline-none disabled:opacity-60";

function Separator() {
  return <li role="separator" className="my-1 border-t border-stone-200" />;
}

/** Signed in: one menu with Garmin, language and sign-out. Signed out: language selector rendered by the caller and a Sign in link. */
export function UserMenu({ garmin }: { garmin: GarminControls }) {
  const { data: session, status } = useSession();
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [languagesOpen, setLanguagesOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState("");
  const menuId = useId();
  const languagesId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const initialFocus = useRef<"first" | "last">("first");

  useEffect(() => {
    if (!open) return;
    const items = menu.current?.querySelectorAll<HTMLElement>(ITEMS);
    items?.[initialFocus.current === "first" ? 0 : items.length - 1]?.focus();
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    // Focus can leave the menu when an item is replaced (e.g. after Garmin disconnects); Escape still closes it.
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || menu.current?.contains(document.activeElement)) return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  if (status === "loading") return null;
  if (status !== "authenticated") {
    return <Link href="/signin" className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700">
      {t.account.signIn}
    </Link>;
  }

  const email = session.user?.email ?? "";
  const show = (focus: "first" | "last") => {
    initialFocus.current = focus;
    setLanguagesOpen(false);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const startDisconnect = async () => {
    close();
    setDisconnectError("");
    setDisconnecting(true);
    // Confirm only when workouts would be deleted from Garmin, or when that cannot be determined.
    const count = await garmin.countSent();
    if (count !== 0) {
      setDisconnecting(false);
      setConfirmingDisconnect(true);
      return;
    }
    await garmin.disconnect({ notify: true });
    setDisconnecting(false);
  };
  const disconnectGarmin = async () => {
    setDisconnecting(true);
    setDisconnectError("");
    const result = await garmin.disconnect();
    setDisconnecting(false);
    if (!result.error) {
      setConfirmingDisconnect(false);
      return;
    }
    setDisconnectError([
      t.garmin.disconnectFailed,
      result.deleted > 0 ? t.garmin.removed(result.deleted) : "",
      t.garmin[result.error],
      result.requestId ? `${t.garmin.reference}: ${result.requestId}` : "",
    ].filter(Boolean).join(" "));
  };
  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const index = items.findIndex((item) => item === document.activeElement);
    const move = (next: number) => items[(next + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(index + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      move(event.key === "Home" ? 0 : items.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") setOpen(false);
  };

  return <div ref={container} className="relative min-w-0"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
      aria-label={t.account.menu}
      className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-700"
      onClick={() => open ? setOpen(false) : show("first")}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          show(event.key === "ArrowDown" ? "first" : "last");
        }
      }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4 shrink-0">
        <circle cx="12" cy="8" r="4" />
        <path strokeLinecap="round" d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />
      </svg>
      <span aria-hidden="true" className="hidden max-w-[14rem] truncate sm:inline">{email}</span>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor"
        className={`size-4 shrink-0 text-stone-500 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}>
        <path fillRule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
      </svg>
    </button>
    <ul id={menuId} ref={menu} role="menu" aria-label={t.account.menu} hidden={!open} onKeyDown={onMenuKeyDown}
      className="absolute right-0 z-40 mt-1 max-h-[70vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 text-sm shadow-lg">
      <li role="none" className="mb-1 border-b border-stone-200 px-2 pt-1.5 pb-2.5 text-stone-600 [overflow-wrap:anywhere] sm:hidden">
        {t.account.signedInAs(email)}
      </li>
      {garmin.configured && <>
        <li role="none">
          {garmin.connected
            ? <button type="button" role="menuitem" tabIndex={-1} className={itemClass}
              disabled={disconnecting} onClick={() => void startDisconnect()}>
              <Image src="/garmin-logo.svg" alt="" width={425} height={61} className="h-[11px] w-auto" unoptimized />
              <span className="ml-auto">{t.garmin.disconnect}</span>
            </button>
            : <a href="/api/garmin/connect" role="menuitem" tabIndex={-1} className={itemClass}>
              <Image src="/garmin-logo.svg" alt="" width={425} height={61} className="h-[11px] w-auto" unoptimized />
              <span className="ml-auto">{t.garmin.connect}</span>
            </a>}
        </li>
        <Separator />
      </>}
      <li role="none">
        <button type="button" role="menuitem" tabIndex={-1} aria-expanded={languagesOpen} aria-controls={languagesId}
          className={itemClass} onClick={() => setLanguagesOpen((current) => !current)}>
          <Flag locale={locale} />
          <span>{t.language}</span>
          <span className="ml-auto text-stone-500" lang={locale}>{LOCALE_NAMES[locale]}</span>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor"
            className={`size-4 shrink-0 text-stone-500 transition-transform motion-reduce:transition-none ${languagesOpen ? "rotate-180" : ""}`}>
            <path fillRule="evenodd" d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>
      </li>
      {languagesOpen && <li role="none">
        <ul id={languagesId} role="group" aria-label={t.language} className="pl-4">
          {LOCALES.map((code) => <li key={code} role="none">
            <button type="button" role="menuitemradio" aria-checked={code === locale} tabIndex={-1}
              className={`${itemClass} ${code === locale ? "font-semibold text-stone-900" : ""}`}
              onClick={() => { setLocale(code); close(); }}>
              <Flag locale={code} />
              <span lang={code}>{LOCALE_NAMES[code]}</span>
              {code === locale && <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="ml-auto size-4 text-emerald-700">
                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
              </svg>}
            </button>
          </li>)}
        </ul>
      </li>}
      <Separator />
      <li role="none">
        <button type="button" role="menuitem" tabIndex={-1} disabled={busy} className={itemClass}
          onClick={() => { setBusy(true); void signOut({ redirectTo: "/" }); }}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-stone-500">
            <path d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
          <span>{t.account.signOut}</span>
        </button>
      </li>
    </ul>
    {confirmingDisconnect && <ConfirmationDialog title={t.garmin.disconnectTitle} tone="danger" busy={disconnecting}
      confirmLabel={disconnecting ? t.garmin.disconnecting : t.garmin.disconnectConfirm} cancelLabel={t.confirm.cancel}
      onCancel={() => setConfirmingDisconnect(false)} onConfirm={() => void disconnectGarmin()}>
      <p>{t.garmin.disconnectBody}</p>
      {disconnectError && <p role="alert" className="text-red-700">{disconnectError}</p>}
    </ConfirmationDialog>}
  </div>;
}
