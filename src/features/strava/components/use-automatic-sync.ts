"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { syncPeriodRange, type SyncPeriod } from "../sync-period";
import type { DashboardData } from "../types";
import { activityPeriod } from "./activity-query";
import { useActivityImport } from "./use-activity-import";

export function useAutomaticSync(data: DashboardData, enabled: boolean) {
  const pathname = usePathname();
  const search = useSearchParams();
  const controller = useActivityImport();
  const visit = `${pathname}?${search.toString()}`;
  const state = useRef({ visit, attempted: new Set<string>(), blocked: false, stopVersion: controller.stopVersion });
  useEffect(() => {
    if (state.current.visit !== visit) state.current = { visit, attempted: new Set(), blocked: false, stopVersion: controller.stopVersion };
    if (state.current.stopVersion !== controller.stopVersion) {
      state.current.stopVersion = controller.stopVersion;
      state.current.blocked = true;
    }
    if (!enabled || pathname !== "/activities" || !data.connected || !data.consentCurrent
      || controller.importing || controller.coolingDown || controller.error || state.current.blocked) return;
    const view = search.get("view");
    const selected: SyncPeriod = view === "year"
      ? { view: "year", year: search.get("year") ?? data.today.slice(0, 4) }
      : view === "week"
        ? { view: "week", date: search.get("date") ?? (search.get("month") ? `${search.get("month")}-01` : data.today) }
        : { view: "month", month: search.get("month") ?? data.today.slice(0, 7) };
    if (JSON.stringify(syncPeriodRange(selected)) !== JSON.stringify(syncPeriodRange(activityPeriod(data)))) return;
    const pending = data.missingSyncPeriods.find((period) => !state.current.attempted.has(JSON.stringify(period)));
    if (!pending) return;
    const timer = setTimeout(() => {
      const current = state.current;
      current.attempted.add(JSON.stringify(pending));
      void controller.start(pending).then((success) => {
        if (success === false || success === undefined) current.blocked = true;
        if (success === null) current.attempted.delete(JSON.stringify(pending));
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [controller, data, enabled, pathname, search, visit]);
}
