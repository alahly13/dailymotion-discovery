"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getLocalDatabase } from "./indexeddb-store";
import {
  hydrateFromCloudAndMerge,
  readLocalWorkspaceSnapshot,
  type MergedWorkspaceSnapshot,
} from "@/lib/sync/cloud-hydration-service";
import { SyncCoordinator, subscribeLocalWorkspaceChanges } from "@/lib/sync/sync-coordinator";
import type { SaveReceipt } from "@/lib/sync/save-receipt";

const EMPTY_SNAPSHOT: MergedWorkspaceSnapshot = {
  savedItems: [],
  collections: [],
  collectionItems: [],
  savedSearches: [],
  searchHistory: [],
  researchNotes: [],
  pendingOperations: [],
  interruptedJournals: [],
  lastReceipt: null,
  lastCloudSyncAt: null,
};

let sharedCoordinator: SyncCoordinator | null = null;
export function getSharedSyncCoordinator(): SyncCoordinator {
  if (!sharedCoordinator) {
    sharedCoordinator = new SyncCoordinator(getLocalDatabase());
  }
  return sharedCoordinator;
}

/**
 * Reactive local-first workspace hook merging IndexedDB entities, outbox state,
 * interrupted sync journal warnings, and on-demand Cloudflare R2 + PostgreSQL hydration.
 */
export function useMergedDataset() {
  const coordinator = useMemo(() => getSharedSyncCoordinator(), []);
  const [snapshot, setSnapshot] = useState<MergedWorkspaceSnapshot>(EMPTY_SNAPSHOT);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await readLocalWorkspaceSnapshot(getLocalDatabase());
      setSnapshot(next);
      setReady(true);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : "Failed to read local IndexedDB state.");
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await coordinator.recoverInterruptedSyncs();
      await refresh();
    })();
    return subscribeLocalWorkspaceChanges(() => {
      void refresh();
    });
  }, [coordinator, refresh]);

  const savedKeys = useMemo(
    () => new Set(snapshot.savedItems.map((i) => i.compositeKey)),
    [snapshot.savedItems]
  );

  const favoriteKeys = useMemo(
    () => new Set(snapshot.savedItems.filter((i) => i.isFavorite).map((i) => i.compositeKey)),
    [snapshot.savedItems]
  );

  const saveAll = useCallback(async (): Promise<SaveReceipt> => {
    setSyncing(true);
    setLastError(null);
    try {
      const receipt = await coordinator.syncNow();
      if (receipt.stage === "FAILED") {
        setLastError(receipt.errorMessage ?? "Save All failed.");
      }
      await refresh();
      return receipt;
    } finally {
      setSyncing(false);
    }
  }, [coordinator, refresh]);

  const hydrateCloud = useCallback(async () => {
    setHydrating(true);
    setLastError(null);
    try {
      const result = await hydrateFromCloudAndMerge(getLocalDatabase());
      await refresh();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Cloud hydration failed.";
      setLastError(message);
      throw err;
    } finally {
      setHydrating(false);
    }
  }, [refresh]);

  return {
    ready,
    syncing,
    hydrating,
    lastError,
    coordinator,
    refresh,
    saveAll,
    hydrateCloud,
    savedKeys,
    favoriteKeys,
    pendingCount: snapshot.pendingOperations.length,
    ...snapshot,
  };
}
