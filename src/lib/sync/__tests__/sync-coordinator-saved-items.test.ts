import { describe, it, expect, beforeEach } from "vitest";
import {
  createMemoryLocalDatabase,
  buildStableDailymotionId,
  LOCAL_STORES,
  type LocalSavedItemRecord,
  type PendingOutboxOperation,
} from "../../local-first/indexeddb-store";
import { SyncCoordinator } from "../sync-coordinator";
import type { DiscoveryItem } from "../../discovery/types";

describe("SyncCoordinator Saved Items & Stable Identity", () => {
  let db: ReturnType<typeof createMemoryLocalDatabase>;
  let coordinator: SyncCoordinator;

  beforeEach(() => {
    db = createMemoryLocalDatabase();
    coordinator = new SyncCoordinator(db);
  });

  const mockVideo: DiscoveryItem = {
    apiVersion: "v1",
    kind: "video",
    id: "x8abc123",
    title: "Awesome Dailymotion Video 2026",
    description: "Sample description",
    thumbnail: "https://www.dailymotion.com/thumbnail/video/x8abc123",
    url: "https://www.dailymotion.com/video/x8abc123",
    duration: 360,
    language: "en",
    country: "US",
    category: "tech",
    createdAt: "2026-05-01T12:00:00Z",
    year: 2026,
    tags: ["tech", "ai", "2026"],
    ownerId: "creator42",
    ownerName: "Tech Insider",
    views: 12500,
    extra: {
      likes_total: 450,
      country: "US",
      channel: "tech",
    },
    raw: {},
  };

  const mockChannel: DiscoveryItem = {
    apiVersion: "v1",
    kind: "channel",
    id: "ch_science",
    title: "Science & Nature Hub",
    description: "Official channel",
    thumbnail: "https://www.dailymotion.com/avatar/ch_science",
    url: "https://www.dailymotion.com/ch_science",
    duration: null,
    language: "fr",
    country: "FR",
    category: null,
    createdAt: null,
    year: null,
    tags: ["science"],
    ownerId: "ch_science",
    ownerName: "Science & Nature Hub",
    views: null,
    extra: {},
    raw: {},
  };

  it("builds correct stable identity for videos and channels", () => {
    expect(buildStableDailymotionId("video", "x8abc123")).toBe("dailymotion:video:x8abc123");
    expect(buildStableDailymotionId("channel", "ch_science")).toBe("dailymotion:channel:ch_science");
  });

  it("saves video item with stable ID, metadata, and enqueues outbox operation", async () => {
    const record = await coordinator.saveItem(mockVideo, {
      sourcePage: "unified-search",
      sourceQuery: "artificial intelligence",
      country: "US",
      category: "tech",
      collectionIds: ["col-1"],
    });

    expect(record.stableId).toBe("dailymotion:video:x8abc123");
    expect(record.provider).toBe("dailymotion");
    expect(record.compositeKey).toBe("v1:video:x8abc123");
    expect(record.country).toBe("US");
    expect(record.category).toBe("tech");
    expect(record.sourceQuery).toBe("artificial intelligence");
    expect(record.collectionIds).toEqual(["col-1"]);

    // Verify written to database
    const stored = await db.get<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS, "v1:video:x8abc123");
    expect(stored).toBeDefined();
    expect(stored?.title).toBe("Awesome Dailymotion Video 2026");

    // Verify outbox queued
    const ops = await db.getAll<PendingOutboxOperation>(LOCAL_STORES.PENDING_OPERATIONS);
    expect(ops.length).toBe(1);
    expect(ops[0].entityType).toBe("saved_item");
    expect(ops[0].action).toBe("upsert");
    expect(ops[0].status).toBe("pending");
  });

  it("checks whether item is saved using raw id, composite key, or stable id", async () => {
    await coordinator.saveItem(mockVideo);

    expect(await coordinator.isItemSaved(mockVideo)).toBe(true);
    expect(await coordinator.isItemSaved("v1:video:x8abc123")).toBe(true);
    expect(await coordinator.isItemSaved("x8abc123")).toBe(true);
    expect(await coordinator.isItemSaved("dailymotion:video:x8abc123")).toBe(true);

    expect(await coordinator.isItemSaved("not_saved")).toBe(false);
  });

  it("removes single item and queues deletion in outbox", async () => {
    await coordinator.saveItem(mockVideo);
    expect(await coordinator.isItemSaved(mockVideo)).toBe(true);

    const removed = await coordinator.removeItem("dailymotion:video:x8abc123");
    expect(removed).toBe(true);
    expect(await coordinator.isItemSaved(mockVideo)).toBe(false);

    const ops = await db.getAll<PendingOutboxOperation>(LOCAL_STORES.PENDING_OPERATIONS);
    const deleteOp = ops.find((o) => o.action === "delete");
    expect(deleteOp).toBeDefined();
  });

  it("removes multiple items in batch", async () => {
    await coordinator.saveItem(mockVideo);
    await coordinator.saveItem(mockChannel);

    expect(await coordinator.isItemSaved(mockVideo)).toBe(true);
    expect(await coordinator.isItemSaved(mockChannel)).toBe(true);

    const removedCount = await coordinator.removeItemsBatch([
      "v1:video:x8abc123",
      "v1:channel:ch_science",
    ]);
    expect(removedCount).toBe(2);

    expect(await coordinator.isItemSaved(mockVideo)).toBe(false);
    expect(await coordinator.isItemSaved(mockChannel)).toBe(false);
  });
});
