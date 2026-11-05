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

function SiteHeader() {
  const pathname = usePathname();
  const { status } = useSession();
  const garmin = useSiteGarmin();
  const activityImport = useActivityImport();
  const { locale, t } = useI18n();
  const text = STRAVA_MESSAGES[locale];
  const notice = garmin.notice === "error" ? t.garmin.connectFailed
    : garmin.notice === "unavailable" ? t.garmin.unavailable
      : garmin.notice === "statusFailed" ? t.garmin.statusFailed
        : garmin.notice === "disconnectFailed" ? t.garmin.disconnectFailed
          : garmin.notice && garmin.notice !== "connected" ? t.garmin[garmin.notice]
            : garmin.leftInGarmin > 0 ? t.garmin.leftInGarmin(garmin.leftInGarmin) : "";
  return <header className="site-header border-b border-stone-200">
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
      <Link href="/" className="shrink-0 font-semibold text-emerald-950">Run Week</Link>
      <nav aria-label="Run Week" className="order-last flex w-full flex-wrap gap-1 text-sm lg:order-none lg:w-auto">
        {[{ href: "/planner", label: text.planner }, { href: "/activities", label: text.overview },
          { href: "/running-metrics", label: text.metrics }].map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 focus-visible:outline-2 focus-visible:outline-emerald-700 ${active ? "site-nav-active font-semibold" : "site-nav-inactive"}`}>{label}</Link>;
        })}
      </nav>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {status !== "authenticated" && <LanguageSelect />}
        <ThemeToggle />
        <UserMenu garmin={garmin} />
      </div>
      {notice && <p role="alert" className="order-last w-full text-sm text-amber-900">{notice}</p>}
      {activityImport.error && <div className="order-last w-full"><RequestError message={text.error} /></div>}
    </div>
  </header>;
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const garmin = useGarmin(status === "authenticated" ? session.user?.id ?? null : null);
  return <GarminContext.Provider value={garmin}><ActivityQueryProvider key={status === "authenticated" ? session.user?.id : status}><ActivityImportProvider>
    <DocumentLanguage />
    <Suspense fallback={<header className="site-header h-24 border-b border-stone-200" aria-busy="true" />}><SiteHeader /></Suspense>
    {children}
    <Suspense fallback={null}><SiteFooter /></Suspense>
  </ActivityImportProvider></ActivityQueryProvider></GarminContext.Provider>;
}

function SiteFooter() {
  const pathname = usePathname();
  const { locale } = useI18n();
  if (pathname === "/planner") return null;
  return <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-stone-500 sm:px-6">
      <Link href="/privacy" className="underline underline-offset-2 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-emerald-700">
        {STRAVA_MESSAGES[locale].privacy}
      </Link>
    </footer>
}
