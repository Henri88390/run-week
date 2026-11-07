"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { createContext, Suspense, useContext } from "react";
import { UserMenu } from "@/features/account/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useGarmin } from "@/features/garmin/use-garmin";
import { DocumentLanguage, LanguageSelect } from "@/features/i18n/language-select";
import { useI18n } from "@/features/i18n/use-i18n";
import { STRAVA_MESSAGES } from "@/features/strava/messages";
import { ActivityImportProvider, useActivityImport } from "@/features/strava/components/use-activity-import";
import { RequestError } from "@/features/strava/components/request-error";
import { ActivityQueryProvider } from "@/features/strava/components/activity-query";

const GarminContext = createContext<ReturnType<typeof useGarmin> | null>(null);

export function useSiteGarmin() {
  const garmin = useContext(GarminContext);
  if (!garmin) throw new Error("Missing site Garmin provider");
  return garmin;
}

const ICON = "size-5 shrink-0 max-sm:hidden";
const NAV_ICONS = {
  "/planner": <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M8 17h6" />
  </svg>,
  "/activities": <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </svg>,
  "/running-metrics": <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON}>
    <path d="M4.5 17a8 8 0 1 1 15 0" /><path d="m12 13 3.5-4" /><circle cx="12" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>,
} as const;

function SiteHeader() {
  const pathname = usePathname();
  const { status } = useSession();
  const garmin = useSiteGarmin();
  const { locale } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const sidebarMenu = "right-0 mt-1 lg:right-auto lg:left-0 lg:bottom-full lg:mt-0 lg:mb-1";
  return <header className="site-header grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-stone-200 px-4 pt-3 sm:px-6
    lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:items-stretch lg:self-start lg:border-r lg:border-b-0 lg:px-3 lg:py-5">
    <Link href="/" className="site-brand inline-flex items-center gap-2 justify-self-start whitespace-nowrap rounded-lg font-semibold text-emerald-950 focus-visible:outline-2 focus-visible:outline-emerald-700 lg:mb-6 lg:px-3">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="site-brand-mark size-8 shrink-0 rounded-lg" fill="none" stroke="currentColor"
        strokeLinecap="round" strokeLinejoin="round">
        <rect x="5.5" y="7.5" width="21" height="19" rx="3.5" strokeWidth="2.2" />
        <path d="M5.5 12.5h21" strokeWidth="2.2" />
        <path d="M11 5v4.5M21 5v4.5" strokeWidth="2.4" />
        <rect x="8.75" y="15" width="14.5" height="8.5" rx="4.25" strokeWidth="1.6" />
        <rect x="12" y="17.9" width="8" height="2.7" rx="1.35" strokeWidth="1.4" />
      </svg>
      <span className="max-sm:sr-only">Run Week</span>
    </Link>
    <nav aria-label="Run Week" className="site-nav col-span-2 row-start-2 -mx-4 mt-2 flex overflow-x-auto px-2 text-sm sm:-mx-6 sm:gap-1 sm:px-4
      lg:mx-0 lg:mt-0 lg:flex-col lg:overflow-visible lg:px-0">
      {[{ href: "/planner", label: text.planner }, { href: "/activities", label: text.overview },
        { href: "/running-metrics", label: text.metrics }].map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined}
          className="site-nav-link inline-flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap px-2 py-2.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 sm:flex-none sm:px-3 lg:justify-start lg:gap-3 lg:rounded-lg">
          {NAV_ICONS[href as keyof typeof NAV_ICONS]}<span className="site-nav-label">{label}</span>
        </Link>;
      })}
    </nav>
    <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-2
      lg:mt-auto lg:flex-wrap lg:justify-between lg:border-t lg:border-stone-300 lg:px-1 lg:pt-4">
      {status !== "authenticated" && <LanguageSelect menuClassName={sidebarMenu} />}
      <ThemeToggle />
      <div className="min-w-0 lg:w-full">
        <UserMenu garmin={garmin} menuClassName={sidebarMenu} triggerClassName="lg:w-full" />
      </div>
    </div>
  </header>;
}

function SiteNotices() {
  const garmin = useSiteGarmin();
  const activityImport = useActivityImport();
  const { locale, t } = useI18n();
  const notice = garmin.notice === "error" ? t.garmin.connectFailed
    : garmin.notice === "unavailable" ? t.garmin.unavailable
      : garmin.notice === "statusFailed" ? t.garmin.statusFailed
        : garmin.notice === "disconnectFailed" ? t.garmin.disconnectFailed
          : garmin.notice && garmin.notice !== "connected" ? t.garmin[garmin.notice]
            : garmin.leftInGarmin > 0 ? t.garmin.leftInGarmin(garmin.leftInGarmin) : "";
  if (!notice && !activityImport.error) return null;
  return <div className="mx-auto w-full max-w-6xl space-y-2 px-4 pt-4 sm:px-6">
    {notice && <p role="alert" className="text-sm text-amber-900">{notice}</p>}
    {activityImport.error && <RequestError message={STRAVA_MESSAGES[locale].error} />}
  </div>;
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const garmin = useGarmin(status === "authenticated" ? session.user?.id ?? null : null);
  return <GarminContext.Provider value={garmin}><ActivityQueryProvider key={status === "authenticated" ? session.user?.id : status}><ActivityImportProvider>
    <DocumentLanguage />
    <div className="flex flex-1 flex-col lg:flex-row">
      <Suspense fallback={<header className="site-header h-28 border-b border-stone-200 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0" aria-busy="true" />}>
        <SiteHeader />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}><SiteNotices /></Suspense>
        {children}
        <Suspense fallback={null}><SiteFooter /></Suspense>
      </div>
    </div>
  </ActivityImportProvider></ActivityQueryProvider></GarminContext.Provider>;
}

function SiteFooter() {
  const pathname = usePathname();
  const { locale } = useI18n();
  if (pathname === "/planner") return null;
  return <footer className="mx-auto mt-auto w-full max-w-6xl px-4 py-6 text-xs text-stone-500 sm:px-6">
      <Link href="/privacy" className="underline underline-offset-2 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-emerald-700">
        {STRAVA_MESSAGES[locale].privacy}
      </Link>
    </footer>
}
