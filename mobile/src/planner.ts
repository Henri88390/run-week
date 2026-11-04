import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { mobileApi } from "./api";
import { STORAGE_KEY, parsePlanner, parsePlannerValue } from "@/features/running-programs/storage";
import type { PlannerState } from "@/features/running-programs/types";

export type PlannerWarning = "" | "unreadable" | "unavailable" | "saveFailed" | "accountLoadFailed" | "accountSaveFailed";
type Snapshot = {
  owner: string | null;
  loaded: boolean;
  state: PlannerState | null;
  warning: PlannerWarning;
  unreadable: boolean;
  offlineMode: boolean;
  pendingUnreadable: boolean;
};
const empty = (owner: string | null): Snapshot => ({
  owner, loaded: false, state: null, warning: "", unreadable: false,
  offlineMode: false, pendingUnreadable: false,
});
export const PENDING_ACCOUNT_KEY = "run-week.pending-account-planner";

function parseAccountPlanner(value: unknown): { state: PlannerState | null; unreadable: boolean } {
  if (typeof value !== "object" || value === null || !("planner" in value))
    throw new Error("Invalid account planner response.");
  if ("unreadable" in value && value.unreadable === true) return { state: null, unreadable: true };
  const raw = value.planner;
  return { state: raw === null ? null : parsePlannerValue(raw), unreadable: false };
}

async function loadLocal(): Promise<{ state: PlannerState | null; unreadable: boolean }> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) return { state: null, unreadable: false };
    try {
      return { state: parsePlanner(raw), unreadable: false };
    } catch {
      return { state: null, unreadable: true };
    }
  } catch {
    return { state: null, unreadable: true };
  }
}

async function loadPending(): Promise<{ found: boolean; state: PlannerState | null; unreadable: boolean }> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ACCOUNT_KEY);
    if (raw === null) return { found: false, state: null, unreadable: false };
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("planner" in value))
      return { found: false, state: null, unreadable: true };
    return { found: true, state: value.planner === null ? null : parsePlannerValue(value.planner), unreadable: false };
  } catch {
    return { found: false, state: null, unreadable: true };
  }
}

export function usePlanner(token: string | null) {
  const owner = token ? "account" : null;
  const [snapshot, setSnapshot] = useState<Snapshot>(() => empty(owner));
  const generation = useRef(0);
  const mutations = useRef(0);
  const accountSaveQueue = useRef(Promise.resolve());
  const current = snapshot.owner === owner ? snapshot : empty(owner);

  const loadAccount = useCallback(async (requestToken: string, version: number) => {
    const pendingPromise = loadPending();
    try {
      const [response, pending] = await Promise.all([mobileApi.planner(requestToken), pendingPromise]);
      const account = parseAccountPlanner(response);
      if (generation.current !== version || mutations.current > 0) return;
      setSnapshot({
        owner: "account",
        loaded: true,
        state: account.state,
        warning: account.unreadable || pending.unreadable ? "unreadable" : "",
        unreadable: account.unreadable || pending.unreadable,
        offlineMode: false,
        pendingUnreadable: pending.unreadable,
      });
    } catch {
      const pending = await pendingPromise;
      if (generation.current === version)
        setSnapshot((previous) => ({
          ...(previous.owner === "account" ? previous : empty("account")),
          owner: "account",
          loaded: true,
          warning: "accountLoadFailed",
          offlineMode: previous.owner === "account" ? previous.offlineMode : false,
          pendingUnreadable: pending.unreadable,
        }));
    }
  }, []);

  useEffect(() => {
    if (owner === "account" && token) {
      const version = ++generation.current;
      void loadAccount(token, version);
      return () => { generation.current++; };
    }
    let active = true;
    const version = ++generation.current;
    void loadLocal().then((local) => {
      if (!active || generation.current !== version) return;
      setSnapshot({
        ...empty(null),
        owner: null,
        loaded: true,
        state: local.state,
        warning: local.unreadable ? "unreadable" : "",
        unreadable: local.unreadable,
      });
    });
    return () => { active = false; generation.current++; };
  }, [loadAccount, owner, token]);

  const save = useCallback(async (state: PlannerState | null) => {
    const version = ++generation.current;
    mutations.current++;
    setSnapshot((previous) => ({
      ...empty(owner),
      owner,
      loaded: true,
      state,
      warning: previous.owner === owner && previous.offlineMode ? previous.warning : "",
      offlineMode: previous.owner === owner && previous.offlineMode,
    }));
    try {
      if (token && snapshot.owner === "account" && snapshot.pendingUnreadable)
        throw new Error("Unrecognized pending account planner data.");
      if (token) {
        if (snapshot.owner === "account" && snapshot.offlineMode) {
          await AsyncStorage.setItem(PENDING_ACCOUNT_KEY, JSON.stringify({ planner: state }));
        } else {
          const operation = accountSaveQueue.current.then(() => mobileApi.savePlanner(token, state));
          accountSaveQueue.current = operation.catch(() => undefined);
          await operation;
          await AsyncStorage.removeItem(PENDING_ACCOUNT_KEY);
        }
      } else if (state) {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      if (token && generation.current === version && !snapshot.pendingUnreadable) {
        try {
          await AsyncStorage.setItem(PENDING_ACCOUNT_KEY, JSON.stringify({ planner: state }));
        } catch {
          // Keep the optimistic account state in memory when persistent storage is unavailable.
        }
      }
      if (generation.current === version)
        setSnapshot((previous) => previous.owner === owner
          ? {
            ...previous,
            warning: token ? previous.warning === "unreadable" ? "unreadable" : previous.warning === "accountLoadFailed" ? "accountLoadFailed" : "accountSaveFailed" : "saveFailed",
            offlineMode: token ? true : previous.offlineMode,
          }
          : previous);
    } finally {
      mutations.current = Math.max(0, mutations.current - 1);
    }
  }, [owner, snapshot.offlineMode, snapshot.owner, snapshot.pendingUnreadable, token]);

  const retry = useCallback(() => {
    if (!token) return;
    const version = ++generation.current;
    setSnapshot((previous) => ({
      ...(previous.owner === "account" ? previous : empty("account")),
      owner: "account",
      loaded: false,
      warning: "",
    }));
    void loadAccount(token, version);
  }, [loadAccount, token]);

  const discardUnreadablePending = useCallback(async () => {
    await AsyncStorage.removeItem(PENDING_ACCOUNT_KEY);
    setSnapshot((previous) => previous.owner === "account"
      ? { ...previous, pendingUnreadable: false, unreadable: false, warning: "" }
      : previous);
  }, []);

  const clearLocal = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    if (!token) setSnapshot({ ...empty(null), owner: null, loaded: true });
  }, [token]);

  return { ...current, save, retry, clearLocal, discardUnreadablePending };
}
