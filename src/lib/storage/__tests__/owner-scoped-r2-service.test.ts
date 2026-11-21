import { describe, expect, it } from "vitest";
import {
  uploadOwnerScopedItemsAndTitles,
  verifyLocalItemForSafeDeletion,
  computeSha256,
} from "../owner-scoped-r2-service";
import { R2WorkerClient } from "../r2-worker-client";
import type { LocalSavedItemRecord } from "@/lib/local-first/indexeddb-store";

class MockMemoryR2Client extends R2WorkerClient {
  public store = new Map<string, { body: string; customMetadata?: Record<string, string> }>();

  constructor() {
    super({ workerUrl: "https://mock.worker", hmacSecret: "mock-secret-key-0123456789abcdef" });
  }

  override get configured(): boolean {
    return true;
  }

  override async putObject(
    ownerId: string,
    key: string,
    jsonBody: string,
    customMetadata?: Record<string, string>
  ): Promise<{ ok: boolean; key: string; size: number; etag: string; sha256: string }> {
    this.store.set(key, { body: jsonBody, customMetadata });
    return {
      ok: true,
      key,
      size: jsonBody.length,
      etag: '"mock-etag"',
      sha256: computeSha256(jsonBody),
    };
  }

  override async getObjectText(
    ownerId: string,
    key: string
  ): Promise<{ text: string; etag: string | null; sha256: string | null } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return {
      text: entry.body,
      etag: '"mock-etag"',
      sha256: computeSha256(entry.body),
    };
  }
}

describe("Owner-Scoped R2 Service", () => {
  const sampleItem: LocalSavedItemRecord = {
    compositeKey: "dailymotion:video:x8abc12",
    stableId: "dailymotion:video:x8abc12",
    provider: "dailymotion",
    id: "x8abc12",
    apiVersion: "v2",
    resourceType: "VIDEO",
    title: "Documentary on Deep Space Exploration",
    description: "An in-depth look at our solar system and beyond.",
    url: "https://www.dailymotion.com/video/x8abc12",
    thumbnail: "https://s1.dmcdn.net/v/x8abc12/720",
    ownerName: "CosmoChannel",
    ownerId: "u123456",
    syncStatus: "cloud_verified",
    tags: ["space", "documentary"],
    snapshot: {
      kind: "video",
      apiVersion: "v2",
      id: "x8abc12",
      title: "Documentary on Deep Space Exploration",
      description: "An in-depth look at our solar system and beyond.",
      thumbnail: "https://s1.dmcdn.net/v/x8abc12/720",
      url: "https://www.dailymotion.com/video/x8abc12",
      duration: 3600,
      language: "en",
      country: "US",
      category: "science",
      createdAt: "2026-01-15T12:00:00Z",
      year: 2026,
      tags: ["space", "documentary"],
      ownerId: "u123456",
      ownerName: "CosmoChannel",
      views: 15000,
      extra: {},
      raw: {},
    },
    savedAt: "2026-02-01T10:00:00.000Z",
    updatedAt: "2026-02-01T10:00:00.000Z",
  };

  it("uploads items and titles to separate owner-scoped paths with SHA-256", async () => {
    const client = new MockMemoryR2Client();
    const result = await uploadOwnerScopedItemsAndTitles([sampleItem], "admin-user", client);

    if (!result.ok) {
      console.error("Upload failed with errors:", result.errors);
    }
    expect(result.ok).toBe(true);
    expect(result.itemsUploaded).toBe(1);
    expect(result.titlesUploaded).toBe(1);

    // Verify item object exists under admins/{owner}/dailymotion/items/video/x8abc12.json
    const expectedItemKey = "admins/admin-user/dailymotion/items/video/x8abc12.json";
    const itemEntry = client.store.get(expectedItemKey);
    expect(itemEntry).toBeDefined();
    const parsedItem = JSON.parse(itemEntry!.body);
    expect(parsedItem.id).toBe("x8abc12");
    expect(parsedItem.title).toBe("Documentary on Deep Space Exploration");

    // Verify title object exists under admins/{owner}/dailymotion/titles/video/x8abc12.json
    const expectedTitleKey = "admins/admin-user/dailymotion/titles/video/x8abc12.json";
    const titleEntry = client.store.get(expectedTitleKey);
    expect(titleEntry).toBeDefined();
    const parsedTitle = JSON.parse(titleEntry!.body);
    expect(parsedTitle.id).toBe("x8abc12");
    expect(parsedTitle.title).toBe("Documentary on Deep Space Exploration");
    expect(parsedTitle.sourceApiVersion).toBe("v2");
  });

  it("completes 9-step verification for safe local deletion when items exist in R2", async () => {
    const client = new MockMemoryR2Client();
    await uploadOwnerScopedItemsAndTitles([sampleItem], "admin-user", client);

    const verification = await verifyLocalItemForSafeDeletion(sampleItem, "admin-user", client);
    expect(verification.canDeleteLocally).toBe(true);
    expect(verification.stepResults.step1_localItemValid).toBe(true);
    expect(verification.stepResults.step2_cloudSyncStatusConfirmed).toBe(true);
    expect(verification.stepResults.step3_r2ItemObjectExists).toBe(true);
    expect(verification.stepResults.step4_r2TitleObjectExists).toBe(true);
    expect(verification.stepResults.step5_r2ItemShaMatches).toBe(true);
    expect(verification.stepResults.step6_r2TitleShaMatches).toBe(true);
    expect(verification.stepResults.step7_r2TitleMeaningful).toBe(true);
    expect(verification.stepResults.step8_manifestOrIndexLinked).toBe(true);
    expect(verification.stepResults.step9_deletionClearanceGranted).toBe(true);
  });

  it("refuses local deletion when cloud item or title is missing (prevents premature data loss)", async () => {
    const client = new MockMemoryR2Client();
    // Do not upload to R2
    const verification = await verifyLocalItemForSafeDeletion(sampleItem, "admin-user", client);
    expect(verification.canDeleteLocally).toBe(false);
    expect(verification.stepResults.step3_r2ItemObjectExists).toBe(false);
    expect(verification.reason).toContain("Step 3 failed");
  });
});
