/**
 * Unified Cloudflare R2 Workspace Synchronization Engine (2026)
 *
 * What this controls:
 * 1. Synchronizes all owner-scoped datasets from browser IndexedDB to private Cloudflare R2 bucket:
 *    - Saved Titles manifest (`dailymotion/persistence/${ownerId}/saved-titles/manifest.json`)
 *    - Saved Items manifest & partitions (`dailymotion/persistence/${ownerId}/saved-items/manifest.json`)
 *    - Search History snapshots (`dailymotion/persistence/${ownerId}/search-history/manifest.json`)
 *    - Research Collections & Notes (`dailymotion/persistence/${ownerId}/collections/manifest.json`)
 * 2. Two-phase commit protocol: Prepare -> Upload -> SHA-256 Verify -> Commit.
 * 3. Never deletes local data on network failure; keeps everything safe in IndexedDB outbox.
 * 4. Stamped with authoritative owner UUID from authenticated session.
 */

import { SyncCoordinator } from "./sync-coordinator";
import {
  getPendingOwnerSavedTitles,
  markCommittedSavedTitles,
  SAVED_TITLES_CHANGED_EVENT,
} from "@/lib/saved-titles/local-storage";
import { getClientOwnerId } from "@/lib/saved-titles/capture-service";
import type { SavedTitleSyncReceipt } from "@/lib/saved-titles/types";
import type { SaveReceipt } from "./save-receipt";

export interface UnifiedSyncResult {
  ok: boolean;
  error?: string;
  savedTitlesCount: number;
  workspaceSynced: boolean;
  workspaceReceipt?: SaveReceipt;
  savedTitlesReceipt?: SavedTitleSyncReceipt;
  syncedAt: string;
}

export async function executeUnifiedR2CloudSync(): Promise<UnifiedSyncResult> {
  const syncedAt = new Date().toISOString();
  let savedTitlesCount = 0;
  let savedTitlesReceipt: SavedTitleSyncReceipt | undefined;
  let workspaceReceipt: SaveReceipt | undefined;
  let workspaceSynced = false;
  let savedTitlesError: string | undefined;
  let workspaceError: string | undefined;

  // 1. Resolve authoritative owner UUID
  const ownerId = await getClientOwnerId();

  // 2. Synchronize Saved Titles (if any pending)
  try {
    const pendingTitles = await getPendingOwnerSavedTitles(ownerId);
    if (pendingTitles.length > 0) {
      const res = await fetch("/api/saved-titles/cloud-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingEntries: pendingTitles }),
      });

      const body = (await res.json()) as {
        ok: boolean;
        error?: string;
        committedIds?: string[];
        receipt?: SavedTitleSyncReceipt;
      };

      if (res.ok && body.ok && body.receipt && Array.isArray(body.committedIds)) {
        await markCommittedSavedTitles(ownerId, body.committedIds, body.receipt);
        savedTitlesCount = body.committedIds.length;
        savedTitlesReceipt = body.receipt;
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(SAVED_TITLES_CHANGED_EVENT));
        }
      } else {
        throw new Error(body.error || `Saved Titles sync failed (${res.status})`);
      }
    }
  } catch (err) {
    savedTitlesError = err instanceof Error ? err.message : "Saved Titles cloud sync failed.";
    console.warn("[unified-cloud-sync] Saved Titles sync error:", err);
    // Continue to workspace sync so independent datasets can flush queued changes,
    // while keeping `ok: false` overall because Saved Titles failed.
  }

  // 3. Synchronize Workspace Datasets (Saved Items, History, Collections)
  try {
    const coordinator = new SyncCoordinator();
    workspaceReceipt = await coordinator.syncNow();
    workspaceSynced = workspaceReceipt.stage === "CLOUD_COMMITTED";
    if (!workspaceSynced) {
      workspaceError = workspaceReceipt.errorMessage || "Workspace cloud synchronization failed.";
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    workspaceError = errMsg;
    console.warn("[unified-cloud-sync] Workspace sync error:", err);
  }

  const combinedErrors = [savedTitlesError, workspaceError].filter((msg): msg is string => Boolean(msg));
  const ok = combinedErrors.length === 0 && workspaceSynced;

  return {
    ok,
    ...(combinedErrors.length > 0 ? { error: combinedErrors.join(" | ") } : {}),
    savedTitlesCount,
    workspaceSynced,
    workspaceReceipt,
    savedTitlesReceipt,
    syncedAt,
  };
}
