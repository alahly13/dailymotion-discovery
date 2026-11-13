import type { DiscoveryItem } from "@/lib/discovery/types";
import { classifyDiscoveryItem, discoveryCompositeKey } from "@/lib/resources/dailymotion-resource-taxonomy";
import {
  buildLocalSavedItemRecord,
  getLocalDatabase,
  LOCAL_STORES,
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
import { createPendingSaveReceipt, type SaveReceipt } from "./save-receipt";

/**
 * Coordinates atomic local-first mutations into IndexedDB + durable Outbox (`pending_operations`),
 * write-ahead sync journaling, interrupted-sync recovery, and verified two-phase cloud commits.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

function emitLocalChange(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // Ignore individual subscriber errors
    }
  }
}

export function subscribeLocalWorkspaceChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function makeUuid(): string {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `dm-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function enqueueOutboxOp(
  db: LocalStoreAdapter,
  op: Omit<PendingOutboxOperation, "operationId" | "idempotencyKey" | "status" | "attempts" | "createdAt" | "updatedAt">
): Promise<PendingOutboxOperation> {
  const now = new Date().toISOString();
  const full: PendingOutboxOperation = {
    ...op,
    operationId: makeUuid(),
    idempotencyKey: `op-${op.entityType}-${op.action}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.put(LOCAL_STORES.PENDING_OPERATIONS, full);
  return full;
}

export class SyncCoordinator {
  constructor(
    private readonly db: LocalStoreAdapter = getLocalDatabase(),
    private readonly fetchFn: typeof fetch = (...args) => globalThis.fetch(...args)
  ) {}

  async isItemSaved(itemOrKey: DiscoveryItem | string): Promise<boolean> {
    const key =
      typeof itemOrKey === "string"
        ? itemOrKey
        : discoveryCompositeKey(itemOrKey.apiVersion, itemOrKey.kind, itemOrKey.id);
    const existing = await this.db.get<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS, key);
    if (existing) return true;

    // Also check by raw ID or stable ID
    if (typeof itemOrKey === "string" && (itemOrKey.startsWith("dailymotion:") || !itemOrKey.includes(":"))) {
      const all = await this.db.getAll<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS);
      return all.some((item) => item.id === itemOrKey || item.stableId === itemOrKey || item.compositeKey === itemOrKey);
    }
    return false;
  }

  async saveItem(
    item: DiscoveryItem,
    options?: {
      sourcePage?: string;
      sourceQuery?: string;
      sourceFilters?: Record<string, unknown>;
      collectionIds?: string[];
      note?: string;
      tags?: string[];
      country?: string;
      category?: string;
    }
  ): Promise<LocalSavedItemRecord> {
    const compositeKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
    const existing = await this.db.get<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS, compositeKey);

    const record = buildLocalSavedItemRecord(item, {
      ...options,
      savedAt: existing?.savedAt,
      isFavorite: existing?.isFavorite,
      tags: options?.tags ?? existing?.tags ?? item.tags ?? [],
      note: options?.note ?? existing?.note,
      collectionIds: options?.collectionIds ?? existing?.collectionIds ?? [],
    });

    await this.db.put(LOCAL_STORES.SAVED_ITEMS, record);
    await enqueueOutboxOp(this.db, {
      entityType: "saved_item",
      action: "upsert",
      entityKey: compositeKey,
      payload: { record },
    });
    emitLocalChange();
    return record;
  }

  async removeItem(compositeKeyOrId: string): Promise<boolean> {
    let targetKey = compositeKeyOrId;
    let existing = await this.db.get<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS, targetKey);

    if (!existing) {
      const all = await this.db.getAll<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS);
      const match = all.find(
        (i) => i.id === compositeKeyOrId || i.stableId === compositeKeyOrId || i.compositeKey === compositeKeyOrId
      );
      if (match) {
        targetKey = match.compositeKey;
        existing = match;
      }
    }

    if (!existing) return false;

    await this.db.delete(LOCAL_STORES.SAVED_ITEMS, targetKey);
    await enqueueOutboxOp(this.db, {
      entityType: "saved_item",
      action: "delete",
      entityKey: targetKey,
      payload: { compositeKey: targetKey },
    });
    emitLocalChange();
    return true;
  }

  async removeItemsBatch(keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      const ok = await this.removeItem(key);
      if (ok) removed += 1;
    }
    return removed;
  }

  async toggleSaveItem(item: DiscoveryItem): Promise<{ saved: boolean; record?: LocalSavedItemRecord }> {
    const compositeKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
    const existing = await this.db.get<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS, compositeKey);

    if (existing) {
      await this.db.delete(LOCAL_STORES.SAVED_ITEMS, compositeKey);
      await enqueueOutboxOp(this.db, {
        entityType: "saved_item",
        action: "delete",
        entityKey: compositeKey,
        payload: { compositeKey },
      });
      emitLocalChange();
      return { saved: false };
    }

    const record = buildLocalSavedItemRecord(item);
    await this.db.put(LOCAL_STORES.SAVED_ITEMS, record);
    await enqueueOutboxOp(this.db, {
      entityType: "saved_item",
      action: "upsert",
      entityKey: compositeKey,
      payload: { record },
    });
    emitLocalChange();
    return { saved: true, record };
  }

  async saveItemsBatch(items: DiscoveryItem[]): Promise<{ addedCount: number; totalSaved: number }> {
    let addedCount = 0;
    const ops: PendingOutboxOperation[] = [];
    const recs: LocalSavedItemRecord[] = [];
    const now = new Date().toISOString();

    for (const item of items) {
      const compositeKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
      const existing = await this.db.get<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS, compositeKey);
      if (!existing) {
        const record = buildLocalSavedItemRecord(item);
        recs.push(record);
        ops.push({
          operationId: makeUuid(),
          idempotencyKey: `op-saved-batch-${compositeKey}-${Date.now()}`,
          entityType: "saved_item",
          action: "upsert",
          entityKey: compositeKey,
          payload: { record },
          status: "pending",
          attempts: 0,
          createdAt: now,
          updatedAt: now,
        });
        addedCount += 1;
      }
    }

    if (recs.length > 0) {
      await this.db.putMany(LOCAL_STORES.SAVED_ITEMS, recs);
      await this.db.putMany(LOCAL_STORES.PENDING_OPERATIONS, ops);
      emitLocalChange();
    }

    const allSaved = await this.db.getAll<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS);
    return { addedCount, totalSaved: allSaved.length };
  }

  async setSavedItemFavorite(compositeKey: string, isFavorite: boolean): Promise<LocalSavedItemRecord | null> {
    const existing = await this.db.get<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS, compositeKey);
    if (!existing) return null;
    const updated: LocalSavedItemRecord = {
      ...existing,
      isFavorite,
      updatedAt: new Date().toISOString(),
    };
    await this.db.put(LOCAL_STORES.SAVED_ITEMS, updated);
    await enqueueOutboxOp(this.db, {
      entityType: "saved_item",
      action: "upsert",
      entityKey: compositeKey,
      payload: { record: updated },
    });
    emitLocalChange();
    return updated;
  }

  async updateSavedItemMetadata(compositeKey: string, patch: { tags?: string[]; note?: string }): Promise<LocalSavedItemRecord | null> {
    const existing = await this.db.get<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS, compositeKey);
    if (!existing) return null;
    const updated: LocalSavedItemRecord = {
      ...existing,
      ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      updatedAt: new Date().toISOString(),
    };
    await this.db.put(LOCAL_STORES.SAVED_ITEMS, updated);
    await enqueueOutboxOp(this.db, {
      entityType: "saved_item",
      action: "upsert",
      entityKey: compositeKey,
      payload: { record: updated },
    });
    emitLocalChange();
    return updated;
  }

  async createCollection(input: { name: string; description?: string; tags?: string[] }): Promise<LocalCollectionRecord> {
    const now = new Date().toISOString();
    const record: LocalCollectionRecord = {
      id: makeUuid(),
      name: input.name.trim() || "Untitled Collection",
      description: (input.description ?? "").trim(),
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    await this.db.put(LOCAL_STORES.COLLECTIONS, record);
    await enqueueOutboxOp(this.db, {
      entityType: "collection",
      action: "upsert",
      entityKey: record.id,
      payload: { record },
    });
    emitLocalChange();
    return record;
  }

  async updateCollection(
    id: string,
    patch: { name?: string; description?: string; tags?: string[] }
  ): Promise<LocalCollectionRecord | null> {
    const existing = await this.db.get<LocalCollectionRecord>(LOCAL_STORES.COLLECTIONS, id);
    if (!existing) return null;
    const updated: LocalCollectionRecord = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() || existing.name : existing.name,
      description: patch.description !== undefined ? patch.description.trim() : existing.description,
      tags: patch.tags !== undefined ? patch.tags : existing.tags,
      updatedAt: new Date().toISOString(),
    };
    await this.db.put(LOCAL_STORES.COLLECTIONS, updated);
    await enqueueOutboxOp(this.db, {
      entityType: "collection",
      action: "upsert",
      entityKey: id,
      payload: { record: updated },
    });
    emitLocalChange();
    return updated;
  }

  async deleteCollection(id: string): Promise<void> {
    const items = await this.db.getAll<LocalCollectionItemRecord>(LOCAL_STORES.COLLECTION_ITEMS);
    const matching = items.filter((ci) => ci.collectionId === id);
    for (const item of matching) {
      await this.db.delete(LOCAL_STORES.COLLECTION_ITEMS, item.id);
    }
    await this.db.delete(LOCAL_STORES.COLLECTIONS, id);
    await enqueueOutboxOp(this.db, {
      entityType: "collection",
      action: "delete",
      entityKey: id,
      payload: { id },
    });
    emitLocalChange();
  }

  async addItemToCollection(collectionId: string, item: DiscoveryItem, note?: string): Promise<LocalCollectionItemRecord> {
    const itemKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
    const membershipId = `${collectionId}::${itemKey}`;
    const existing = await this.db.get<LocalCollectionItemRecord>(LOCAL_STORES.COLLECTION_ITEMS, membershipId);
    if (existing) {
      if (note !== undefined && note !== existing.note) {
        const updated = { ...existing, note };
        await this.db.put(LOCAL_STORES.COLLECTION_ITEMS, updated);
        await enqueueOutboxOp(this.db, {
          entityType: "collection_item",
          action: "upsert",
          entityKey: membershipId,
          payload: { record: updated },
        });
        emitLocalChange();
        return updated;
      }
      return existing;
    }

    const existingInCollection = (await this.db.getAll<LocalCollectionItemRecord>(LOCAL_STORES.COLLECTION_ITEMS)).filter(
      (ci) => ci.collectionId === collectionId
    );
    const nextPos = existingInCollection.reduce((max, ci) => Math.max(max, ci.position), -1) + 1;

    const record: LocalCollectionItemRecord = {
      id: membershipId,
      collectionId,
      itemKey,
      resourceType: classifyDiscoveryItem(item),
      apiVersion: item.apiVersion,
      position: nextPos,
      note,
      snapshot: item,
      addedAt: new Date().toISOString(),
    };
    await this.db.put(LOCAL_STORES.COLLECTION_ITEMS, record);
    await enqueueOutboxOp(this.db, {
      entityType: "collection_item",
      action: "upsert",
      entityKey: membershipId,
      payload: { record },
    });
    emitLocalChange();
    return record;
  }

  async removeItemFromCollection(collectionId: string, itemKey: string): Promise<void> {
    const membershipId = `${collectionId}::${itemKey}`;
    await this.db.delete(LOCAL_STORES.COLLECTION_ITEMS, membershipId);
    await enqueueOutboxOp(this.db, {
      entityType: "collection_item",
      action: "delete",
      entityKey: membershipId,
      payload: { id: membershipId, collectionId, itemKey },
    });
    emitLocalChange();
  }

  async updateCollectionItemNote(collectionId: string, itemKey: string, note: string): Promise<void> {
    const membershipId = `${collectionId}::${itemKey}`;
    const existing = await this.db.get<LocalCollectionItemRecord>(LOCAL_STORES.COLLECTION_ITEMS, membershipId);
    if (!existing) return;
    const updated: LocalCollectionItemRecord = { ...existing, note };
    await this.db.put(LOCAL_STORES.COLLECTION_ITEMS, updated);
    await enqueueOutboxOp(this.db, {
      entityType: "collection_item",
      action: "upsert",
      entityKey: membershipId,
      payload: { record: updated },
    });
    emitLocalChange();
  }

  async reorderCollectionItem(collectionId: string, itemKey: string, direction: "up" | "down"): Promise<void> {
    const items = (await this.db.getAll<LocalCollectionItemRecord>(LOCAL_STORES.COLLECTION_ITEMS))
      .filter((ci) => ci.collectionId === collectionId)
      .sort((a, b) => a.position - b.position);

    const idx = items.findIndex((i) => i.itemKey === itemKey);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    const reordered = [...items];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(swapIdx, 0, moved);

    const normalized = reordered.map((entry, pos) => ({ ...entry, position: pos }));
    await this.db.putMany(LOCAL_STORES.COLLECTION_ITEMS, normalized);
    await enqueueOutboxOp(this.db, {
      entityType: "collection_item",
      action: "reorder",
      entityKey: collectionId,
      payload: { collectionId, orderedItemKeys: normalized.map((n) => n.itemKey) },
    });
    emitLocalChange();
  }

  async moveOrCopyCollectionItem(options: {
    sourceCollectionId: string;
    targetCollectionId: string;
    itemKey: string;
    mode: "move" | "copy";
  }): Promise<void> {
    if (options.sourceCollectionId === options.targetCollectionId) return;
    const sourceMembership = await this.db.get<LocalCollectionItemRecord>(
      LOCAL_STORES.COLLECTION_ITEMS,
      `${options.sourceCollectionId}::${options.itemKey}`
    );
    if (!sourceMembership) return;

    await this.addItemToCollection(options.targetCollectionId, sourceMembership.snapshot, sourceMembership.note);
    if (options.mode === "move") {
      await this.removeItemFromCollection(options.sourceCollectionId, options.itemKey);
    }
  }

  async saveSearchPreset(
    input: Omit<LocalSavedSearchRecord, "id" | "createdAt" | "updatedAt"> & { id?: string }
  ): Promise<LocalSavedSearchRecord> {
    const now = new Date().toISOString();
    const record: LocalSavedSearchRecord = {
      ...input,
      id: input.id || makeUuid(),
      createdAt: now,
      updatedAt: now,
    };
    await this.db.put(LOCAL_STORES.SAVED_SEARCHES, record);
    await enqueueOutboxOp(this.db, {
      entityType: "saved_search",
      action: "upsert",
      entityKey: record.id,
      payload: { record },
    });
    emitLocalChange();
    return record;
  }

  async togglePinSearchPreset(id: string): Promise<void> {
    const existing = await this.db.get<LocalSavedSearchRecord>(LOCAL_STORES.SAVED_SEARCHES, id);
    if (!existing) return;
    const updated = { ...existing, pinned: !existing.pinned, updatedAt: new Date().toISOString() };
    await this.db.put(LOCAL_STORES.SAVED_SEARCHES, updated);
    await enqueueOutboxOp(this.db, {
      entityType: "saved_search",
      action: "upsert",
      entityKey: id,
      payload: { record: updated },
    });
    emitLocalChange();
  }

  async deleteSearchPreset(id: string): Promise<void> {
    await this.db.delete(LOCAL_STORES.SAVED_SEARCHES, id);
    await enqueueOutboxOp(this.db, {
      entityType: "saved_search",
      action: "delete",
      entityKey: id,
      payload: { id },
    });
    emitLocalChange();
  }

  async recordSearchHistory(
    entry: Omit<LocalSearchHistoryRecord, "id" | "submittedAt"> & { submittedAt?: string }
  ): Promise<LocalSearchHistoryRecord> {
    const record: LocalSearchHistoryRecord = {
      ...entry,
      id: makeUuid(),
      submittedAt: entry.submittedAt ?? new Date().toISOString(),
    };
    await this.db.put(LOCAL_STORES.SEARCH_HISTORY, record);
    await enqueueOutboxOp(this.db, {
      entityType: "search_history",
      action: "upsert",
      entityKey: record.id,
      payload: { record },
    });
    emitLocalChange();
    return record;
  }

  async deleteSearchHistoryEntry(id: string): Promise<void> {
    await this.db.delete(LOCAL_STORES.SEARCH_HISTORY, id);
    await enqueueOutboxOp(this.db, {
      entityType: "search_history",
      action: "delete",
      entityKey: id,
      payload: { id },
    });
    emitLocalChange();
  }

  async upsertResearchNote(targetKey: string, content: string): Promise<LocalResearchNoteRecord> {
    const id = `note::${targetKey}`;
    const record: LocalResearchNoteRecord = {
      id,
      targetKey,
      content,
      updatedAt: new Date().toISOString(),
    };
    await this.db.put(LOCAL_STORES.RESEARCH_NOTES, record);
    await enqueueOutboxOp(this.db, {
      entityType: "research_note",
      action: "upsert",
      entityKey: id,
      payload: { record },
    });
    emitLocalChange();
    return record;
  }

  /**
   * Detects abandoned `in_progress` sync journals left by closed tabs/reloads and marks them
   * `interrupted` while verifying queued outbox operations remain safe for retry.
   */
  async recoverInterruptedSyncs(): Promise<{ recoveredCount: number; pendingOpsCount: number }> {
    const journals = await this.db.getAll<SyncJournalEntry>(LOCAL_STORES.SYNC_JOURNAL);
    const interrupted = journals.filter((j) => j.status === "in_progress");
    const now = new Date().toISOString();

    for (const j of interrupted) {
      await this.db.put<SyncJournalEntry>(LOCAL_STORES.SYNC_JOURNAL, {
        ...j,
        status: "interrupted",
        updatedAt: now,
        errorMessage: "Previous sync session ended before server confirmation. Pending operations preserved in outbox.",
      });
    }

    const pending = await this.db.getAll<PendingOutboxOperation>(LOCAL_STORES.PENDING_OPERATIONS);
    for (const op of pending) {
      if (op.status === "syncing") {
        await this.db.put(LOCAL_STORES.PENDING_OPERATIONS, {
          ...op,
          status: "pending",
          updatedAt: now,
        });
      }
    }

    if (interrupted.length > 0) emitLocalChange();
    return { recoveredCount: interrupted.length, pendingOpsCount: pending.length };
  }

  /**
   * Two-phase verified cloud synchronization (`Save All`):
   *   1. Writes `sync_journal` (`in_progress`).
   *   2. Uploads authoritative local datasets + outbox operations to `/api/sync/save-all`.
   *   3. ONLY clears outbox entries after receiving a verified `CLOUD_COMMITTED` receipt.
   */
  async syncNow(): Promise<SaveReceipt> {
    await this.recoverInterruptedSyncs();

    const [savedItems, collections, collectionItems, savedSearches, searchHistory, researchNotes, pendingOps] =
      await Promise.all([
        this.db.getAll<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS),
        this.db.getAll<LocalCollectionRecord>(LOCAL_STORES.COLLECTIONS),
        this.db.getAll<LocalCollectionItemRecord>(LOCAL_STORES.COLLECTION_ITEMS),
        this.db.getAll<LocalSavedSearchRecord>(LOCAL_STORES.SAVED_SEARCHES),
        this.db.getAll<LocalSearchHistoryRecord>(LOCAL_STORES.SEARCH_HISTORY),
        this.db.getAll<LocalResearchNoteRecord>(LOCAL_STORES.RESEARCH_NOTES),
        this.db.getAll<PendingOutboxOperation>(LOCAL_STORES.PENDING_OPERATIONS),
      ]);

    const batchId = makeUuid();
    const idempotencyKey = `save-all-${batchId}`;
    const now = new Date().toISOString();

    const journal: SyncJournalEntry = {
      journalId: makeUuid(),
      batchId,
      status: "in_progress",
      operationIds: pendingOps.map((o) => o.operationId),
      startedAt: now,
      updatedAt: now,
    };
    await this.db.put(LOCAL_STORES.SYNC_JOURNAL, journal);

    try {
      const response = await this.fetchFn("/api/sync/save-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          idempotencyKey,
          datasets: {
            savedItems,
            collections,
            collectionItems,
            savedSearches,
            searchHistory,
            researchNotes,
          },
          pendingOperationIds: pendingOps.map((o) => o.operationId),
        }),
      });

      const body = (await response.json()) as { ok?: boolean; error?: string; receipt?: SaveReceipt };
      if (!response.ok || !body.ok || !body.receipt || body.receipt.stage !== "CLOUD_COMMITTED") {
        const message = body.error || `Sync failed with HTTP ${response.status}`;
        await this.db.put<SyncJournalEntry>(LOCAL_STORES.SYNC_JOURNAL, {
          ...journal,
          status: "failed",
          updatedAt: new Date().toISOString(),
          errorMessage: message,
        });
        for (const op of pendingOps) {
          await this.db.put<PendingOutboxOperation>(LOCAL_STORES.PENDING_OPERATIONS, {
            ...op,
            status: "failed",
            attempts: op.attempts + 1,
            lastError: message,
            updatedAt: new Date().toISOString(),
          });
        }
        const failedReceipt: SaveReceipt = {
          ...createPendingSaveReceipt(batchId, idempotencyKey, {
            savedItems: savedItems.length,
            collections: collections.length,
            collectionItems: collectionItems.length,
            savedSearches: savedSearches.length,
            searchHistory: searchHistory.length,
          }),
          stage: "FAILED",
          errorMessage: message,
        };
        await this.db.put<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, {
          key: "last_save_receipt",
          value: failedReceipt,
          updatedAt: new Date().toISOString(),
        });
        emitLocalChange();
        return failedReceipt;
      }

      // Server confirmed CLOUD_COMMITTED — safe to clear committed outbox entries now.
      for (const op of pendingOps) {
        await this.db.delete(LOCAL_STORES.PENDING_OPERATIONS, op.operationId);
      }

      const finalReceipt: SaveReceipt = {
        ...body.receipt,
        counts: {
          ...body.receipt.counts,
          pendingOperationsCleared: pendingOps.length,
        },
      };

      await this.db.put<SyncJournalEntry>(LOCAL_STORES.SYNC_JOURNAL, {
        ...journal,
        status: "completed",
        updatedAt: new Date().toISOString(),
        completedAt: finalReceipt.completedAt ?? new Date().toISOString(),
      });
      await this.db.put<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, {
        key: "last_save_receipt",
        value: finalReceipt,
        updatedAt: new Date().toISOString(),
      });
      await this.db.put<LocalSyncMetadataRecord>(LOCAL_STORES.LOCAL_SYNC_METADATA, {
        key: "last_cloud_sync_at",
        value: finalReceipt.completedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      emitLocalChange();
      return finalReceipt;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error during cloud sync";
      await this.db.put<SyncJournalEntry>(LOCAL_STORES.SYNC_JOURNAL, {
        ...journal,
        status: "failed",
        updatedAt: new Date().toISOString(),
        errorMessage: message,
      });
      const failedReceipt: SaveReceipt = {
        ...createPendingSaveReceipt(batchId, idempotencyKey, {
          savedItems: savedItems.length,
          collections: collections.length,
          collectionItems: collectionItems.length,
          savedSearches: savedSearches.length,
          searchHistory: searchHistory.length,
        }),
        stage: "FAILED",
        errorMessage: message,
      };
      emitLocalChange();
      return failedReceipt;
    }
  }
}
