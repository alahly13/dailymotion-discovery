/**
 * Centralized Search Snapshot & Offline Replay Service (2026)
 *
 * What this controls:
 * 1. Automatic capture of every search across all discovery pages.
 * 2. Full raw API JSON payload persistence in IndexedDB without data loss.
 * 3. ZERO binary downloads (no video files, audio files, or image blobs).
 * 4. Configurable snapshot retention TTL via `NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS` (default: 7 days = 604800s).
 * 5. Deterministic offline replay reconstructing search state with ZERO Dailymotion API requests and ZERO Gemini requests.
 * 6. Background safe pruning of expired snapshots (never touches Saved Items, Collections, or Sync Journal).
 *
 * Scope: Client-side local-first persistence.
 */

import { publicEnv } from "@/lib/config/public-env";
import type { DiscoveryItem } from "@/lib/discovery/types";
import {
  cleanExpiredSearchSnapshots,
  deleteSearchSnapshot,
  getLocalDatabase,
  getSearchSnapshot,
  getSearchSnapshotPages,
  listSearchSnapshots,
  saveSearchSnapshot,
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

  // Extract preview thumbnails (strings only) and titles for lightweight card display
  const previewThumbnails = params.items
    .map((item) => item.thumbnail)
    .filter((thumb): thumb is string => typeof thumb === "string" && thumb.trim().length > 0)
    .slice(0, 4);

  const previewTitles = params.items
    .map((item) => item.title)
    .filter((title): title is string => typeof title === "string" && title.trim().length > 0)
    .slice(0, 3);

  const snapshot: LocalSearchSnapshotRecord = {
    id: snapshotId,
    query: (params.query || "").trim(),
    route: params.route,
    apiVersion: params.apiVersion,
    resourceType: params.resourceType || "ALL",
    mode: params.mode || "search",
    apiParams: params.apiParams ?? {},
    localFilters: params.localFilters ?? {},
    totalResults: params.totalResults ?? params.items.length,
    pageCount: 1,
    capturedAt: now.toISOString(),
    expiresAt,
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
  };

  await saveSearchSnapshot(snapshot, [pageRecord], db);

  // Opportunistic background pruning of expired records without awaiting
  void cleanExpiredSearchSnapshots(db).catch(() => {
    // Non-fatal background cleanup
  });

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
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  const existingSnapshot = await getSearchSnapshot(snapshotId, db);
  if (!existingSnapshot) return;

  const pageRecord: LocalSearchSnapshotPageRecord = {
    id: `${snapshotId}::page::${pageIndex}`,
    snapshotId,
    pageIndex,
    rawJson: rawResponse ?? null,
    normalizedItems: items,
    capturedAt: new Date().toISOString(),
  };

  await db.put("search_snapshot_pages", pageRecord);

  // Update snapshot metadata pageCount and totalResults
  const updatedSnapshot: LocalSearchSnapshotRecord = {
    ...existingSnapshot,
    pageCount: Math.max(existingSnapshot.pageCount, pageIndex),
    totalResults: existingSnapshot.totalResults + items.length,
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
