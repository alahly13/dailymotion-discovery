/**
 * Centralized Search Snapshot & Offline Replay Service (2026)
 *
 * What this controls:
 * 1. Automatic capture of every search across all discovery pages into IndexedDB.
 * 2. Full raw API JSON payload persistence in IndexedDB without data loss.
 * 3. ZERO binary downloads (no video files, audio files, or image blobs).
 * 4. Configurable snapshot retention TTL via `NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS` (default: 7 days = 604800s).
 * 5. Automatic restoration of latest search results when returning to Global Search or Link Explorer with ZERO API calls.
 * 6. Explicit API V1 and V2 provenance tracking on snapshots and page records.
 * 7. Background safe pruning of expired snapshots (never touches Saved Items, Playlists, or Collections).
 * 8. Multi-tab and recovery safety with workspace and owner-aware pointers.
 *
 * Scope: Client-side local-first persistence.
 */

import { publicEnv } from "@/lib/config/public-env";
import type { DiscoveryItem } from "@/lib/discovery/types";
import {
  createDailymotionProvenance,
  type DailymotionSourceMetadata,
} from "@/lib/discovery/provenance";
import {
  cleanExpiredSearchSnapshots,
  deleteSearchSnapshot,
  getLocalDatabase,
  getSearchSnapshot,
  getSearchSnapshotPages,
  listSearchSnapshots,
  saveSearchSnapshot,
  setLatestSearchPointer,
  getLatestSearchPointer,
  requestBrowserPersistentStorage,
  type LocalSearchSnapshotPageRecord,
  type LocalSearchSnapshotRecord,
  type LocalStoreAdapter,
} from "@/lib/local-first/indexeddb-store";
import type {
  CaptureSearchSnapshotParams,
  ReplaySearchSnapshotResult,
} from "./search-snapshot-types";

/**
 * Resolves search history retention TTL in seconds.
 * Fallback to 604,800 seconds (7 days) if unset.
 */
export function getSearchHistoryTtlSeconds(): number {
  try {
    if (typeof publicEnv?.NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS === "number") {
      return publicEnv.NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS;
    }
  } catch {
    // SSR / test fallback
  }
  return 604800;
}

/**
 * Captures a search execution and stores the complete raw API response in IndexedDB.
 * INVARIANT: Never downloads or stores video or thumbnail binaries.
 */
export async function captureSearchSnapshot(
  params: CaptureSearchSnapshotParams,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<string> {
  const now = new Date();
  const nowMs = now.getTime();
  const ttlSeconds = getSearchHistoryTtlSeconds();
  const expiresAt = nowMs + ttlSeconds * 1000;

  const randSuffix = Math.random().toString(36).substring(2, 9);
  const snapshotId = `snap_${nowMs}_${randSuffix}`;
  const pageIndex = params.pageIndex ?? 1;

  // Determine workspace scope: "link_explorer" vs "global_search"
  const workspace =
    params.workspace ||
    (params.route.includes("link-explorer") ? "link_explorer" : "global_search");
  const ownerId = params.ownerId || "admin";

  // Extract preview thumbnails (strings only) and titles for lightweight card display
  const previewThumbnails = params.items
    .map((item) => item.thumbnail)
    .filter((thumb): thumb is string => typeof thumb === "string" && thumb.trim().length > 0)
    .slice(0, 4);

  const previewTitles = params.items
    .map((item) => item.title)
    .filter((title): title is string => typeof title === "string" && title.trim().length > 0)
    .slice(0, 3);

  const provenance: DailymotionSourceMetadata =
    params.provenance ||
    createDailymotionProvenance({
      apiVersion: params.apiVersion,
      resourceType: params.resourceType || "video",
      resourceId: params.query || snapshotId,
      endpoint: params.route,
      schemaVersion: 1,
      fetchedAt: now.toISOString(),
    });

  const snapshot: LocalSearchSnapshotRecord = {
    id: snapshotId,
    query: (params.query || "").trim(),
    route: params.route,
    workspace,
    ownerId,
    apiVersion: params.apiVersion,
    resourceType: params.resourceType || "ALL",
    mode: params.mode || "search",
    apiParams: params.apiParams ?? {},
    localFilters: params.localFilters ?? {},
    totalResults: params.totalResults ?? params.items.length,
    pageCount: 1,
    currentPage: pageIndex,
    hasMore: params.hasMore ?? false,
    nextCursor: params.nextCursor ?? null,
    capturedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt,
    schemaVersion: 1,
    provenance,
    previewThumbnails,
    previewTitles,
  };

  const pageRecord: LocalSearchSnapshotPageRecord = {
    id: `${snapshotId}::page::${pageIndex}`,
    snapshotId,
    pageIndex,
    rawJson: params.rawResponse ?? null,
    normalizedItems: params.items,
    capturedAt: now.toISOString(),
    apiVersion: params.apiVersion,
    provenance,
  };

  try {
    await saveSearchSnapshot(snapshot, [pageRecord], db);

    // Update workspace latest search pointer for automatic tab recovery
    await setLatestSearchPointer(
      workspace,
      snapshotId,
      { apiVersion: params.apiVersion, ownerId },
      db
    );

    // Opportunistically request durable browser storage so the browser does not evict it
    void requestBrowserPersistentStorage().catch(() => {
      // Non-fatal if unsupported
    });

    // Opportunistic background pruning of expired records without awaiting
    void cleanExpiredSearchSnapshots(db).catch(() => {
      // Non-fatal background cleanup
    });
  } catch (err) {
    // Gracefully handle quota errors without throwing unhandled exceptions
    console.warn("[search-snapshot] Storage capture notice:", err instanceof Error ? err.message : String(err));
  }

  return snapshotId;
}

/**
 * Appends an additional page of results (e.g., pagination or deep fetch batch)
 * to an existing search snapshot in IndexedDB.
 */
export async function appendSearchSnapshotPage(
  snapshotId: string,
  pageIndex: number,
  rawResponse: unknown,
  items: DiscoveryItem[],
  optionsOrDb?: {
    hasMore?: boolean;
    nextCursor?: string | null;
  } | LocalStoreAdapter,
  maybeDb: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  const options = optionsOrDb && "getAll" in optionsOrDb ? undefined : optionsOrDb;
  const db = optionsOrDb && "getAll" in optionsOrDb ? optionsOrDb : maybeDb;
  const existingSnapshot = await getSearchSnapshot(snapshotId, db);
  if (!existingSnapshot) return;

  const now = new Date().toISOString();
  const pageRecord: LocalSearchSnapshotPageRecord = {
    id: `${snapshotId}::page::${pageIndex}`,
    snapshotId,
    pageIndex,
    rawJson: rawResponse ?? null,
    normalizedItems: items,
    capturedAt: now,
    apiVersion: existingSnapshot.apiVersion,
    provenance: existingSnapshot.provenance,
  };

  await db.put("search_snapshot_pages", pageRecord);

  // Update snapshot metadata pageCount, totalResults, and pagination cursor
  const updatedSnapshot: LocalSearchSnapshotRecord = {
    ...existingSnapshot,
    pageCount: Math.max(existingSnapshot.pageCount, pageIndex),
    currentPage: pageIndex,
    totalResults: existingSnapshot.totalResults + items.length,
    hasMore: options?.hasMore ?? existingSnapshot.hasMore,
    nextCursor: options?.nextCursor !== undefined ? options.nextCursor : existingSnapshot.nextCursor,
    updatedAt: now,
  };

  await db.put("search_snapshots", updatedSnapshot);
}

/**
 * Deterministically replays a historical search from IndexedDB.
 * GUARANTEE: Performs ZERO network calls to Dailymotion API and ZERO Gemini requests.
 */
export async function replaySearchSnapshot(
  snapshotId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<ReplaySearchSnapshotResult | null> {
  const snapshot = await getSearchSnapshot(snapshotId, db);
  if (!snapshot) return null;

  const pages = await getSearchSnapshotPages(snapshotId, db);

  // Reconstruct unique items from all recorded pages in chronological order
  const seenIds = new Set<string>();
  const items: DiscoveryItem[] = [];

  for (const page of pages) {
    for (const item of page.normalizedItems) {
      const key = `${item.apiVersion}:${item.kind}:${item.id}`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        items.push(item);
      }
    }
  }

  const isExpired = typeof snapshot.expiresAt === "number" && snapshot.expiresAt <= Date.now();

  return {
    snapshot,
    pages,
    items,
    isExpired,
  };
}

/**
 * Automatically retrieves the most recent valid, unexpired search snapshot
 * for the requested workspace (Global Search or Link Explorer).
 *
 * GUARANTEE: Zero provider API requests. Restores exact search state from browser storage.
 */
export async function getLatestRestorableSearchSnapshot(
  workspace: "global_search" | "link_explorer" | string,
  options?: { apiVersion?: "v1" | "v2"; ownerId?: string },
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<ReplaySearchSnapshotResult | null> {
  const now = Date.now();

  // 1. First check the active latest-pointer
  const pointerSnapshotId = await getLatestSearchPointer(workspace, options, db);
  if (pointerSnapshotId) {
    const replay = await replaySearchSnapshot(pointerSnapshotId, db);
    if (replay && !replay.isExpired && replay.items.length > 0) {
      return replay;
    }
  }

  // 2. Fallback: query all snapshots for this workspace, filter unexpired, sort descending
  const allSnapshots = await listSearchSnapshots({ includeExpired: false }, db);
  const candidates = allSnapshots.filter((s) => {
    if (s.workspace && s.workspace !== workspace) return false;
    if (options?.apiVersion && s.apiVersion !== options.apiVersion) return false;
    if (options?.ownerId && s.ownerId && s.ownerId !== options.ownerId) return false;
    return typeof s.expiresAt !== "number" || s.expiresAt > now;
  });

  if (candidates.length === 0) return null;

  // The listSearchSnapshots output is already sorted capturedAt desc
  const mostRecent = candidates[0];
  return replaySearchSnapshot(mostRecent.id, db);
}

/**
 * Lists all active (non-expired) search snapshots for the history index.
 */
export async function listActiveSearchSnapshots(
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<LocalSearchSnapshotRecord[]> {
  return listSearchSnapshots({ includeExpired: false }, db);
}

/**
 * Removes a search snapshot and all its page records from IndexedDB.
 */
export async function removeSearchSnapshot(
  snapshotId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  await deleteSearchSnapshot(snapshotId, db);
}

/**
 * Purges all historical search snapshots with confirmation.
 * SAFETY INVARIANT: Strictly touches ONLY SEARCH_SNAPSHOTS and SEARCH_SNAPSHOT_PAGES;
 * NEVER modifies or deletes Saved Items, Playlists, Collections, or Sync Journal.
 */
export async function clearAllSearchSnapshots(
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<number> {
  const all = await db.getAll<LocalSearchSnapshotRecord>("search_snapshots");
  for (const s of all) {
    await deleteSearchSnapshot(s.id, db);
  }
  return all.length;
}

/**
 * Automatically purges expired search snapshots and their page records.
 * Leaves unexpired snapshots, saved items, and playlists completely intact.
 */
export async function purgeExpiredSearchSnapshots(
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<number> {
  const all = await db.getAll<LocalSearchSnapshotRecord>("search_snapshots");
  const now = Date.now();
  let purged = 0;
  for (const s of all) {
    if (s.expiresAt && s.expiresAt < now) {
      await deleteSearchSnapshot(s.id, db);
      purged++;
    }
  }
  return purged;
}
