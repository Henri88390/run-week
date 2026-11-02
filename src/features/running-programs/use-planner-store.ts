"use client";

import { useSyncExternalStore } from "react";
import { parsePlanner, STORAGE_KEY } from "./storage";
import type { PlannerState } from "./types";

type Snapshot = {
  loaded: boolean;
  state: PlannerState | null;
  warning: string;
  unreadable: boolean;
};

const initial: Snapshot = { loaded: false, state: null, warning: "", unreadable: false };
let snapshot = initial;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    try {
      snapshot = { loaded: true, state: raw ? parsePlanner(raw) : null, warning: "", unreadable: false };
    } catch {
      snapshot = {
        loaded: true, state: null, unreadable: true,
        warning: "Saved data could not be read. It has not been overwritten. Reset local data to start again.",
      };
    }
  } catch {
    snapshot = {
      loaded: true, state: null, unreadable: false,
      warning: "Browser storage is unavailable. Changes can only last for this open page.",
    };
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!snapshot.loaded) {
    readStorage();
    emit();
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      readStorage();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function savePlanner(state: PlannerState | null) {
  let warning = "";
  try {
    if (state) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    warning = "Could not save to browser storage. Changes are in memory only and may be lost on reload.";
  }
  snapshot = { loaded: true, state, warning, unreadable: false };
  emit();
}

export function usePlannerStore() {
  return useSyncExternalStore(subscribe, () => snapshot, () => initial);
}
