// Catalog Persistence Service — Progressive IndexedDB Catalog Storage & Metadata Merging (2026)
//
// What this controls: Progressive, page-by-page persistence of retrieved channel and playlist
// items into IndexedDB (`link_explorer_catalog_items`). Enforces strict append-only semantics,
// non-destructive metadata merging on collisions, stable composite identities, and zero-RAM-hoarding
// storage during deep catalog crawls.
// Why it exists: Eliminates localStorage 5MB size limits, guarantees retrieval survives browser
// refresh, unmount, or network failure, and allows the user to continue interrupted scans without
// losing previously fetched items or creating duplicate database rows.
// Scope: Link Explorer (/link-explorer) & Catalog Persistence.

import type { ApiVersion, DiscoveryItem } from "@/lib/discovery/types";
import {
  getLocalDatabase,
  LOCAL_STORES,
  type LocalStoreAdapter,
} from "@/lib/local-first/indexeddb-store";
import { buildStableResourceIdentity, mergeMetadata } from "./deduplication-service";
import { computeCatalogChecksum } from "./link-explorer-service";
import { saveCompletedExplorationManifest, type CompletedExplorationManifest } from "./completed-explorations-service";
import type {
  CatalogPartitionLedger,
  RetrievalDirection,
  RetrievalPeriod,
  RetrievalStrategy,
  ScanBudgetConfig,
  TargetIdentity,
} from "./link-explorer-types";

export interface CatalogItemRecord {
  id: string; // `${checkpointKey}::${kind}:${itemId}`
  checkpointKey: string;
  scanId: string;
  ownerId: string;
  targetResourceId: string;
  apiVersion: ApiVersion;
  kind: string;
  itemId: string;
  compositeKey: string; // `${kind}:${itemId}`
  item: DiscoveryItem;
  periodId?: string | null;
  page: number;
  createdAt?: string | null;
  savedAt: string;
  updatedAt: string;
}

export interface PersistBatchParams {
  checkpointKey: string;
  scanId: string;
  ownerId: string;
  targetResourceId: string;
  apiVersion: ApiVersion;
  items: DiscoveryItem[];
  periodId?: string | null;
  page: number;
  db?: LocalStoreAdapter;
}

export interface PersistBatchResult {
  newlyAdded: number;
  updated: number;
  totalStored: number;
}

/**
 * Builds a deterministic primary key for an item inside a checkpoint catalog.
 */
export function buildCatalogItemKey(checkpointKey: string, kind: string, id: string): string {
  const cleanKind = (kind || "video").trim().toLowerCase();
  const cleanId = String(id || "").trim().toLowerCase();
  return `${checkpointKey}::${cleanKind}:${cleanId}`;
}

/**
 * Persists a single page/batch of items progressively into IndexedDB (`link_explorer_catalog_items`).
 * Non-destructively merges metadata if a record for the same resource already exists in storage.
 */
export async function persistProgressiveBatch(params: PersistBatchParams): Promise<PersistBatchResult> {
  const {
    checkpointKey,
    scanId,
    ownerId,
    targetResourceId,
    apiVersion,
    items,
    periodId = null,
    page,
    db = getLocalDatabase(),
  } = params;

  if (items.length === 0) {
    const totalStored = await countCatalogItemsForCheckpoint(checkpointKey, db);
    return { newlyAdded: 0, updated: 0, totalStored };
  }

  const now = new Date().toISOString();
  let newlyAdded = 0;
  let updated = 0;
  const recordsToPut: CatalogItemRecord[] = [];

  for (const item of items) {
    const compositeKey = buildStableResourceIdentity(item);
    const key = buildCatalogItemKey(checkpointKey, item.kind, item.id);

    // Check if item already exists in local DB to perform non-destructive merge
    let finalItem = item;
    let originalSavedAt = now;

    try {
      const existing = await db.get<CatalogItemRecord>(LOCAL_STORES.CATALOG_ITEMS, key);
      if (existing && existing.item) {
        finalItem = mergeMetadata(existing.item, item);
        originalSavedAt = existing.savedAt || now;
        updated += 1;
      } else {
        newlyAdded += 1;
      }
    } catch {
      // If get fails or record doesn't exist, treat as newly added
      newlyAdded += 1;
    }

    const record: CatalogItemRecord = {
      id: key,
      checkpointKey,
      scanId,
      ownerId,
      targetResourceId,
      apiVersion,
      kind: item.kind,
      itemId: item.id,
      compositeKey,
      item: finalItem,
      periodId,
      page,
      createdAt: finalItem.createdAt || null,
      savedAt: originalSavedAt,
      updatedAt: now,
    };

    recordsToPut.push(record);
  }

  // Commit all records in a single transactional batch
  await db.putMany(LOCAL_STORES.CATALOG_ITEMS, recordsToPut);

  const totalStored = await countCatalogItemsForCheckpoint(checkpointKey, db);
  return { newlyAdded, updated, totalStored };
}

/**
 * Retrieves all progressively stored items for a specific checkpoint key from IndexedDB.
 * Returns unique items sorted chronologically (newest to oldest by default).
 */
export async function getCatalogItemsForCheckpoint(
  checkpointKey: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<DiscoveryItem[]> {
  const allRecords = await db.getAll<CatalogItemRecord>(LOCAL_STORES.CATALOG_ITEMS);
  const matching = allRecords.filter((rec) => rec && rec.checkpointKey === checkpointKey);

  // Sort chronologically by createdAt (newest first, fallback to original saved order)
  matching.sort((a, b) => {
    const timeA = a.item?.createdAt ? new Date(a.item.createdAt).getTime() : 0;
    const timeB = b.item?.createdAt ? new Date(b.item.createdAt).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });

  return matching.map((rec) => rec.item);
}

/**
 * Counts the total number of unique items durably stored for a checkpoint key.
 */
export async function countCatalogItemsForCheckpoint(
  checkpointKey: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<number> {
  const allRecords = await db.getAll<CatalogItemRecord>(LOCAL_STORES.CATALOG_ITEMS);
  return allRecords.filter((rec) => rec && rec.checkpointKey === checkpointKey).length;
}

/**
 * Deletes all catalog items associated with a checkpoint key from IndexedDB.
 */
export async function deleteCatalogItemsForCheckpoint(
  checkpointKey: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  const allRecords = await db.getAll<CatalogItemRecord>(LOCAL_STORES.CATALOG_ITEMS);
  const toDelete = allRecords.filter((rec) => rec && rec.checkpointKey === checkpointKey);
  for (const rec of toDelete) {
    await db.delete(LOCAL_STORES.CATALOG_ITEMS, rec.id);
  }
}

/**
 * Consolidates all progressively stored items in IndexedDB into a canonical manifest,
 * computes deterministic SHA-256 checksum, and saves to Completed Explorations (`completed_explorations_manifests`).
 */
export async function consolidateAndFinalizeCatalog(params: {
  checkpointKey: string;
  ownerId: string;
  provider?: "dailymotion";
  apiVersion: ApiVersion;
  resourceKind: string;
  resourceId: string;
  canonicalSourceUrl: string;
  resourceTitle: string;
  resourceDescription?: string | null;
  resourceThumbnail?: string | null;
  targetIdentity?: TargetIdentity;
  scanId: string;
  scanConfig?: Partial<ScanBudgetConfig>;
  retrievalLedger?: CatalogPartitionLedger;
  providerReportedLifetimeTotal?: number | null;
  providerReportedQueryTotal?: number | null;
  clearProgressiveItems?: boolean;
  db?: LocalStoreAdapter;
}): Promise<CompletedExplorationManifest> {
  const {
    checkpointKey,
    ownerId,
    provider = "dailymotion",
    apiVersion,
    resourceKind,
    resourceId,
    canonicalSourceUrl,
    resourceTitle,
    resourceDescription = null,
    resourceThumbnail = null,
    targetIdentity,
    scanId,
    scanConfig,
    retrievalLedger,
    providerReportedLifetimeTotal = null,
    providerReportedQueryTotal = null,
    db = getLocalDatabase(),
  } = params;

  // 1. Load all stored records from IndexedDB
  const items = await getCatalogItemsForCheckpoint(checkpointKey, db);

  // 2. Compute deterministic SHA-256 checksum
  const sha256Checksum = await computeCatalogChecksum(items, resourceId);

  // 3. Extract oldest and newest timestamps
  const validDates = items
    .map((it) => (it.createdAt ? new Date(it.createdAt).getTime() : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  const oldestItemDate = validDates[0] ? new Date(validDates[0]).toISOString() : null;
  const newestItemDate = validDates[validDates.length - 1] ? new Date(validDates[validDates.length - 1]).toISOString() : null;

  const now = new Date().toISOString();
  const manifestId = `manifest-${Date.now()}-${resourceId}`;

  const manifest: CompletedExplorationManifest = {
    id: manifestId,
    manifestSchemaVersion: "1.0.0",
    manifestId,
    ownerId,
    provider,
    apiVersion,
    resourceKind: resourceKind as any,
    resourceId,
    canonicalSourceUrl,
    resourceTitle,
    resourceDescription,
    resourceThumbnail,
    targetIdentity,
    scanId,
    scanStrategy: scanConfig?.strategy || "deep",
    retrievalStrategy: scanConfig?.retrievalStrategy || retrievalLedger?.strategy || "automatic_maximum_coverage",
    retrievalDirection: scanConfig?.retrievalDirection || retrievalLedger?.direction || "newest_to_oldest",
    createdAt: now,
    completedAt: now,
    updatedAt: now,
    totalUniqueItems: items.length,
    providerReportedLifetimeTotal,
    providerReportedQueryTotal,
    duplicatesSkipped: retrievalLedger?.totalDuplicatesDetected || 0,
    omittedOrUnavailableReferences: 0,
    totalRawObserved: (retrievalLedger?.totalRawObserved || items.length),
    totalDuplicatesDetected: retrievalLedger?.totalDuplicatesDetected || 0,
    oldestItemDate,
    newestItemDate,
    items,
    retrievalLedger,
    paginationMetadata: {
      totalPagesFetched: Math.ceil(items.length / (scanConfig?.pageSize || 100)),
      windowsRetrieved: [],
    },
    sha256Checksum,
    status: providerReportedLifetimeTotal && items.length >= providerReportedLifetimeTotal
      ? "complete_within_verified_scope"
      : "completed_with_known_limitations",
  };

  await saveCompletedExplorationManifest(manifest);

  // Clean up progressive items by default once consolidated into a completed manifest
  if (params.clearProgressiveItems ?? true) {
    await deleteCatalogItemsForCheckpoint(checkpointKey, db);
  }

  return manifest;
}
