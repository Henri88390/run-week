"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ACTIVITY_QUERY_KEY } from "./activity-query";

type MaxHr = { value: number; custom: boolean };

// Last HRmax saved in this tab. Only written from event handlers, never during server rendering.
let saved: MaxHr | null = null;

export function rememberSavedMaxHr(value: MaxHr) {
  saved = value;
}

/**
 * Pages kept alive for back/forward navigation keep the data they were rendered with.
 * When one becomes visible again with an HRmax older than the last saved one, reload its data.
 */
export function useMaxHrFreshness({ value, custom }: MaxHr) {
  const router = useRouter();
  const queries = useQueryClient();
  const [, startRefresh] = useTransition();
  useEffect(() => {
    if (!saved || (saved.value === value && saved.custom === custom)) return;
    void queries.invalidateQueries({ queryKey: ACTIVITY_QUERY_KEY });
    startRefresh(() => router.refresh());
  }, [value, custom, queries, router]);
}
