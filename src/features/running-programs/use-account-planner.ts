"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parsePlannerValue } from "./storage";
import type { PlannerState } from "./types";

export type AccountPlannerWarning = "" | "unreadable" | "accountLoadFailed" | "accountSaveFailed";

type Snapshot = {
  userId: string | null;
  loaded: boolean;
  state: PlannerState | null;
  warning: AccountPlannerWarning;
  unreadable: boolean;
  loadFailed: boolean;
};

const empty = (userId: string | null): Snapshot => ({
  userId, loaded: false, state: null, warning: "", unreadable: false, loadFailed: false,
});

function parseResponse(value: unknown): { state: PlannerState | null; unreadable: boolean } {
  if (typeof value !== "object" || value === null || !("planner" in value)) throw new Error("Invalid planner response.");
  if ("unreadable" in value && value.unreadable === true) return { state: null, unreadable: true };
  return { state: value.planner === null ? null : parsePlannerValue(value.planner), unreadable: false };
}

/** Planner stored in the signed-in account. Saves are optimistic; reads never overwrite a newer save. */
export function useAccountPlanner(userId: string | null) {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => empty(userId));
  const mutations = useRef({ generation: 0, pending: 0 });
  const current = snapshot.userId === userId ? snapshot : empty(userId);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!userId || mutations.current.pending > 0) return;
    const generation = mutations.current.generation;
    try {
      const response = await fetch("/api/planner", { cache: "no-store", signal });
      if (!response.ok) throw new Error("Planner request failed.");
      const parsed = parseResponse(await response.json());
      if (signal?.aborted || generation !== mutations.current.generation || mutations.current.pending > 0) return;
      setSnapshot({
        userId, loaded: true, state: parsed.state, unreadable: parsed.unreadable, loadFailed: false,
        warning: parsed.unreadable ? "unreadable" : "",
      });
    } catch {
      if (signal?.aborted || generation !== mutations.current.generation) return;
      setSnapshot((previous) => previous.userId === userId && previous.loaded && !previous.loadFailed
        ? previous
        : { ...empty(userId), loaded: true, loadFailed: true, warning: "accountLoadFailed" });
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    // Loading synchronizes with the server; state is set only after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const onFocus = () => { void load(controller.signal); };
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [load, userId]);

  const save = useCallback(async (state: PlannerState | null) => {
    if (!userId) return;
    mutations.current.generation += 1;
    mutations.current.pending += 1;
    setSnapshot({ userId, loaded: true, state, warning: "", unreadable: false, loadFailed: false });
    try {
      const response = await fetch("/api/planner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planner: state }),
      });
      if (!response.ok) throw new Error("Planner save failed.");
    } catch {
      setSnapshot((previous) => previous.userId === userId ? { ...previous, warning: "accountSaveFailed" } : previous);
    } finally {
      mutations.current.pending -= 1;
    }
  }, [userId]);

  const retry = useCallback(() => {
    setSnapshot(empty(userId));
    void load();
  }, [load, userId]);

  return { ...current, save, retry };
}
