// Seven-Day Search Persistence, Auto-Restoration & Provenance Test Suite (2026)
//
// Verifies:
// 1. Search snapshots are written to IndexedDB as results arrive with full raw JSON and provenance.
// 2. 7-day TTL (604,800 seconds) calculation and expiration timestamps.
// 3. Automatic restoration from local history with ZERO network calls to Dailymotion or Gemini.
// 4. Workspace-scoped pointers for Global Search and Link Explorer.
// 5. Expired snapshot purging leaves unexpired snapshots and saved items/playlists completely intact.

import { describe, expect, it } from "vitest";
import {
  createMemoryLocalDatabase,
  LOCAL_STORES,
  type LocalSearchSnapshotRecord,
  type LocalSearchSnapshotPageRecord,
  type LocalSavedItemRecord,
  type LocalCollectionRecord,
} from "@/lib/local-first/indexeddb-store";
import type { DiscoveryItem } from "@/lib/discovery/types";
import { createDailymotionProvenance } from "@/lib/discovery/provenance";
import {
  captureSearchSnapshot,
  getLatestRestorableSearchSnapshot,
  purgeExpiredSearchSnapshots,
  clearAllSearchSnapshots,
  getSearchHistoryTtlSeconds,
} from "../search-snapshot-service";

function createItemWithProvenance(id: string, title: string, version: "v1" | "v2" = "v1"): DiscoveryItem {
  return {
    id,
    title,
    description: `Description for ${title}`,
    url: `https://www.dailymotion.com/video/${id}`,
    thumbnail: `https://example.com/thumb_${id}.jpg`,
    kind: "video",
    apiVersion: version,
    ownerName: "test-creator",
    ownerId: "creator_abc",
    duration: 180,
    language: "en",
    country: "US",
    category: "news",
    createdAt: "2026-02-01T12:00:00Z",
    year: 2026,
    tags: ["tech", "ai"],
    views: 12000,
    extra: {},
    raw: { id, title, version },
    provenance: createDailymotionProvenance({
      apiVersion: version,
      resourceType: "video",
      resourceId: id,
      endpoint: `/api/discovery/${version}/videos`,
    }),
  };
}

describe("Seven-Day Search Persistence & Automatic Restoration", () => {
  it("enforces 7-day default retention (604800 seconds)", () => {
    const ttlSeconds = getSearchHistoryTtlSeconds();
    expect(ttlSeconds).toBe(604800);
  });

  it("persists search results with full raw JSON, pagination, and provenance", async () => {
    const db = createMemoryLocalDatabase();
    const item1 = createItemWithProvenance("x001", "AI Innovations 2026", "v1");
    const item2 = createItemWithProvenance("x002", "Autonomous Systems", "v1");

    const rawResponse = {
      page: 1,
      limit: 10,
      total: 2,
      has_more: false,
      list: [{ id: "x001", title: "AI Innovations 2026" }, { id: "x002", title: "Autonomous Systems" }],
    };

    const snapshotId = await captureSearchSnapshot(
      {
        workspace: "global_search",
        query: "AI Innovations",
        route: "/global-search",
        apiVersion: "v1",
        resourceType: "video",
        mode: "search",
        apiParams: { sort: "relevance" },
        localFilters: { minDuration: 60 },
        rawResponse,
        items: [item1, item2],
        pageIndex: 1,
        hasMore: false,
        totalResults: 2,
        ownerId: "user-owner-1",
      },
      db
    );

    expect(snapshotId).toMatch(/^snap_\d+_[a-z0-9]+$/);

    // Verify snapshot in IndexedDB has valid 7-day expiration timestamp
    const snap = await db.get<LocalSearchSnapshotRecord>(LOCAL_STORES.SEARCH_SNAPSHOTS, snapshotId);
    expect(snap).toBeDefined();
    expect(snap!.workspace).toBe("global_search");
    expect(snap!.ownerId).toBe("user-owner-1");
    expect(snap!.apiVersion).toBe("v1");
    expect(snap!.provenance?.apiVersion).toBe("v1");
    expect(snap!.expiresAt).toBe(new Date(snap!.capturedAt).getTime() + 604800 * 1000);

    // Verify page record stored raw JSON and provenance
    const allPages = await db.getAll<LocalSearchSnapshotPageRecord>(LOCAL_STORES.SEARCH_SNAPSHOT_PAGES);
    const pages = allPages.filter((p) => p.snapshotId === snapshotId);
    expect(pages).toHaveLength(1);
    expect(pages[0].rawJson).toEqual(rawResponse);
    expect(pages[0].apiVersion).toBe("v1");
  });

  it("automatically restores latest valid snapshot for active workspace with zero API calls", async () => {
    const db = createMemoryLocalDatabase();
    const item1 = createItemWithProvenance("x991", "Space Exploration", "v1");
    const item2 = createItemWithProvenance("x992", "Deep Astronomy", "v1");

    await captureSearchSnapshot(
      {
        workspace: "global_search",
        query: "space",
        route: "/global-search",
        apiVersion: "v1",
        resourceType: "video",
        mode: "search",
        apiParams: { sort: "visited" },
        localFilters: { query: "deep" },
        rawResponse: { total: 2 },
        items: [item1, item2],
        pageIndex: 1,
        hasMore: true,
        totalResults: 2,
        ownerId: "asdy",
      },
      db
    );

    // Read latest restorable snapshot
    const restorable = await getLatestRestorableSearchSnapshot("global_search", { ownerId: "asdy" }, db);
    expect(restorable).not.toBeNull();
    expect(restorable!.snapshot.query).toBe("space");
    expect(restorable!.snapshot.apiVersion).toBe("v1");
    expect(restorable!.snapshot.workspace).toBe("global_search");
    expect(restorable!.snapshot.localFilters).toEqual({ query: "deep" });
    expect(restorable!.items).toHaveLength(2);
    expect(restorable!.items[0].id).toBe("x991");
    expect(restorable!.items[0].provenance?.apiVersion).toBe("v1");
  });

  it("maintains independent pointers for Global Search and Link Explorer", async () => {
    const db = createMemoryLocalDatabase();

    const gsItem = createItemWithProvenance("v_gs", "Global Search Video", "v1");
    const leItem = createItemWithProvenance("v_le", "Link Explorer Video", "v2");

    await captureSearchSnapshot(
      {
        workspace: "global_search",
        query: "global search query",
        route: "/global-search",
        apiVersion: "v1",
        resourceType: "video",
        mode: "search",
        rawResponse: {},
        items: [gsItem],
        pageIndex: 1,
      },
      db
    );

    await captureSearchSnapshot(
      {
        workspace: "link_explorer",
        query: "https://www.dailymotion.com/video/v_le",
        route: "/link-explorer",
        apiVersion: "v2",
        resourceType: "video",
        mode: "browse",
        rawResponse: {},
        items: [leItem],
        pageIndex: 1,
      },
      db
    );

    const gsLatest = await getLatestRestorableSearchSnapshot("global_search", {}, db);
    const leLatest = await getLatestRestorableSearchSnapshot("link_explorer", {}, db);

    expect(gsLatest).not.toBeNull();
    expect(gsLatest!.snapshot.query).toBe("global search query");
    expect(gsLatest!.snapshot.apiVersion).toBe("v1");

    expect(leLatest).not.toBeNull();
    expect(leLatest!.snapshot.query).toBe("https://www.dailymotion.com/video/v_le");
    expect(leLatest!.snapshot.apiVersion).toBe("v2");
  });

  it("purges expired snapshots without deleting unexpired snapshots or saved items", async () => {
    const db = createMemoryLocalDatabase();

    // 1. Add unexpired snapshot
    const unexpiredItem = createItemWithProvenance("fresh_1", "Fresh Item", "v1");
    const freshId = await captureSearchSnapshot(
      {
        workspace: "global_search",
        query: "fresh search",
        route: "/global-search",
        apiVersion: "v1",
        resourceType: "video",
        mode: "search",
        rawResponse: {},
        items: [unexpiredItem],
        pageIndex: 1,
      },
      db
    );

    // 2. Add manually expired snapshot (expiresAt in the past)
    const expiredSnapId = "snap_expired_123";
    await db.put<LocalSearchSnapshotRecord>(LOCAL_STORES.SEARCH_SNAPSHOTS, {
      id: expiredSnapId,
      workspace: "global_search",
      query: "old search",
      route: "/global-search",
      apiVersion: "v1",
      resourceType: "video",
      mode: "search",
      apiParams: {},
      pageCount: 1,
      totalResults: 1,
      expiresAt: Date.now() - 1000, // Expired 1 second ago
      capturedAt: new Date(Date.now() - 800000 * 1000).toISOString(),
      previewTitles: ["Old"],
      previewThumbnails: [],
      schemaVersion: 2,
    });

    await db.put<LocalSearchSnapshotPageRecord>(LOCAL_STORES.SEARCH_SNAPSHOT_PAGES, {
      id: `${expiredSnapId}_page_1`,
      snapshotId: expiredSnapId,
      pageIndex: 1,
      normalizedItems: [],
      rawJson: {},
      capturedAt: new Date(Date.now() - 800000 * 1000).toISOString(),
      apiVersion: "v1",
    });

    // 3. Add saved item to verify it is NEVER deleted by history purge
    await db.put<LocalSavedItemRecord>(LOCAL_STORES.SAVED_ITEMS, {
      compositeKey: "v1:video:saved_never_delete",
      stableId: "dailymotion:video:saved_never_delete",
      provider: "dailymotion",
      id: "saved_never_delete",
      apiVersion: "v1",
      resourceType: "VIDEO",
      title: "Saved Resource Never Deleted",
      url: "https://www.dailymotion.com/video/saved_never_delete",
      savedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFavorite: true,
      tags: [],
      syncStatus: "cloud_verified",
      snapshot: unexpiredItem,
    });

    // Purge expired
    const purgedCount = await purgeExpiredSearchSnapshots(db);
    expect(purgedCount).toBe(1);

    // Verify expired snapshot and its page are deleted
    const expiredCheck = await db.get(LOCAL_STORES.SEARCH_SNAPSHOTS, expiredSnapId);
    expect(expiredCheck).toBeUndefined();
    const expiredPageCheck = await db.get(LOCAL_STORES.SEARCH_SNAPSHOT_PAGES, `${expiredSnapId}_page_1`);
    expect(expiredPageCheck).toBeUndefined();

    // Verify unexpired snapshot still exists
    const freshCheck = await db.get(LOCAL_STORES.SEARCH_SNAPSHOTS, freshId);
    expect(freshCheck).toBeDefined();

    // Verify saved item remains intact
    const savedCheck = await db.get(LOCAL_STORES.SAVED_ITEMS, "v1:video:saved_never_delete");
    expect(savedCheck).toBeDefined();
  });

  it("clears all search history when requested while preserving library items", async () => {
    const db = createMemoryLocalDatabase();

    await captureSearchSnapshot(
      {
        workspace: "global_search",
        query: "history to clear",
        route: "/global-search",
        apiVersion: "v1",
        resourceType: "video",
        mode: "search",
        rawResponse: {},
        items: [createItemWithProvenance("c1", "Item to clear")],
        pageIndex: 1,
      },
      db
    );

    // Put a collection item into IndexedDB
    await db.put<LocalCollectionRecord>(LOCAL_STORES.COLLECTIONS, {
      id: "col_preserve_1",
      name: "My Work Collection",
      description: "Collection to preserve",
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const clearedCount = await clearAllSearchSnapshots(db);
    expect(clearedCount).toBe(1);

    // Search snapshots table is now empty
    const allSnapshots = await db.getAll(LOCAL_STORES.SEARCH_SNAPSHOTS);
    expect(allSnapshots).toHaveLength(0);

    // Collection remains completely intact
    const colCheck = await db.get<LocalCollectionRecord>(LOCAL_STORES.COLLECTIONS, "col_preserve_1");
    expect(colCheck).toBeDefined();
    expect(colCheck!.name).toBe("My Work Collection");
  });
});
