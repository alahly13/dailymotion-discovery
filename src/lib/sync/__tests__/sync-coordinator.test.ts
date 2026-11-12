import { describe, expect, it } from "vitest";
import { createMemoryLocalDatabase, LOCAL_STORES, type SyncJournalEntry } from "@/lib/local-first/indexeddb-store";
import { hydrateFromCloudAndMerge, readLocalWorkspaceSnapshot } from "../cloud-hydration-service";
import { SyncCoordinator } from "../sync-coordinator";
import type { DiscoveryItem } from "@/lib/discovery/types";

function makeSampleItem(id: string, title: string, apiVersion: "v1" | "v2" = "v1"): DiscoveryItem {
  return {
    id,
    apiVersion,
    kind: "video",
    title,
    description: "channel-1 sample clip",
    thumbnail: null,
    url: `https://www.dailymotion.com/video/${id}`,
    duration: 180,
    language: "en",
    country: "US",
    category: "news",
    createdAt: "2026-10-01T10:00:00.000Z",
    year: 2026,
    tags: ["news"],
    ownerId: "ch-1",
    ownerName: "Channel One",
    views: 1200,
    extra: {
      likes_total: 40,
    },
    raw: { id },
  };
}

describe("Local-first SyncCoordinator & Cloud Hydration", () => {
  it("records mutations into outbox, retains outbox on failure, and clears only on CLOUD_COMMITTED", async () => {
    const db = createMemoryLocalDatabase();

    // Failing fetch first: outbox must survive!
    const failingCoordinator = new SyncCoordinator(db, async () => {
      return new Response(JSON.stringify({ ok: false, error: "Simulated R2 outage" }), { status: 503 });
    });

    const item = makeSampleItem("x9abc01", "Breaking News Clip");
    await failingCoordinator.toggleSaveItem(item);
    const col = await failingCoordinator.createCollection({ name: "Verification Desk", description: "Field clips" });
    await failingCoordinator.addItemToCollection(col.id, item, "Primary broadcast source");

    const beforeSync = await readLocalWorkspaceSnapshot(db);
    expect(beforeSync.savedItems).toHaveLength(1);
    expect(beforeSync.collections).toHaveLength(1);
    expect(beforeSync.collectionItems).toHaveLength(1);
    expect(beforeSync.pendingOperations).toHaveLength(3);

    const failedReceipt = await failingCoordinator.syncNow();
    expect(failedReceipt.stage).toBe("FAILED");

    const afterFail = await readLocalWorkspaceSnapshot(db);
    expect(afterFail.pendingOperations).toHaveLength(3);

    // Succeeding fetch: outbox clears and receipt commits!
    const okCoordinator = new SyncCoordinator(db, async (_url, init) => {
      const payload = JSON.parse(String(init?.body)) as { batchId: string; idempotencyKey: string };
      return new Response(
        JSON.stringify({
          ok: true,
          receipt: {
            batchId: payload.batchId,
            idempotencyKey: payload.idempotencyKey,
            stage: "CLOUD_COMMITTED",
            targetBackend: "r2-worker+postgres",
            startedAt: "2026-11-12T15:00:00.000Z",
            completedAt: "2026-11-12T15:00:01.000Z",
            generationIds: { "saved-items": "gen-1" },
            counts: {
              savedItems: 1,
              collections: 1,
              collectionItems: 1,
              savedSearches: 0,
              searchHistory: 0,
              pendingOperationsCleared: 3,
            },
            verifiedByWorker: true,
          },
        }),
        { status: 200 }
      );
    });

    const okReceipt = await okCoordinator.syncNow();
    expect(okReceipt.stage).toBe("CLOUD_COMMITTED");
    expect(okReceipt.verifiedByWorker).toBe(true);

    const afterCommit = await readLocalWorkspaceSnapshot(db);
    expect(afterCommit.pendingOperations).toHaveLength(0);
    expect(afterCommit.lastReceipt?.stage).toBe("CLOUD_COMMITTED");
  });

  it("recovers interrupted sync journals and respects local delete tombstones during cloud hydration", async () => {
    const db = createMemoryLocalDatabase();
    const coord = new SyncCoordinator(db);

    const itemKeep = makeSampleItem("xkeep1", "Keep Me");
    const itemDelete = makeSampleItem("xdel2", "Delete Me Locally");
    await coord.toggleSaveItem(itemKeep);
    await coord.toggleSaveItem(itemDelete);
    // Toggle delete again to create a local delete tombstone in outbox
    await coord.toggleSaveItem(itemDelete);

    // Inject stale in_progress sync journal simulating abrupt browser close
    await db.put<SyncJournalEntry>(LOCAL_STORES.SYNC_JOURNAL, {
      journalId: "j-interrupted",
      batchId: "b-1",
      status: "in_progress",
      operationIds: [],
      startedAt: "2026-11-12T14:00:00.000Z",
      updatedAt: "2026-11-12T14:00:00.000Z",
    });

    const recovery = await coord.recoverInterruptedSyncs();
    expect(recovery.recoveredCount).toBe(1);

    const remoteItemExtra = makeSampleItem("xcloud3", "Synced From Other Device");
    await hydrateFromCloudAndMerge(db, async () =>
      new Response(
        JSON.stringify({
          ok: true,
          source: "r2-worker",
          hydratedAt: "2026-11-12T16:00:00.000Z",
          datasets: {
            savedItems: [
              {
                compositeKey: "v1:video:xdel2",
                id: "xdel2",
                apiVersion: "v1",
                resourceType: "video",
                title: "Delete Me Locally",
                url: remoteItemExtra.url,
                tags: [],
                snapshot: itemDelete,
                savedAt: "2026-11-12T10:00:00.000Z",
                updatedAt: "2026-11-12T10:00:00.000Z",
              },
              {
                compositeKey: "v1:video:xcloud3",
                id: "xcloud3",
                apiVersion: "v1",
                resourceType: "video",
                title: "Synced From Other Device",
                url: remoteItemExtra.url,
                tags: [],
                snapshot: remoteItemExtra,
                savedAt: "2026-11-12T11:00:00.000Z",
                updatedAt: "2026-11-12T11:00:00.000Z",
              },
            ],
            collections: [],
            collectionItems: [],
            savedSearches: [],
            searchHistory: [],
            researchNotes: [],
          },
        }),
        { status: 200 }
      )
    );

    const merged = await readLocalWorkspaceSnapshot(db);
    const ids = merged.savedItems.map((i) => i.id);
    expect(ids).toContain("xkeep1");
    expect(ids).toContain("xcloud3");
    expect(ids).not.toContain("xdel2");
    expect(merged.interruptedJournals).toHaveLength(1);
  });
});
