/**
 * Owner-Scoped Local Browser Persistence for Saved Titles (2026)
 *
 * What this controls:
 * 1. Immediate local persistence in IndexedDB (`entities_saved_titles`).
 * 2. Strict owner isolation: user A's records are never visible to user B.
 * 3. Survives browser restarts, tab closures, and unloads.
 * 4. Distinct lifecycle separation: local pending vs cloud synced.
 *
 * Scope: Client-side local storage engine (with safe memory fallback for tests).
 */

import {
  getLocalDatabase,
  LOCAL_STORES,
  type LocalStoreAdapter,
} from "@/lib/local-first/indexeddb-store";
import {
  SavedTitleEntry,
  SavedTitlesManifest,
  SavedTitleSyncReceipt,
  SavedTitleEntrySchema,
} from "./types";

export const SAVED_TITLES_CHANGED_EVENT = "dm:saved-titles-changed";

function dispatchChangedEvent() {
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(SAVED_TITLES_CHANGED_EVENT));
    } catch {
      // Ignore if in headless environment
    }
  }
}

/**
 * Returns all local saved title records strictly scoped to the verified owner.
 */
export async function getAllOwnerSavedTitles(
  ownerId: string,
  adapter: LocalStoreAdapter = getLocalDatabase()
): Promise<SavedTitleEntry[]> {
  const cleanOwner = (ownerId || "").trim().toLowerCase();
  if (!cleanOwner) return [];

  const all = await adapter.getAll<SavedTitleEntry>(LOCAL_STORES.SAVED_TITLES);
  return all
    .filter((entry) => (entry.ownerId || "").trim().toLowerCase() === cleanOwner && !entry.isDeleted)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Returns only records waiting to be uploaded to Cloudflare R2.
 */
export async function getPendingOwnerSavedTitles(
  ownerId: string,
  adapter: LocalStoreAdapter = getLocalDatabase()
): Promise<SavedTitleEntry[]> {
  const all = await getAllOwnerSavedTitles(ownerId, adapter);
  return all.filter((entry) => entry.status !== "cloud_synced");
}

/**
 * Returns only verified cloud-synchronized records present in local store.
 */
export async function getCloudSyncedOwnerSavedTitles(
  ownerId: string,
  adapter: LocalStoreAdapter = getLocalDatabase()
): Promise<SavedTitleEntry[]> {
  const all = await getAllOwnerSavedTitles(ownerId, adapter);
  return all.filter((entry) => entry.status === "cloud_synced");
}

/**
 * Persists a new or updated Saved Title immediately into IndexedDB.
 */
export async function saveLocalSavedTitle(
  entry: SavedTitleEntry,
  adapter: LocalStoreAdapter = getLocalDatabase()
): Promise<SavedTitleEntry> {
  const parsed = SavedTitleEntrySchema.safeParse(entry);
  if (!parsed.success) {
    throw new Error(`Invalid Saved Title entry: ${parsed.error.issues[0]?.message || "schema mismatch"}`);
  }

  const cleanEntry: SavedTitleEntry = {
    ...parsed.data,
    ownerId: parsed.data.ownerId.trim().toLowerCase(),
    updatedAt: new Date().toISOString(),
  };

  await adapter.put(LOCAL_STORES.SAVED_TITLES, cleanEntry);
  dispatchChangedEvent();
  return cleanEntry;
}

/**
 * Updates a saved title entry (e.g. edit display title or notes) and marks it pending sync.
 */
export async function updateLocalSavedTitle(
  ownerId: string,
  id: string,
  patch: Partial<Pick<SavedTitleEntry, "displayTitle" | "notes">>,
  adapter: LocalStoreAdapter = getLocalDatabase()
): Promise<SavedTitleEntry | null> {
  const cleanOwner = (ownerId || "").trim().toLowerCase();
  const existing = await adapter.get<SavedTitleEntry>(LOCAL_STORES.SAVED_TITLES, id);
  if (!existing || (existing.ownerId || "").trim().toLowerCase() !== cleanOwner) {
    return null;
  }

  const updated: SavedTitleEntry = {
    ...existing,
    displayTitle: patch.displayTitle !== undefined ? patch.displayTitle.trim() : existing.displayTitle,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
    status: "pending_sync",
    updatedAt: new Date().toISOString(),
  };

  await adapter.put(LOCAL_STORES.SAVED_TITLES, updated);
  dispatchChangedEvent();
  return updated;
}

/**
 * Removes a Saved Title record.
 * If already cloud-synced, marks as deleted with pending_sync so deletion is committed to R2.
 * If purely local pending, deletes permanently from IndexedDB.
 */
export async function deleteLocalSavedTitle(
  ownerId: string,
  id: string,
  adapter: LocalStoreAdapter = getLocalDatabase()
): Promise<boolean> {
  const cleanOwner = (ownerId || "").trim().toLowerCase();
  const existing = await adapter.get<SavedTitleEntry>(LOCAL_STORES.SAVED_TITLES, id);
  if (!existing || (existing.ownerId || "").trim().toLowerCase() !== cleanOwner) {
    return false;
  }

  if (existing.status === "cloud_synced") {
    // Tombstone for cloud synchronization
    const tombstone: SavedTitleEntry = {
      ...existing,
      isDeleted: true,
      status: "pending_sync",
      updatedAt: new Date().toISOString(),
    };
    await adapter.put(LOCAL_STORES.SAVED_TITLES, tombstone);
  } else {
    // Purely local draft: delete immediately
    await adapter.delete(LOCAL_STORES.SAVED_TITLES, id);
  }

  dispatchChangedEvent();
  return true;
}

/**
 * Transitions committed local entries to "cloud_synced" status upon verified R2 commit.
 * Permanently removes any deleted tombstones that were successfully committed.
 */
export async function markCommittedSavedTitles(
  ownerId: string,
  committedIds: string[],
  receipt: SavedTitleSyncReceipt,
  adapter: LocalStoreAdapter = getLocalDatabase()
): Promise<void> {
  const cleanOwner = (ownerId || "").trim().toLowerCase();
  const committedSet = new Set(committedIds);

  const all = await adapter.getAll<SavedTitleEntry>(LOCAL_STORES.SAVED_TITLES);
  for (const entry of all) {
    if ((entry.ownerId || "").trim().toLowerCase() === cleanOwner && committedSet.has(entry.id)) {
      if (entry.isDeleted) {
        await adapter.delete(LOCAL_STORES.SAVED_TITLES, entry.id);
      } else {
        const synced: SavedTitleEntry = {
          ...entry,
          status: "cloud_synced",
          syncedAt: receipt.uploadedAt || new Date().toISOString(),
          syncReceipt: receipt,
          updatedAt: new Date().toISOString(),
        };
        await adapter.put(LOCAL_STORES.SAVED_TITLES, synced);
      }
    }
  }

  dispatchChangedEvent();
}

/**
 * Constructs the canonical versioned local manifest document for the authenticated owner.
 */
export async function buildLocalSavedTitlesManifest(
  ownerId: string,
  adapter: LocalStoreAdapter = getLocalDatabase()
): Promise<SavedTitlesManifest> {
  const cleanOwner = (ownerId || "").trim().toLowerCase();
  const entries = await getAllOwnerSavedTitles(cleanOwner, adapter);
  const now = new Date().toISOString();

  return {
    manifestVersion: 1,
    manifestType: "saved-titles",
    provider: "dailymotion-discovery",
    owner: {
      ownerId: cleanOwner,
    },
    manifestId: `st-manifest-${cleanOwner}`,
    revision: 1,
    createdAt: entries.length > 0 ? entries[entries.length - 1].createdAt : now,
    updatedAt: now,
    entries,
  };
}
