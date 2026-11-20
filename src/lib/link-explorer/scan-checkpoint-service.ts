// Link Explorer Scan Checkpoint Service (2026)
//
// What this controls: Owner-scoped persistence, restoration, and lifecycle of in-progress
// and paused Link Explorer scans in local IndexedDB (`link_explorer_scan_checkpoints`).
// Supports durable continuation checkpoints, query fingerprints, historical period tracking,
// cumulative statistics, and multi-tab concurrency lease protection.
// Why it exists: Guarantees that scans survive browser reloads, tab closes, network drops,
// and user sign-in transitions, allowing the user to resume multi-window date partitioning
// without losing any already retrieved records or restarting from page one.
// Scope: Link Explorer (/link-explorer) & Completed Explorations (/completed-explorations).

import type { ApiVersion } from "@/lib/discovery/types";
import type { DailymotionResourceKind } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import {
  getLocalDatabase,
  LOCAL_STORES,
  type LocalStoreAdapter,
} from "@/lib/local-first/indexeddb-store";
import type {
  CatalogPartitionLedger,
  RetrievalDirection,
  RetrievalPeriod,
  RetrievalStrategy,
  RetrievalWindowRecord,
  ScanBudgetConfig,
  ScanCompletenessStatus,
  TargetIdentity,
} from "./link-explorer-types";

export interface CheckpointPaginationState {
  strategy: "cursor" | "page" | "offset" | "date-window";
  nextCursor?: string | null;
  nextPage?: number | null;
  lastSuccessfullyFetchedPage?: number | null;
  lastCommittedCursor?: string | null;
}

export interface CheckpointStatistics {
  fetchedItems: number;
  uniqueItems: number;
  duplicateItems: number;
  failedItems: number;
  committedItems: number;
}

export interface CheckpointLastFetchedItem {
  id: string;
  createdAt?: string;
}

export interface ScanCheckpointRecord {
  id: string; // `chk:${ownerId}:${apiVersion}:${resourceType}:${resourceId}`
  ownerId: string;
  scanId: string;
  provider?: string; // "dailymotion"
  apiVersion: ApiVersion;
  resourceType: DailymotionResourceKind;
  resourceId: string;
  canonicalUrl: string;
  queryFingerprint?: string;
  targetIdentity?: TargetIdentity;
  scanConfig: ScanBudgetConfig;
  currentPage: number;
  nextCursor?: string | null;
  visitedPages: number[];
  visitedCursors: string[];
  completedPages: number;
  itemsRetrieved: number;
  lifetimeTotal: number | null;
  queryTotal: number | null;
  oldestItemDate?: string | null;
  newestItemDate?: string | null;
  oldestItemTimestamp?: string | null;
  newestItemTimestamp?: string | null;
  status: ScanCompletenessStatus;
  statusText?: string;
  pagination?: CheckpointPaginationState;
  statistics?: CheckpointStatistics;
  lastSuccessfullyFetchedItem?: CheckpointLastFetchedItem;
  attempts?: number;
  lastError?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
  completedWindows: RetrievalWindowRecord[];
  pendingWindows?: Array<{
    windowId: string;
    label: string;
    dateFrom: string | null;
    dateTo: string | null;
  }>;
  retrievalLedger?: CatalogPartitionLedger;
  retrievalStrategy?: RetrievalStrategy;
  retrievalDirection?: RetrievalDirection;
  currentPeriodId?: string | null;
  totalRawObserved?: number;
  totalUniqueRetained?: number;
  totalDuplicatesDetected?: number;
  createdAt?: string;
  updatedAt: string;
  completedAt?: string | null;
  canResume: boolean;
}

export function buildCheckpointKey(
  ownerId: string,
  apiVersion: ApiVersion,
  resourceType: string,
  resourceId: string
): string {
  const cleanOwner = (ownerId || "local-owner").trim().toLowerCase();
  const cleanType = (resourceType || "channel").trim().toLowerCase();
  const cleanId = (resourceId || "").trim().toLowerCase();
  return `chk:${cleanOwner}:${apiVersion}:${cleanType}:${cleanId}`;
}

/**
 * Builds a deterministic query fingerprint to identify an exact retrieval job configuration.
 * Prevents accidentally resuming an incompatible fetching operation when target or filters change.
 */
export function buildQueryFingerprint(params: {
  provider?: string;
  apiVersion: ApiVersion;
  resourceType: string;
  resourceId: string;
  strategy?: string;
  direction?: string;
  serverSort?: string;
  fieldsProfile?: string;
  customRange?: string;
}): string {
  const {
    provider = "dailymotion",
    apiVersion,
    resourceType,
    resourceId,
    strategy = "automatic_maximum_coverage",
    direction = "newest_to_oldest",
    serverSort = "recent",
    fieldsProfile = "standard",
    customRange = "",
  } = params;

  return [
    "fp",
    provider,
    apiVersion,
    resourceType.toLowerCase(),
    resourceId.toLowerCase(),
    strategy,
    direction,
    serverSort,
    fieldsProfile,
    customRange ? `range:${customRange}` : "all",
  ].join(":");
}

/**
 * Persists an in-progress or interrupted scan checkpoint to IndexedDB.
 */
export async function saveScanCheckpoint(
  checkpoint: ScanCheckpointRecord,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  await db.put(LOCAL_STORES.SCAN_CHECKPOINTS, checkpoint);
}

/**
 * Retrieves a scan checkpoint for a specific resource, verifying owner scope.
 */
export async function getScanCheckpoint(
  ownerId: string,
  apiVersion: ApiVersion,
  resourceType: string,
  resourceId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<ScanCheckpointRecord | null> {
  const key = buildCheckpointKey(ownerId, apiVersion, resourceType, resourceId);
  const found = await db.get<ScanCheckpointRecord>(LOCAL_STORES.SCAN_CHECKPOINTS, key);
  if (!found) return null;
  if (found.ownerId !== ownerId && ownerId !== "local-owner" && found.ownerId !== "local-owner") {
    return null;
  }
  return found;
}

/**
 * Lists all active and in-progress scan checkpoints for an owner.
 */
export async function listScanCheckpoints(
  ownerId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<ScanCheckpointRecord[]> {
  const all = await db.getAll<ScanCheckpointRecord>(LOCAL_STORES.SCAN_CHECKPOINTS);
  const cleanOwner = (ownerId || "local-owner").trim().toLowerCase();

  return all
    .filter((chk) => {
      if (!chk || !chk.id) return false;
      const chkOwner = (chk.ownerId || "local-owner").trim().toLowerCase();
      return chkOwner === cleanOwner || cleanOwner === "local-owner" || chkOwner === "local-owner";
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Deletes a scan checkpoint (e.g. after full catalog completion or user cancellation).
 */
export async function deleteScanCheckpoint(
  ownerId: string,
  apiVersion: ApiVersion,
  resourceType: string,
  resourceId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  const key = buildCheckpointKey(ownerId, apiVersion, resourceType, resourceId);
  await db.delete(LOCAL_STORES.SCAN_CHECKPOINTS, key);
}

/**
 * Clears all checkpoints for an owner.
 */
export async function clearAllScanCheckpoints(
  ownerId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  const checkouts = await listScanCheckpoints(ownerId, db);
  for (const chk of checkouts) {
    await db.delete(LOCAL_STORES.SCAN_CHECKPOINTS, chk.id);
  }
}

/**
 * Multi-tab lease check: verifies if another browser tab holds an active lease on this checkpoint.
 */
export function isScanLeaseActive(checkpoint: ScanCheckpointRecord, currentTabId: string): boolean {
  if (!checkpoint.leaseOwner || !checkpoint.leaseExpiresAt) return false;
  if (checkpoint.leaseOwner === currentTabId) return false;
  return Date.now() < checkpoint.leaseExpiresAt;
}

/**
 * Acquires a lease for a tab on this checkpoint for 30 seconds.
 */
export async function acquireScanLease(
  checkpoint: ScanCheckpointRecord,
  tabId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<boolean> {
  if (isScanLeaseActive(checkpoint, tabId)) {
    return false; // Active lease held by another tab
  }
  checkpoint.leaseOwner = tabId;
  checkpoint.leaseExpiresAt = Date.now() + 30_000;
  await saveScanCheckpoint(checkpoint, db);
  return true;
}

/**
 * Releases the lease on this checkpoint when fetch finishes or pauses.
 */
export async function releaseScanLease(
  checkpoint: ScanCheckpointRecord,
  tabId: string,
  db: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  if (checkpoint.leaseOwner === tabId) {
    checkpoint.leaseOwner = null;
    checkpoint.leaseExpiresAt = null;
    await saveScanCheckpoint(checkpoint, db);
  }
}
