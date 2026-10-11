// Discovery workspace store: search history, saved searches, saved items.
//
// What this controls: per-version/per-resource history + operator-saved
// searches/items, persisted in the browser (localStorage).
// Why it exists: each v1/v2 page keeps independent URL state for navigation;
// this store adds cross-page history without a database (no migration, no
// owner-scope risk — data never leaves the browser).
// Scope: discovery pages, /workspace, dashboard stats. Cap sizes to bound
// localStorage growth. Future agents: keep entries serializable.

"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ApiVersion, DiscoveryItem, DiscoveryResource } from "@/lib/discovery/types";

export interface HistoryEntry {
  id: string;
  version: ApiVersion;
  resource: DiscoveryResource;
  label: string;
  params: Record<string, string>;
  resultCount: number | null;
  createdAt: number;
}

export interface SavedSearch {
  id: string;
  version: ApiVersion;
  resource: DiscoveryResource;
  label: string;
  params: Record<string, string>;
  createdAt: number;
}

export interface SavedItem {
  item: DiscoveryItem;
  savedAt: number;
}

// Application-tracked usage counters (local, per browser — NOT official
// Dailymotion quota). Day boundary: UTC midnight. One user-submitted search
// = one search operation; outbound HTTP/API calls counted separately.
export interface VersionUsage {
  today: string;
  todaySearches: number;
  todaySuccess: number;
  todayFailed: number;
  todayApiCalls: number;
  totalSearches: number;
  totalSuccess: number;
  totalFailed: number;
  totalApiCalls: number;
  lastSuccessAt: number | null;
  lastRequestAt: number | null;
}

export function utcDayKey(when = Date.now()): string {
  return new Date(when).toISOString().slice(0, 10);
}

function freshUsage(today: string): VersionUsage {
  return {
    today, todaySearches: 0, todaySuccess: 0, todayFailed: 0, todayApiCalls: 0,
    totalSearches: 0, totalSuccess: 0, totalFailed: 0, totalApiCalls: 0,
    lastSuccessAt: null, lastRequestAt: null,
  };
}

// Per-version persistent default search preferences (Settings-owned).
// familyFilter tri-state: true = explicit on, false = deliberate opt-out,
// null = omit (API default ON = safe). Never coerce with `||` — false is valid.
export interface VersionSearchDefaults {
  pageSize: string;
  sort: string;
  familyFilter: boolean | null;
  localization: string;
  fields: string[] | null;
}

export const DEFAULT_VERSION_DEFAULTS: Record<ApiVersion, VersionSearchDefaults> = {
  v1: { pageSize: "20", sort: "relevance", familyFilter: null, localization: "detect", fields: null },
  v2: { pageSize: "20", sort: "-created_at", familyFilter: null, localization: "", fields: null },
};

interface DiscoveryWorkspaceState {
  history: HistoryEntry[];
  savedSearches: SavedSearch[];
  savedItems: SavedItem[];
  versionDefaults: Record<ApiVersion, VersionSearchDefaults>;
  usage: Record<ApiVersion, VersionUsage>;
  /** Unsynced local mutations since last successful cloud Save. */
  dirtyOps: number;
  lastSyncedAt: number | null;
  pendingBatchKey: string | null;
  addHistory: (entry: Omit<HistoryEntry, "id" | "createdAt">) => void;
  clearHistory: () => void;
  clearHistoryForVersion: (version: ApiVersion) => void;
  removeHistoryEntry: (id: string) => void;
  saveSearch: (entry: Omit<SavedSearch, "id" | "createdAt">) => string;
  removeSearch: (id: string) => void;
  saveItem: (item: DiscoveryItem) => void;
  removeItem: (version: ApiVersion, kind: string, id: string) => void;
  isItemSaved: (version: ApiVersion, kind: string, id: string) => boolean;
  setVersionDefaults: (version: ApiVersion, partial: Partial<VersionSearchDefaults>) => void;
  resetVersionDefaults: (version: ApiVersion) => void;
  lastSearchVersion: ApiVersion;
  setLastSearchVersion: (version: ApiVersion) => void;
  /** Record one user-submitted search (call once per submit, never per page/append). */
  recordSearchSubmitted: (version: ApiVersion) => void;
  /** Record its outcome; apiCalls = outbound HTTP calls observed for it. */
  recordSearchOutcome: (version: ApiVersion, ok: boolean, apiCalls?: number) => void;
  /** Add outbound calls to an in-flight search (pagination/appends). */
  recordApiCalls: (version: ApiVersion, count?: number) => void;
  ensureBatchKey: () => string;
  markSynced: () => void;
  acknowledgePending: () => void;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useDiscoveryWorkspace = create<DiscoveryWorkspaceState>()(
  persist(
    (set, get) => ({
      history: [],
      savedSearches: [],
      savedItems: [],
      versionDefaults: structuredClone(DEFAULT_VERSION_DEFAULTS),
      usage: { v1: freshUsage(utcDayKey()), v2: freshUsage(utcDayKey()) },
      dirtyOps: 0,
      lastSyncedAt: null,
      pendingBatchKey: null,
      lastSearchVersion: "v1",
      addHistory: (entry) =>
        set((state) => ({
          history: [{ ...entry, id: uid(), createdAt: Date.now() }, ...state.history].slice(0, 200),
          dirtyOps: state.dirtyOps + 1,
        })),
      clearHistory: () => set((state) => ({ history: [], dirtyOps: state.dirtyOps + 1 })),
      clearHistoryForVersion: (version) =>
        set((state) => ({ history: state.history.filter((h) => h.version !== version), dirtyOps: state.dirtyOps + 1 })),
      removeHistoryEntry: (id) => set((state) => ({ history: state.history.filter((h) => h.id !== id), dirtyOps: state.dirtyOps + 1 })),
      saveSearch: (entry) => {
        const id = uid();
        set((state) => ({
          savedSearches: [{ ...entry, id, createdAt: Date.now() }, ...state.savedSearches].slice(0, 100),
          dirtyOps: state.dirtyOps + 1,
        }));
        return id;
      },
      removeSearch: (id) => set((state) => ({ savedSearches: state.savedSearches.filter((s) => s.id !== id), dirtyOps: state.dirtyOps + 1 })),
      saveItem: (item) =>
        set((state) => {
          // Version-aware identity: same id on v1 and v2 are distinct records.
          if (state.savedItems.some((s) => s.item.apiVersion === item.apiVersion && s.item.kind === item.kind && s.item.id === item.id)) return state;
          return { savedItems: [{ item, savedAt: Date.now() }, ...state.savedItems].slice(0, 500), dirtyOps: state.dirtyOps + 1 };
        }),
      removeItem: (version, kind, id) =>
        set((state) => ({ savedItems: state.savedItems.filter((s) => !(s.item.apiVersion === version && s.item.kind === kind && s.item.id === id)), dirtyOps: state.dirtyOps + 1 })),
      isItemSaved: (version, kind, id) => get().savedItems.some((s) => s.item.apiVersion === version && s.item.kind === kind && s.item.id === id),
      setVersionDefaults: (version, partial) =>
        set((state) => ({ versionDefaults: { ...state.versionDefaults, [version]: { ...state.versionDefaults[version], ...partial } } })),
      resetVersionDefaults: (version) =>
        set((state) => ({ versionDefaults: { ...state.versionDefaults, [version]: structuredClone(DEFAULT_VERSION_DEFAULTS[version]) } })),
      setLastSearchVersion: (version) => set({ lastSearchVersion: version }),
      ensureBatchKey: () => {
        const existing = get().pendingBatchKey;
        if (existing) return existing;
        const key = uid();
        set({ pendingBatchKey: key });
        return key;
      },
      markSynced: () => set({ dirtyOps: 0, lastSyncedAt: Date.now(), pendingBatchKey: null }),
      acknowledgePending: () => set({ dirtyOps: 0, pendingBatchKey: null }),
      recordSearchSubmitted: (version) =>
        set((state) => {
          const today = utcDayKey();
          const prev = state.usage[version].today === today ? state.usage[version] : { ...freshUsage(today), totalSearches: state.usage[version].totalSearches, totalSuccess: state.usage[version].totalSuccess, totalFailed: state.usage[version].totalFailed, totalApiCalls: state.usage[version].totalApiCalls, lastSuccessAt: state.usage[version].lastSuccessAt, lastRequestAt: state.usage[version].lastRequestAt };
          return { usage: { ...state.usage, [version]: { ...prev, todaySearches: prev.todaySearches + 1, totalSearches: prev.totalSearches + 1, lastRequestAt: Date.now() } } };
        }),
      recordSearchOutcome: (version, ok, apiCalls = 1) =>
        set((state) => {
          const today = utcDayKey();
          const prev = state.usage[version].today === today ? state.usage[version] : { ...freshUsage(today), totalSearches: state.usage[version].totalSearches, totalSuccess: state.usage[version].totalSuccess, totalFailed: state.usage[version].totalFailed, totalApiCalls: state.usage[version].totalApiCalls, lastSuccessAt: state.usage[version].lastSuccessAt, lastRequestAt: state.usage[version].lastRequestAt };
          const calls = Number.isFinite(apiCalls) && apiCalls > 0 ? Math.trunc(apiCalls) : 1;
          return {
            usage: {
              ...state.usage,
              [version]: {
                ...prev,
                todayApiCalls: prev.todayApiCalls + calls,
                totalApiCalls: prev.totalApiCalls + calls,
                todaySuccess: prev.todaySuccess + (ok ? 1 : 0),
                totalSuccess: prev.totalSuccess + (ok ? 1 : 0),
                todayFailed: prev.todayFailed + (ok ? 0 : 1),
                totalFailed: prev.totalFailed + (ok ? 0 : 1),
                lastSuccessAt: ok ? Date.now() : prev.lastSuccessAt,
                lastRequestAt: Date.now(),
              },
            },
          };
        }),
      recordApiCalls: (version, count = 1) =>
        set((state) => {
          const today = utcDayKey();
          const prev = state.usage[version].today === today ? state.usage[version] : { ...freshUsage(today), totalSearches: state.usage[version].totalSearches, totalSuccess: state.usage[version].totalSuccess, totalFailed: state.usage[version].totalFailed, totalApiCalls: state.usage[version].totalApiCalls, lastSuccessAt: state.usage[version].lastSuccessAt, lastRequestAt: Date.now() };
          const calls = Number.isFinite(count) && count > 0 ? Math.trunc(count) : 1;
          return { usage: { ...state.usage, [version]: { ...prev, todayApiCalls: prev.todayApiCalls + calls, totalApiCalls: prev.totalApiCalls + calls, lastRequestAt: Date.now() } } };
        }),
    }),
    {
      name: "dailymotion-discovery-workspace",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ history: state.history, savedSearches: state.savedSearches, savedItems: state.savedItems, versionDefaults: state.versionDefaults, lastSearchVersion: state.lastSearchVersion, usage: state.usage, dirtyOps: state.dirtyOps, lastSyncedAt: state.lastSyncedAt, pendingBatchKey: state.pendingBatchKey }),
    }
  )
);
