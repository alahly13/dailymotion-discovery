// Link Explorer Scan Checkpoint Service (2026)
//
// What this controls: Owner-scoped persistence, restoration, and lifecycle of in-progress
// and paused Link Explorer scans in local IndexedDB (`link_explorer_scan_checkpoints`).
// Why it exists: Guarantees that scans survive browser reloads, tab closes, network drops,
// and user sign-in transitions, allowing the user to resume multi-window date partitioning
// without losing any already retrieved records.
// Scope: Link Explorer (/link-explorer) & Completed Explorations (/completed-explorations).

import type { ApiVersion } from "@/lib/discovery/types";
import type { DailymotionResourceKind } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import {
  getLocalDatabase,
  LOCAL_STORES,
} from "@/lib/local-first/indexeddb-store";
import type {
  RetrievalWindowRecord,
  ScanBudgetConfig,
  ScanCompletenessStatus,
  TargetIdentity,
} from "./link-explorer-types";

export interface ScanCheckpointRecord {
  id: string; // `chk:${ownerId}:${apiVersion}:${resourceType}:${resourceId}`
  ownerId: string;
  scanId: string;
  apiVersion: ApiVersion;
  resourceType: DailymotionResourceKind;
  resourceId: string;
  canonicalUrl: string;
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
  status: ScanCompletenessStatus;
  statusText?: string;
  completedWindows: RetrievalWindowRecord[];
  pendingWindows?: Array<{
    windowId: string;
    label: string;
    dateFrom: string | null;
    dateTo: string | null;
  }>;
  updatedAt: string;
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
 * Persists an in-progress or interrupted scan checkpoint to IndexedDB.
 */
export async function saveScanCheckpoint(checkpoint: ScanCheckpointRecord): Promise<void> {
  const db = getLocalDatabase();
  await db.put(LOCAL_STORES.SCAN_CHECKPOINTS, checkpoint);
}

/**
 * Retrieves a scan checkpoint for a specific resource, verifying owner scope.
 */
export async function getScanCheckpoint(
  ownerId: string,
  apiVersion: ApiVersion,
  resourceType: string,
  resourceId: string
): Promise<ScanCheckpointRecord | null> {
  const db = getLocalDatabase();
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
export async function listScanCheckpoints(ownerId: string): Promise<ScanCheckpointRecord[]> {
  const db = getLocalDatabase();
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
  resourceId: string
): Promise<void> {
  const db = getLocalDatabase();
  const key = buildCheckpointKey(ownerId, apiVersion, resourceType, resourceId);
  await db.delete(LOCAL_STORES.SCAN_CHECKPOINTS, key);
}

/**
 * Clears all checkpoints for an owner.
 */
export async function clearAllScanCheckpoints(ownerId: string): Promise<void> {
  const checkouts = await listScanCheckpoints(ownerId);
  const db = getLocalDatabase();
  for (const chk of checkouts) {
    await db.delete(LOCAL_STORES.SCAN_CHECKPOINTS, chk.id);
  }
}
