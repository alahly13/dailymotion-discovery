import { describe, expect, it } from "vitest";
import { createMemoryLocalDatabase } from "@/lib/local-first/indexeddb-store";
import type { DiscoveryItem } from "@/lib/discovery/types";
import {
  captureSearchSnapshot,
  appendSearchSnapshotPage,
  replaySearchSnapshot,
  listActiveSearchSnapshots,
  removeSearchSnapshot,
  getSearchHistoryTtlSeconds,
} from "../search-snapshot-service";

function createMockItem(id: string, title: string, kind: "video" | "channel" = "video"): DiscoveryItem {
  return {
    id,
    title,
    description: `Description for ${title}`,
    url: `https://www.dailymotion.com/video/${id}`,
    thumbnail: `https://example.com/thumb_${id}.jpg`,
    kind,
    apiVersion: "v1",
    ownerName: "test-creator",
    ownerId: "creator_123",
    duration: 120,
    language: "en",
    country: "US",
    category: "news",
    createdAt: "2026-01-01T00:00:00Z",
    year: 2026,
    tags: ["news", "space"],
    views: 4500,
    extra: {},
    raw: { id, title },
  };
}

describe("Search Snapshot & Offline Replay Service", () => {
  it("resolves default TTL to 604800 seconds (7 days)", () => {
    const ttl = getSearchHistoryTtlSeconds();
    expect(ttl).toBeGreaterThanOrEqual(60);
    expect(ttl).toBe(604800);
  });

  it("captures search execution with full raw API payload and normalized items", async () => {
    const db = createMemoryLocalDatabase();
    const item1 = createMockItem("x123", "Breaking Space News");
    const item2 = createMockItem("x124", "Mars Rover Discovery");
    const rawPayload = {
      page: 1,
      limit: 10,
      explicit: false,
      total: 2,
      has_more: false,
      list: [{ id: "x123", title: "Breaking Space News" }, { id: "x124", title: "Mars Rover Discovery" }],
    };

    const snapshotId = await captureSearchSnapshot(
      {
        query: "space news",
        route: "/search",
        apiVersion: "v1",
        resourceType: "video",
        mode: "search",
        apiParams: { fields: "id,title,duration", sort: "relevance" },
        localFilters: { minDuration: 60 },
        rawResponse: rawPayload,
        items: [item1, item2],
        pageIndex: 1,
        totalResults: 2,
      },
      db
    );

    expect(snapshotId).toMatch(/^snap_\d+_[a-z0-9]+$/);

    const replayed = await replaySearchSnapshot(snapshotId, db);
    expect(replayed).not.toBeNull();
    expect(replayed!.snapshot.query).toBe("space news");
    expect(replayed!.snapshot.route).toBe("/search");
    expect(replayed!.snapshot.totalResults).toBe(2);
    expect(replayed!.snapshot.previewThumbnails).toHaveLength(2);
    expect(replayed!.snapshot.previewThumbnails?.[0]).toBe("https://example.com/thumb_x123.jpg");
    expect(replayed!.snapshot.previewTitles).toContain("Breaking Space News");

    expect(replayed!.pages).toHaveLength(1);
    expect(replayed!.pages[0].rawJson).toEqual(rawPayload);
    expect(replayed!.items).toHaveLength(2);
    expect(replayed!.items[0].id).toBe("x123");
    expect(replayed!.isExpired).toBe(false);
  });

  it("appends subsequent pages without losing earlier page data", async () => {
    const db = createMemoryLocalDatabase();
    const page1Item = createMockItem("p1", "Page 1 Item");
    const page2Item = createMockItem("p2", "Page 2 Item");

    const snapshotId = await captureSearchSnapshot(
      {
        query: "astronomy",
        route: "/video-discovery",
        apiVersion: "v2",
        resourceType: "video",
        rawResponse: { page: 1 },
        items: [page1Item],
        pageIndex: 1,
      },
      db
    );

    await appendSearchSnapshotPage(snapshotId, 2, { page: 2 }, [page2Item], db);

    const replayed = await replaySearchSnapshot(snapshotId, db);
    expect(replayed!.pages).toHaveLength(2);
    expect(replayed!.items).toHaveLength(2);
    expect(replayed!.items.map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(replayed!.snapshot.pageCount).toBe(2);
  });

  it("lists active snapshots and deletes cleanly", async () => {
    const db = createMemoryLocalDatabase();
    const item = createMockItem("del1", "To Be Deleted");

    const snapId = await captureSearchSnapshot(
      {
        query: "delete test",
        route: "/search",
        apiVersion: "v1",
        resourceType: "video",
        rawResponse: {},
        items: [item],
      },
      db
    );

    const activeList = await listActiveSearchSnapshots(db);
    expect(activeList.some((s) => s.id === snapId)).toBe(true);

    await removeSearchSnapshot(snapId, db);

    const afterDelete = await listActiveSearchSnapshots(db);
    expect(afterDelete.some((s) => s.id === snapId)).toBe(false);

    const replayed = await replaySearchSnapshot(snapId, db);
    expect(replayed).toBeNull();
  });
});
