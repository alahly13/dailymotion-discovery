import type { DiscoveryItem } from "@/lib/discovery/types";
import {
  createDailymotionProvenance,
  type DailymotionSourceMetadata,
} from "@/lib/discovery/provenance";
import {
  classifyDiscoveryItem,
  discoveryCompositeKey,
  type DailymotionResourceType,
} from "@/lib/resources/dailymotion-resource-taxonomy";

/**
 * Local-First IndexedDB persistence engine (`dailymotion_discovery_local_v1`).
 *
 * Designed around an explicit store adapter so:
 *   1. Browsers persist durably to native IndexedDB (never localStorage blobs for large datasets).
 *   2. Node unit tests execute identical repository, outbox, and merge logic via `createMemoryLocalDatabase()`.
 *   3. Existing Zustand `dailymotion-discovery-workspace` localStorage records migrate once non-destructively.
 */

export const LOCAL_IDB_NAME = "dailymotion_discovery_local_v1";
export const LOCAL_IDB_VERSION = 3;

export const LOCAL_STORES = {
  SAVED_ITEMS: "entities_saved_items",
  COLLECTIONS: "entities_collections",
  COLLECTION_ITEMS: "entities_collection_items",
  SAVED_SEARCHES: "entities_saved_searches",
  SEARCH_HISTORY: "entities_search_history",
  RESEARCH_NOTES: "entities_research_notes",
  PENDING_OPERATIONS: "pending_operations",
  LOCAL_SYNC_METADATA: "local_sync_metadata",
  SYNC_JOURNAL: "sync_journal",
  SEARCH_SNAPSHOTS: "search_snapshots",
  SEARCH_SNAPSHOT_PAGES: "search_snapshot_pages",
  SAVED_TITLES: "entities_saved_titles",
} as const;

export type LocalStoreName = (typeof LOCAL_STORES)[keyof typeof LOCAL_STORES];

export function buildStableDailymotionId(resourceType: string, id: string): string {
  const cleanType = resourceType === "channel" || resourceType === "user" ? "channel" : "video";
  return `dailymotion:${cleanType}:${(id || "").trim().toLowerCase()}`;
}

export interface LocalSavedItemRecord {
  compositeKey: string;
  stableId: string;
  provider: "dailymotion";
  id: string;
  apiVersion: "v1" | "v2";
  resourceType: DailymotionResourceType;
  title: string;
  description?: string;
  url: string;
  thumbnail?: string;
  ownerName?: string;
  ownerId?: string;
  duration?: number;
  viewsTotal?: number;
  likesTotal?: number;
  createdTime?: string;
  explicit?: boolean;
  isForKids?: boolean;
  isFavorite?: boolean;
  country?: string;
  category?: string;
  sourcePage?: string;
  sourceQuery?: string;
  sourceFilters?: Record<string, unknown>;
  syncStatus: "local_only" | "pending_upload" | "uploading" | "cloud_verified" | "sync_failed";
  collectionIds?: string[];
  tags: string[];
  note?: string;
  snapshot: DiscoveryItem;
  provenance?: DailymotionSourceMetadata;
  savedAt: string;
  updatedAt: string;
}

export interface LocalCollectionRecord {
  id: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LocalCollectionItemRecord {
  id: string; // `${collectionId}::${itemKey}`
  collectionId: string;
  itemKey: string;
  resourceType: DailymotionResourceType;
  apiVersion: "v1" | "v2";
  position: number;
  note?: string;
  snapshot: DiscoveryItem;
  provenance?: DailymotionSourceMetadata;
  addedAt: string;
}

export interface LocalSavedSearchRecord {
  id: string;
  name: string;
  apiVersion: "v1" | "v2";
  resource: string;
  mode: string;
  query: string;
  apiParams: Record<string, string>;
  localFilters: Record<string, unknown>;
  tags: string[];
  pinned: boolean;
  cachedSnapshot?: {
    capturedAt: string;
    totalFetched: number;
    items: DiscoveryItem[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface LocalSearchHistoryRecord {
  id: string;
  apiVersion: "v1" | "v2";
  resource: string;
  mode: string;
  query: string;
  apiParams: Record<string, string>;
  localFilters?: Record<string, unknown>;
  resultCount: number;
  submittedAt: string;
  snapshotItems?: DiscoveryItem[];
}

export interface LocalResearchNoteRecord {
  id: string;
  targetKey: string;
  content: string;
  updatedAt: string;
}

export interface LocalSearchSnapshotRecord {
  id: string; // e.g. `snap_${Date.now()}_${random}`
  query: string;
  route: string; // e.g. `/global-search`, `/link-explorer`
  workspace?: "global_search" | "link_explorer" | string;
  ownerId?: string;
  apiVersion: "v1" | "v2";
  resourceType: string; // "ALL", "video", "channel", "playlist", "user", "livestream"
  mode: string; // "search", "channel_videos", "ai_semantic", "tag", etc.
  apiParams: Record<string, unknown>;
  localFilters?: Record<string, unknown>;
  totalResults: number;
  pageCount: number;
  currentPage?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
  capturedAt: string; // ISO string
  updatedAt?: string;
  expiresAt: number; // epoch ms when this snapshot expires
  schemaVersion?: number;
  provenance?: DailymotionSourceMetadata;
  previewThumbnails?: string[]; // up to 4 thumbnail URLs for card preview
  previewTitles?: string[]; // up to 3 titles for UI preview
}

export interface LocalSearchSnapshotPageRecord {
  id: string; // `${snapshotId}::page::${pageIndex}`
  snapshotId: string;
  pageIndex: number;
  rawJson: unknown; // Full untouched Dailymotion API response payload (ZERO media binaries)
  normalizedItems: DiscoveryItem[];
  capturedAt: string;
  apiVersion?: "v1" | "v2";
  provenance?: DailymotionSourceMetadata;
}

export interface PendingOutboxOperation {
  operationId: string;
  idempotencyKey: string;
  entityType:
    | "saved_item"
    | "collection"
    | "collection_item"
    | "saved_search"
    | "search_history"
    | "research_note";
  action: "upsert" | "delete" | "reorder";
  entityKey: string;
  payload: Record<string, unknown>;
  status: "pending" | "syncing" | "failed";
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSyncMetadataRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface SyncJournalEntry {
  journalId: string;
  batchId: string;
  status: "in_progress" | "completed" | "interrupted" | "failed";
  operationIds: string[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface LocalStoreAdapter {
  getAll<T>(store: LocalStoreName): Promise<T[]>;
  get<T>(store: LocalStoreName, key: string): Promise<T | undefined>;
  put<T>(store: LocalStoreName, record: T): Promise<void>;
  putMany<T>(store: LocalStoreName, records: T[]): Promise<void>;
  delete(store: LocalStoreName, key: string): Promise<void>;
  clear(store: LocalStoreName): Promise<void>;
}

const KEY_PATHS: Record<LocalStoreName, string> = {
  [LOCAL_STORES.SAVED_ITEMS]: "compositeKey",
  [LOCAL_STORES.COLLECTIONS]: "id",
  [LOCAL_STORES.COLLECTION_ITEMS]: "id",
  [LOCAL_STORES.SAVED_SEARCHES]: "id",
  [LOCAL_STORES.SEARCH_HISTORY]: "id",
  [LOCAL_STORES.RESEARCH_NOTES]: "id",
  [LOCAL_STORES.PENDING_OPERATIONS]: "operationId",
  [LOCAL_STORES.LOCAL_SYNC_METADATA]: "key",
  [LOCAL_STORES.SYNC_JOURNAL]: "journalId",
  [LOCAL_STORES.SEARCH_SNAPSHOTS]: "id",
  [LOCAL_STORES.SEARCH_SNAPSHOT_PAGES]: "id",
  [LOCAL_STORES.SAVED_TITLES]: "id",
};

/**
 * In-memory deterministic LocalStoreAdapter for Node unit tests and SSR safe fallbacks.
 */
export function createMemoryLocalDatabase(): LocalStoreAdapter {
  const tables = new Map<LocalStoreName, Map<string, unknown>>();
  for (const store of Object.values(LOCAL_STORES)) {
    tables.set(store, new Map());
  }

  return {
    async getAll<T>(store: LocalStoreName): Promise<T[]> {
      return Array.from(tables.get(store)?.values() ?? []).map((v) => structuredClone(v) as T);
    },
    async get<T>(store: LocalStoreName, key: string): Promise<T | undefined> {
      const val = tables.get(store)?.get(key);
      return val === undefined ? undefined : (structuredClone(val) as T);
    },
    async put<T>(store: LocalStoreName, record: T): Promise<void> {
      const keyField = KEY_PATHS[store];
      const key = String((record as Record<string, unknown>)[keyField]);
      tables.get(store)?.set(key, structuredClone(record));
    },
    async putMany<T>(store: LocalStoreName, records: T[]): Promise<void> {
      const keyField = KEY_PATHS[store];
      const table = tables.get(store);
      if (!table) return;
      for (const rec of records) {
        const key = String((rec as Record<string, unknown>)[keyField]);
        table.set(key, structuredClone(rec));
      }
    },
    async delete(store: LocalStoreName, key: string): Promise<void> {
      tables.get(store)?.delete(key);
    },
    async clear(store: LocalStoreName): Promise<void> {
      tables.get(store)?.clear();
    },
  };
}

let cachedBrowserAdapter: LocalStoreAdapter | null = null;

function openNativeIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(LOCAL_IDB_NAME, LOCAL_IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const storeName of Object.values(LOCAL_STORES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const os = db.createObjectStore(storeName, { keyPath: KEY_PATHS[storeName] });
          if (storeName === LOCAL_STORES.SEARCH_SNAPSHOTS) {
            os.createIndex("by_expiresAt", "expiresAt", { unique: false });
            os.createIndex("by_capturedAt", "capturedAt", { unique: false });
            os.createIndex("by_route", "route", { unique: false });
          } else if (storeName === LOCAL_STORES.SEARCH_SNAPSHOT_PAGES) {
            os.createIndex("by_snapshotId", "snapshotId", { unique: false });
          } else if (storeName === LOCAL_STORES.SAVED_TITLES) {
            os.createIndex("by_ownerId", "ownerId", { unique: false });
            os.createIndex("by_status", "status", { unique: false });
            os.createIndex("by_createdAt", "createdAt", { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export function getLocalDatabase(): LocalStoreAdapter {
  if (typeof window === "undefined" || typeof window.indexedDB === "undefined") {
    if (!cachedBrowserAdapter) cachedBrowserAdapter = createMemoryLocalDatabase();
    return cachedBrowserAdapter;
  }
  if (cachedBrowserAdapter) return cachedBrowserAdapter;

  const dbPromise = openNativeIndexedDB();

  const runTx = async <R>(
    store: LocalStoreName,
    mode: IDBTransactionMode,
    executor: (os: IDBObjectStore) => IDBRequest<R> | void
  ): Promise<R> => {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      const req = executor(os);
      let reqResult: R;
      if (req) {
        req.onsuccess = () => {
          reqResult = req.result;
        };
        req.onerror = () => reject(req.error);
      }
      tx.oncomplete = () => resolve(reqResult);
      tx.onerror = () => reject(tx.error ?? new Error(`IndexedDB tx error on ${store}`));
      tx.onabort = () => reject(tx.error ?? new Error(`IndexedDB tx aborted on ${store}`));
    });
  };

  cachedBrowserAdapter = {
    async getAll<T>(store: LocalStoreName): Promise<T[]> {
      return runTx<T[]>(store, "readonly", (os) => os.getAll() as IDBRequest<T[]>);
    },
    async get<T>(store: LocalStoreName, key: string): Promise<T | undefined> {
      return runTx<T | undefined>(store, "readonly", (os) => os.get(key) as IDBRequest<T | undefined>);
    },
    async put<T>(store: LocalStoreName, record: T): Promise<void> {
      await runTx(store, "readwrite", (os) => os.put(record));
    },
    async putMany<T>(store: LocalStoreName, records: T[]): Promise<void> {
      if (records.length === 0) return;
      const db = await dbPromise;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const os = tx.objectStore(store);
        for (const rec of records) {
          os.put(rec);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async delete(store: LocalStoreName, key: string): Promise<void> {
      await runTx(store, "readwrite", (os) => os.delete(key));
    },
    async clear(store: LocalStoreName): Promise<void> {
      await runTx(store, "readwrite", (os) => os.clear());
    },
  };

  return cachedBrowserAdapter;
}

export function buildLocalSavedItemRecord(
  item: DiscoveryItem,
  options?: {
    isFavorite?: boolean;
    tags?: string[];
    note?: string;
    savedAt?: string;
    country?: string;
    category?: string;
    sourcePage?: string;
    sourceQuery?: string;
    sourceFilters?: Record<string, unknown>;
    collectionIds?: string[];
    syncStatus?: "local_only" | "pending_upload" | "uploading" | "cloud_verified" | "sync_failed";
  }
): LocalSavedItemRecord {
  const now = new Date().toISOString();
  const extra = (item.extra ?? {}) as Record<string, unknown>;
  const likes = typeof extra.likes_total === "number" ? extra.likes_total : undefined;
  const resType = classifyDiscoveryItem(item);
  const stableId = buildStableDailymotionId(resType, item.id);
  const country = options?.country || (typeof extra.country === "string" ? extra.country : undefined);
  const category = options?.category || (typeof extra.channel === "string" ? extra.channel : undefined);

  return {
    compositeKey: discoveryCompositeKey(item.apiVersion, item.kind, item.id),
    stableId,
    provider: "dailymotion",
    id: item.id,
    apiVersion: item.apiVersion,
    resourceType: resType,
    title: item.title || item.description || item.id,
    description: item.description ?? undefined,
    url: item.url || "",
    thumbnail: item.thumbnail ?? undefined,
    ownerName: item.ownerName ?? undefined,
    ownerId: item.ownerId ?? undefined,
    duration: item.duration ?? undefined,
    viewsTotal: item.views ?? undefined,
    likesTotal: likes,
    createdTime: item.createdAt ?? undefined,
    explicit: Boolean(extra.explicit ?? extra.is_explicit),
    isForKids: Boolean(extra.is_created_for_kids ?? extra.is_for_kids),
    isFavorite: options?.isFavorite ?? false,
    country,
    category,
    sourcePage: options?.sourcePage,
    sourceQuery: options?.sourceQuery,
    sourceFilters: options?.sourceFilters,
    syncStatus: options?.syncStatus || "local_only",
    collectionIds: options?.collectionIds || [],
    tags: options?.tags ?? item.tags ?? [],
    note: options?.note,
    snapshot: item,
    provenance: item.provenance || createDailymotionProvenance({
      apiVersion: item.apiVersion,
      resourceType: resType,
      resourceId: item.id,
    }),
    savedAt: options?.savedAt ?? now,
    updatedAt: now,
  };
}

/**
 * Non-destructively migrates legacy `dailymotion-discovery-workspace` localStorage state
 * into IndexedDB on first load so previously saved items, presets, and search history carry over.
 */
export async function migrateLegacyLocalStorageIfNeeded(db: LocalStoreAdapter = getLocalDatabase()): Promise<boolean> {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
  const sentinel = await db.get<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, "migrated_from_localstorage_v1");
  if (sentinel) return false;

  try {
    const raw = window.localStorage.getItem("dailymotion-discovery-workspace");
    if (raw) {
      const parsed = JSON.parse(raw) as {
        state?: {
          savedItems?: Array<DiscoveryItem & { savedAt?: string; tags?: string[] }>;
          presets?: Array<{
            id: string;
            name: string;
            version: "v1" | "v2";
            resource: string;
            query: string;
            params?: Record<string, string>;
            createdAt?: string;
          }>;
          history?: Array<{
            id: string;
            version: "v1" | "v2";
            resource: string;
            mode?: string;
            query: string;
            params?: Record<string, string>;
            resultCount?: number;
            timestamp?: string;
            cachedResults?: DiscoveryItem[];
          }>;
        };
      };

      const st = parsed?.state;
      if (st?.savedItems?.length) {
        const recs = st.savedItems.map((entry) =>
          buildLocalSavedItemRecord(entry, { tags: entry.tags ?? [], savedAt: entry.savedAt })
        );
        await db.putMany(LOCAL_STORES.SAVED_ITEMS, recs);
      }

      if (st?.presets?.length) {
        const now = new Date().toISOString();
        const presetRecs: LocalSavedSearchRecord[] = st.presets.map((p) => ({
          id: p.id,
          name: p.name,
          apiVersion: p.version,
          resource: p.resource,
          mode: "search",
          query: p.query,
          apiParams: p.params ?? {},
          localFilters: {},
          tags: [],
          pinned: false,
          createdAt: p.createdAt ?? now,
          updatedAt: p.createdAt ?? now,
        }));
        await db.putMany(LOCAL_STORES.SAVED_SEARCHES, presetRecs);
      }

      if (st?.history?.length) {
        const histRecs: LocalSearchHistoryRecord[] = st.history.map((h) => ({
          id: h.id,
          apiVersion: h.version,
          resource: h.resource,
          mode: h.mode ?? "search",
          query: h.query,
          apiParams: h.params ?? {},
          resultCount: h.resultCount ?? 0,
          submittedAt: h.timestamp ?? new Date().toISOString(),
          snapshotItems: h.cachedResults,
        }));
        await db.putMany(LOCAL_STORES.SEARCH_HISTORY, histRecs);
      }
    }
  } catch {
    // Non-fatal: mark sentinel anyway so broken localStorage never traps hydration.
  }

  await db.put<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, {
    key: "migrated_from_localstorage_v1",
    value: true,
    updatedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Persists a complete search snapshot and its raw API response pages to IndexedDB.
 * INVARIANT: Never stores video/audio/thumbnail binary blobs; stores metadata & URLs only.
 */
export async function saveSearchSnapshot(
  snapshot: LocalSearchSnapshotRecord,
  pages: LocalSearchSnapshotPageRecord[],
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  await db.put(LOCAL_STORES.SEARCH_SNAPSHOTS, snapshot);
  if (pages.length > 0) {
    await db.putMany(LOCAL_STORES.SEARCH_SNAPSHOT_PAGES, pages);
  }
}

/**
 * Retrieves a search snapshot by ID.
 */
export async function getSearchSnapshot(
  id: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<LocalSearchSnapshotRecord | undefined> {
  return db.get<LocalSearchSnapshotRecord>(LOCAL_STORES.SEARCH_SNAPSHOTS, id);
}

/**
 * Retrieves all pages for a given search snapshot, ordered by pageIndex ascending.
 */
export async function getSearchSnapshotPages(
  snapshotId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<LocalSearchSnapshotPageRecord[]> {
  const allPages = await db.getAll<LocalSearchSnapshotPageRecord>(LOCAL_STORES.SEARCH_SNAPSHOT_PAGES);
  return allPages
    .filter((p) => p.snapshotId === snapshotId)
    .sort((a, b) => a.pageIndex - b.pageIndex);
}

/**
 * Lists all search snapshots, optionally filtering out expired ones.
 * Results are sorted by capturedAt descending (most recent first).
 */
export async function listSearchSnapshots(
  options?: { includeExpired?: boolean },
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<LocalSearchSnapshotRecord[]> {
  const now = Date.now();
  const all = await db.getAll<LocalSearchSnapshotRecord>(LOCAL_STORES.SEARCH_SNAPSHOTS);
  const filtered = options?.includeExpired
    ? all
    : all.filter((s) => typeof s.expiresAt !== "number" || s.expiresAt > now);
  return filtered.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
}

/**
 * Deletes a single search snapshot and its associated raw JSON pages.
 */
export async function deleteSearchSnapshot(
  snapshotId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  await db.delete(LOCAL_STORES.SEARCH_SNAPSHOTS, snapshotId);
  const pages = await getSearchSnapshotPages(snapshotId, db);
  for (const page of pages) {
    await db.delete(LOCAL_STORES.SEARCH_SNAPSHOT_PAGES, page.id);
  }
}

/**
 * Opportunistically purges expired search snapshots and their raw JSON pages.
 * SAFETY INVARIANT: Strictly touches ONLY SEARCH_SNAPSHOTS and SEARCH_SNAPSHOT_PAGES;
 * NEVER modifies or deletes Saved Items, Collections, or Sync Journal records.
 */
export async function cleanExpiredSearchSnapshots(
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<number> {
  const now = Date.now();
  const all = await db.getAll<LocalSearchSnapshotRecord>(LOCAL_STORES.SEARCH_SNAPSHOTS);
  const expired = all.filter((s) => typeof s.expiresAt === "number" && s.expiresAt <= now);
  for (const s of expired) {
    await deleteSearchSnapshot(s.id, db);
  }
  return expired.length;
}

/**
 * Persists the latest active snapshot pointer for a workspace and authenticated owner.
 */
export async function setLatestSearchPointer(
  workspace: string,
  snapshotId: string,
  options?: { apiVersion?: "v1" | "v2"; ownerId?: string },
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  const owner = options?.ownerId || "default_owner";
  const now = new Date().toISOString();

  // General workspace pointer
  await db.put<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, {
    key: `latest_search::${owner}::${workspace}`,
    value: { snapshotId, updatedAt: now },
    updatedAt: now,
  });

  // Version-specific workspace pointer if apiVersion provided
  if (options?.apiVersion) {
    await db.put<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, {
      key: `latest_search::${owner}::${workspace}::${options.apiVersion}`,
      value: { snapshotId, updatedAt: now },
      updatedAt: now,
    });
  }
}

/**
 * Retrieves the latest active snapshot pointer for a workspace and authenticated owner.
 */
export async function getLatestSearchPointer(
  workspace: string,
  options?: { apiVersion?: "v1" | "v2"; ownerId?: string },
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<string | null> {
  const owner = options?.ownerId || "default_owner";
  if (options?.apiVersion) {
    const versionRecord = await db.get<LocalSyncMetadataRecord>(
      LOCAL_STORES.LOCAL_SYNC_METADATA,
      `latest_search::${owner}::${workspace}::${options.apiVersion}`
    );
    if (versionRecord?.value && typeof versionRecord.value === "object") {
      const snapId = (versionRecord.value as { snapshotId?: string }).snapshotId;
      if (snapId) return snapId;
    }
  }

  const generalRecord = await db.get<LocalSyncMetadataRecord>(
    LOCAL_STORES.LOCAL_SYNC_METADATA,
    `latest_search::${owner}::${workspace}`
  );
  if (generalRecord?.value && typeof generalRecord.value === "object") {
    const snapId = (generalRecord.value as { snapshotId?: string }).snapshotId;
    if (snapId) return snapId;
  }

  return null;
}

/**
 * Requests persistent storage from the browser Storage API (if supported)
 * to prevent browser eviction of IndexedDB records.
 */
export async function requestBrowserPersistentStorage(): Promise<{
  persisted: boolean;
  quota?: { usage?: number; quota?: number };
}> {
  if (typeof window === "undefined" || !navigator?.storage) {
    return { persisted: false };
  }
  try {
    let persisted = false;
    if (typeof navigator.storage.persisted === "function") {
      persisted = await navigator.storage.persisted();
    }
    if (!persisted && typeof navigator.storage.persist === "function") {
      persisted = await navigator.storage.persist();
    }
    let quota: { usage?: number; quota?: number } | undefined;
    if (typeof navigator.storage.estimate === "function") {
      const est = await navigator.storage.estimate();
      quota = { usage: est.usage, quota: est.quota };
    }
    return { persisted, quota };
  } catch {
    return { persisted: false };
  }
}

/**
 * Returns record counts for all stores in the local discovery database.
 */
export async function getDiscoveryDatabaseStats(
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  for (const storeName of Object.values(LOCAL_STORES)) {
    try {
      const records = await db.getAll(storeName);
      stats[storeName] = records.length;
    } catch {
      stats[storeName] = 0;
    }
  }
  return stats;
}

