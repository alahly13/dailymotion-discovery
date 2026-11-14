import { describe, expect, it } from "vitest";
import { createMemoryLocalDatabase } from "@/lib/local-first/indexeddb-store";
import {
  getAllOwnerSavedTitles,
  getPendingOwnerSavedTitles,
  getCloudSyncedOwnerSavedTitles,
  saveLocalSavedTitle,
  updateLocalSavedTitle,
  deleteLocalSavedTitle,
  markCommittedSavedTitles,
  buildLocalSavedTitlesManifest,
} from "../local-storage";
import type { SavedTitleEntry } from "../types";

describe("Saved Titles — Owner-Scoped Local Browser Persistence", () => {
  it("enforces strict owner isolation: user A cannot read user B's records", async () => {
    const memoryDb = createMemoryLocalDatabase();
    const userA = "11111111-1111-1111-1111-111111111111";
    const userB = "22222222-2222-2222-2222-222222222222";

    const entryA: SavedTitleEntry = {
      id: "st_a1",
      ownerId: userA,
      kind: "search_query",
      value: "molecular biology",
      displayTitle: "molecular biology",
      source: { workspace: "global-search", label: "Global Search", apiVersion: "v1", resourceType: null },
      addedBy: { type: "search-action" },
      createdAt: "2026-11-14T10:00:00.000Z",
      updatedAt: "2026-11-14T10:00:00.000Z",
      resourceType: null,
      canonicalUrl: null,
      status: "pending_sync",
    };

    const entryB: SavedTitleEntry = {
      id: "st_b1",
      ownerId: userB,
      kind: "url",
      value: "https://www.dailymotion.com/video/x8n8x8",
      displayTitle: "Test Video",
      source: { workspace: "link-explorer", label: "Link Explorer", apiVersion: "v2", resourceType: "video" },
      addedBy: { type: "link-action" },
      createdAt: "2026-11-14T11:00:00.000Z",
      updatedAt: "2026-11-14T11:00:00.000Z",
      resourceType: "video",
      canonicalUrl: "https://www.dailymotion.com/video/x8n8x8",
      status: "pending_sync",
    };

    await saveLocalSavedTitle(entryA, memoryDb);
    await saveLocalSavedTitle(entryB, memoryDb);

    const titlesForA = await getAllOwnerSavedTitles(userA, memoryDb);
    const titlesForB = await getAllOwnerSavedTitles(userB, memoryDb);

    expect(titlesForA.length).toBe(1);
    expect(titlesForA[0].id).toBe("st_a1");
    expect(titlesForA[0].value).toBe("molecular biology");

    expect(titlesForB.length).toBe(1);
    expect(titlesForB[0].id).toBe("st_b1");
    expect(titlesForB[0].value).toBe("https://www.dailymotion.com/video/x8n8x8");
  });

  it("distinguishes pending sync records from committed cloud-synced records", async () => {
    const memoryDb = createMemoryLocalDatabase();
    const ownerId = "owner-uuid-100";

    const item1: SavedTitleEntry = {
      id: "st_1",
      ownerId,
      kind: "search_query",
      value: "science news",
      displayTitle: "science news",
      source: { workspace: "global-search", label: "Global Search", apiVersion: "v1", resourceType: null },
      addedBy: { type: "search-action" },
      createdAt: "2026-11-14T12:00:00.000Z",
      updatedAt: "2026-11-14T12:00:00.000Z",
      resourceType: null,
      canonicalUrl: null,
      status: "pending_sync",
    };

    const item2: SavedTitleEntry = {
      id: "st_2",
      ownerId,
      kind: "handle",
      value: "@lemonde",
      displayTitle: "Le Monde Channel",
      source: { workspace: "link-explorer", label: "Link Explorer", apiVersion: "v1", resourceType: "channel" },
      addedBy: { type: "link-action" },
      createdAt: "2026-11-14T12:05:00.000Z",
      updatedAt: "2026-11-14T12:05:00.000Z",
      resourceType: "channel",
      canonicalUrl: "https://www.dailymotion.com/lemonde",
      status: "cloud_synced",
    };

    await saveLocalSavedTitle(item1, memoryDb);
    await saveLocalSavedTitle(item2, memoryDb);

    const pending = await getPendingOwnerSavedTitles(ownerId, memoryDb);
    const cloud = await getCloudSyncedOwnerSavedTitles(ownerId, memoryDb);

    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe("st_1");

    expect(cloud.length).toBe(1);
    expect(cloud[0].id).toBe("st_2");
  });

  it("moves committed records to cloud_synced status after successful cloud commit", async () => {
    const memoryDb = createMemoryLocalDatabase();
    const ownerId = "owner-uuid-commit";

    const item: SavedTitleEntry = {
      id: "st_pending_1",
      ownerId,
      kind: "search_query",
      value: "quantum computing",
      displayTitle: "quantum computing",
      source: { workspace: "global-search", label: "Global Search", apiVersion: "v1", resourceType: null },
      addedBy: { type: "search-action" },
      createdAt: "2026-11-14T13:00:00.000Z",
      updatedAt: "2026-11-14T13:00:00.000Z",
      resourceType: null,
      canonicalUrl: null,
      status: "pending_sync",
    };

    await saveLocalSavedTitle(item, memoryDb);

    expect((await getPendingOwnerSavedTitles(ownerId, memoryDb)).length).toBe(1);

    await markCommittedSavedTitles(
      ownerId,
      ["st_pending_1"],
      { revision: 1, generationId: "gen-1", sha256: "abc123sha", uploadedAt: "2026-11-14T13:01:00.000Z" },
      memoryDb
    );

    const pendingAfter = await getPendingOwnerSavedTitles(ownerId, memoryDb);
    const cloudAfter = await getCloudSyncedOwnerSavedTitles(ownerId, memoryDb);

    expect(pendingAfter.length).toBe(0);
    expect(cloudAfter.length).toBe(1);
    expect(cloudAfter[0].status).toBe("cloud_synced");
    expect(cloudAfter[0].syncReceipt?.revision).toBe(1);
  });

  it("constructs a valid versioned manifest document matching schema", async () => {
    const memoryDb = createMemoryLocalDatabase();
    const ownerId = "owner-uuid-manifest";

    await saveLocalSavedTitle(
      {
        id: "st_m1",
        ownerId,
        kind: "text_reference",
        value: "manual reference note",
        displayTitle: "manual reference note",
        source: { workspace: "admin-manual", label: "Admin Manual", apiVersion: null, resourceType: null },
        addedBy: { type: "administrator" },
        createdAt: "2026-11-14T14:00:00.000Z",
        updatedAt: "2026-11-14T14:00:00.000Z",
        resourceType: null,
        canonicalUrl: null,
        status: "pending_sync",
      },
      memoryDb
    );

    const manifest = await buildLocalSavedTitlesManifest(ownerId, memoryDb);

    expect(manifest.manifestVersion).toBe(1);
    expect(manifest.manifestType).toBe("saved-titles");
    expect(manifest.provider).toBe("dailymotion-discovery");
    expect(manifest.owner.ownerId).toBe(ownerId);
    expect(manifest.entries.length).toBe(1);
    expect(manifest.entries[0].addedBy.type).toBe("administrator");
  });
});
