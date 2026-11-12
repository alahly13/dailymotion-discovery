import {
  getLocalDatabase,
  LOCAL_STORES,
  migrateLegacyLocalStorageIfNeeded,
  type LocalCollectionItemRecord,
  type LocalCollectionRecord,
  type LocalResearchNoteRecord,
  type LocalSavedItemRecord,
  type LocalSavedSearchRecord,
  type LocalSearchHistoryRecord,
  type LocalStoreAdapter,
  type LocalSyncMetadataRecord,
  type PendingOutboxOperation,
  type SyncJournalEntry,
} from "@/lib/local-first/indexeddb-store";
import type { SaveReceipt } from "./save-receipt";

/**
 * Cloud hydration + deterministic local/remote dataset reconciliation.
 *
 * Precedence rule:
 *   - Uncommitted local outbox deletions act as tombstones (prevent stale cloud records from
 *     resurrecting locally until `syncNow()` commits).
 *   - Uncommitted local outbox upserts override older cloud copies by timestamp/key.
 *   - Otherwise newest `updatedAt` wins, unioning both sources cleanly without losing work.
 */

export interface CloudHydrationPayload {
  ok: boolean;
  source: "r2-worker" | "postgres" | "empty";
  hydratedAt: string;
  datasets: {
    savedItems: LocalSavedItemRecord[];
    collections: LocalCollectionRecord[];
    collectionItems: LocalCollectionItemRecord[];
    savedSearches: LocalSavedSearchRecord[];
    searchHistory: LocalSearchHistoryRecord[];
    researchNotes: LocalResearchNoteRecord[];
  };
  warnings?: string[];
}

export interface MergedWorkspaceSnapshot {
  savedItems: LocalSavedItemRecord[];
  collections: LocalCollectionRecord[];
  collectionItems: LocalCollectionItemRecord[];
  savedSearches: LocalSavedSearchRecord[];
  searchHistory: LocalSearchHistoryRecord[];
  researchNotes: LocalResearchNoteRecord[];
  pendingOperations: PendingOutboxOperation[];
  interruptedJournals: SyncJournalEntry[];
  lastReceipt: SaveReceipt | null;
  lastCloudSyncAt: string | null;
}

function mergeByKey<T>(
  localItems: T[],
  remoteItems: T[],
  getKey: (item: T) => string,
  tombstones: Set<string>,
  localOverrides: Set<string>,
  getUpdatedAt?: (item: T) => string | undefined
): T[] {
  const merged = new Map<string, T>();

  for (const r of remoteItems) {
    const key = getKey(r);
    if (!tombstones.has(key)) {
      merged.set(key, r);
    }
  }

  for (const l of localItems) {
    const key = getKey(l);
    if (tombstones.has(key)) continue;
    const remote = merged.get(key);
    if (!remote || localOverrides.has(key)) {
      merged.set(key, l);
      continue;
    }
    if (getUpdatedAt) {
      const lTime = getUpdatedAt(l) ?? "";
      const rTime = getUpdatedAt(remote) ?? "";
      if (lTime >= rTime) {
        merged.set(key, l);
      }
    } else {
      merged.set(key, l);
    }
  }

  return Array.from(merged.values());
}

export async function readLocalWorkspaceSnapshot(db: LocalStoreAdapter = getLocalDatabase()): Promise<MergedWorkspaceSnapshot> {
  await migrateLegacyLocalStorageIfNeeded(db);

  const [
    savedItems,
    collections,
    collectionItems,
    savedSearches,
    searchHistory,
    researchNotes,
    pendingOperations,
    journals,
    lastReceiptMeta,
    lastSyncMeta,
  ] = await Promise.all([
    db.getAll<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS),
    db.getAll<LocalCollectionRecord>(LOCAL_STORES.COLLECTIONS),
    db.getAll<LocalCollectionItemRecord>(LOCAL_STORES.COLLECTION_ITEMS),
    db.getAll<LocalSavedSearchRecord>(LOCAL_STORES.SAVED_SEARCHES),
    db.getAll<LocalSearchHistoryRecord>(LOCAL_STORES.SEARCH_HISTORY),
    db.getAll<LocalResearchNoteRecord>(LOCAL_STORES.RESEARCH_NOTES),
    db.getAll<PendingOutboxOperation>(LOCAL_STORES.PENDING_OPERATIONS),
    db.getAll<SyncJournalEntry>(LOCAL_STORES.SYNC_JOURNAL),
    db.get<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, "last_save_receipt"),
    db.get<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, "last_cloud_sync_at"),
  ]);

  return {
    savedItems: [...savedItems].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || "")),
    collections: [...collections].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
    collectionItems: [...collectionItems].sort((a, b) => a.position - b.position),
    savedSearches: [...savedSearches].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    }),
    searchHistory: [...searchHistory].sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || "")),
    researchNotes,
    pendingOperations,
    interruptedJournals: journals.filter((j) => j.status === "interrupted"),
    lastReceipt: (lastReceiptMeta?.value as SaveReceipt | undefined) ?? null,
    lastCloudSyncAt: (lastSyncMeta?.value as string | undefined) ?? null,
  };
}

export async function hydrateFromCloudAndMerge(
  db: LocalStoreAdapter = getLocalDatabase(),
  fetchFn: typeof fetch = (...args) => globalThis.fetch(...args)
): Promise<{ payload: CloudHydrationPayload; mergedCount: number }> {
  const response = await fetchFn("/api/sync/hydrate", { method: "GET", cache: "no-store" });
  const payload = (await response.json()) as CloudHydrationPayload;
  if (!response.ok || !payload.ok) {
    throw new Error("Cloud hydration request failed.");
  }

  const pendingOps = await db.getAll<PendingOutboxOperation>(LOCAL_STORES.PENDING_OPERATIONS);
  const tombstonesFor = (type: PendingOutboxOperation["entityType"]) =>
    new Set(pendingOps.filter((o) => o.entityType === type && o.action === "delete").map((o) => o.entityKey));
  const overridesFor = (type: PendingOutboxOperation["entityType"]) =>
    new Set(pendingOps.filter((o) => o.entityType === type && o.action !== "delete").map((o) => o.entityKey));

  const [localSaved, localCols, localColItems, localPresets, localHistory, localNotes] = await Promise.all([
    db.getAll<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS),
    db.getAll<LocalCollectionRecord>(LOCAL_STORES.COLLECTIONS),
    db.getAll<LocalCollectionItemRecord>(LOCAL_STORES.COLLECTION_ITEMS),
    db.getAll<LocalSavedSearchRecord>(LOCAL_STORES.SAVED_SEARCHES),
    db.getAll<LocalSearchHistoryRecord>(LOCAL_STORES.SEARCH_HISTORY),
    db.getAll<LocalResearchNoteRecord>(LOCAL_STORES.RESEARCH_NOTES),
  ]);

  const mergedSaved = mergeByKey(
    localSaved,
    payload.datasets.savedItems,
    (x) => x.compositeKey,
    tombstonesFor("saved_item"),
    overridesFor("saved_item"),
    (x) => x.updatedAt
  );
  const mergedCols = mergeByKey(
    localCols,
    payload.datasets.collections,
    (x) => x.id,
    tombstonesFor("collection"),
    overridesFor("collection"),
    (x) => x.updatedAt
  );
  const mergedColItems = mergeByKey(
    localColItems,
    payload.datasets.collectionItems,
    (x) => x.id,
    tombstonesFor("collection_item"),
    overridesFor("collection_item")
  );
  const mergedPresets = mergeByKey(
    localPresets,
    payload.datasets.savedSearches,
    (x) => x.id,
    tombstonesFor("saved_search"),
    overridesFor("saved_search"),
    (x) => x.updatedAt
  );
  const mergedHistory = mergeByKey(
    localHistory,
    payload.datasets.searchHistory,
    (x) => x.id,
    tombstonesFor("search_history"),
    overridesFor("search_history")
  );
  const mergedNotes = mergeByKey(
    localNotes,
    payload.datasets.researchNotes,
    (x) => x.id,
    tombstonesFor("research_note"),
    overridesFor("research_note"),
    (x) => x.updatedAt
  );

  await Promise.all([
    db.clear(LOCAL_STORES.SAVED_ITEMS).then(() => db.putMany(LOCAL_STORES.SAVED_ITEMS, mergedSaved)),
    db.clear(LOCAL_STORES.COLLECTIONS).then(() => db.putMany(LOCAL_STORES.COLLECTIONS, mergedCols)),
    db.clear(LOCAL_STORES.COLLECTION_ITEMS).then(() => db.putMany(LOCAL_STORES.COLLECTION_ITEMS, mergedColItems)),
    db.clear(LOCAL_STORES.SAVED_SEARCHES).then(() => db.putMany(LOCAL_STORES.SAVED_SEARCHES, mergedPresets)),
    db.clear(LOCAL_STORES.SEARCH_HISTORY).then(() => db.putMany(LOCAL_STORES.SEARCH_HISTORY, mergedHistory)),
    db.clear(LOCAL_STORES.RESEARCH_NOTES).then(() => db.putMany(LOCAL_STORES.RESEARCH_NOTES, mergedNotes)),
  ]);

  await db.put<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, {
    key: "last_hydrated_at",
    value: payload.hydratedAt,
    updatedAt: new Date().toISOString(),
  });

  return {
    payload,
    mergedCount:
      mergedSaved.length + mergedCols.length + mergedColItems.length + mergedPresets.length + mergedHistory.length,
  };
}
