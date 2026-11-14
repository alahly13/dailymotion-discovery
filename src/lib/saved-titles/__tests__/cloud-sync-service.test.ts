import { describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { executeSavedTitlesCloudSync } from "../cloud-sync-service";
import type { SavedTitleEntry, SavedTitlesManifest } from "../types";
import type { R2WorkerClient } from "@/lib/storage/r2-worker-client";

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

describe("Saved Titles Cloudflare R2 Cloud Synchronization Protocol", () => {
  const testOwnerId = "00000000-0000-0000-0000-000000000001";

  const samplePendingEntry: SavedTitleEntry = {
    id: "st_srch_test_1",
    ownerId: testOwnerId,
    kind: "search_query",
    value: "molecular biology",
    displayTitle: "molecular biology",
    source: {
      workspace: "global-search",
      label: "Global Search",
      apiVersion: "v2",
      resourceType: null,
    },
    addedBy: {
      type: "search-action",
    },
    createdAt: "2026-11-14T10:00:00.000Z",
    updatedAt: "2026-11-14T10:00:00.000Z",
    resourceType: null,
    canonicalUrl: null,
    notes: null,
    status: "pending_sync",
  };

  it("fails closed at prepare phase if R2 worker client is not configured", async () => {
    const unconfiguredClient = {
      configured: false,
    } as unknown as R2WorkerClient;

    const result = await executeSavedTitlesCloudSync(
      {
        ownerId: testOwnerId,
        pendingEntries: [samplePendingEntry],
      },
      { r2Client: unconfiguredClient, db: null }
    );

    expect(result.ok).toBe(false);
    expect(result.phase).toBe("prepare");
    expect(result.error).toContain("Cloudflare R2 Worker is not configured");
  });

  it("executes 4-phase initial sync when no cloud manifest exists yet", async () => {
    const r2Store = new Map<string, string>();

    const mockR2 = {
      configured: true,
      getObjectJson: vi.fn().mockImplementation(async (_owner: string, key: string) => {
        const text = r2Store.get(key);
        if (!text) return null;
        return { data: JSON.parse(text), sha256: sha256(text) };
      }),
      putObject: vi.fn().mockImplementation(async (_owner: string, key: string, content: string) => {
        r2Store.set(key, content);
        return { ok: true, key, size: Buffer.byteLength(content), etag: "mock-etag", sha256: sha256(content) };
      }),
      getObjectText: vi.fn().mockImplementation(async (_owner: string, key: string) => {
        const text = r2Store.get(key);
        if (!text) return null;
        return { text, etag: "mock-etag", sha256: sha256(text) };
      }),
    } as unknown as R2WorkerClient;

    const result = await executeSavedTitlesCloudSync(
      {
        ownerId: testOwnerId,
        pendingEntries: [samplePendingEntry],
      },
      { r2Client: mockR2, db: null }
    );

    expect(result.ok).toBe(true);
    expect(result.revision).toBe(1);
    expect(result.totalCloudEntries).toBe(1);
    expect(result.committedIds).toContain("st_srch_test_1");
    expect(result.receipt).toBeDefined();
    expect(result.receipt?.revision).toBe(1);
    expect(result.receipt?.targetObjectKey).toBe(`dailymotion/persistence/${testOwnerId}/saved-titles/manifest.json`);

    // Verify 3 objects were written: generation manifest, canonical manifest, and version pointer
    expect(mockR2.putObject).toHaveBeenCalledTimes(3);

    // Verify the canonical manifest in store
    const canonical = r2Store.get(`dailymotion/persistence/${testOwnerId}/saved-titles/manifest.json`);
    expect(canonical).toBeDefined();
    const parsed = JSON.parse(canonical!) as SavedTitlesManifest;
    expect(parsed.manifestType).toBe("saved-titles");
    expect(parsed.entries[0].status).toBe("cloud_synced");
    expect(parsed.entries[0].value).toBe("molecular biology");
  });

  it("preserves historical cloud entries when merging subsequent drafts and bumps revision", async () => {
    const r2Store = new Map<string, string>();

    // Pre-populate with existing historical cloud entry
    const existingEntry: SavedTitleEntry = {
      id: "st_link_hist_0",
      ownerId: testOwnerId,
      kind: "url",
      value: "https://www.dailymotion.com/video/x123456",
      displayTitle: "Old Saved Video",
      source: {
        workspace: "link-explorer",
        label: "Link Explorer",
        apiVersion: "v1",
        resourceType: "video",
      },
      addedBy: { type: "link-action" },
      createdAt: "2026-11-13T09:00:00.000Z",
      updatedAt: "2026-11-13T09:00:00.000Z",
      resourceType: "video",
      canonicalUrl: "https://www.dailymotion.com/video/x123456",
      notes: null,
      status: "cloud_synced",
    };

    const existingManifest: SavedTitlesManifest = {
      manifestVersion: 1,
      manifestType: "saved-titles",
      provider: "dailymotion-discovery",
      owner: { ownerId: testOwnerId },
      manifestId: `st-manifest-${testOwnerId}`,
      revision: 4,
      createdAt: "2026-11-13T09:00:00.000Z",
      updatedAt: "2026-11-13T09:00:00.000Z",
      entries: [existingEntry],
    };

    const manifestKey = `dailymotion/persistence/${testOwnerId}/saved-titles/manifest.json`;
    r2Store.set(manifestKey, JSON.stringify(existingManifest));

    const mockR2 = {
      configured: true,
      getObjectJson: vi.fn().mockImplementation(async (_owner: string, key: string) => {
        const text = r2Store.get(key);
        if (!text) return null;
        return { data: JSON.parse(text), sha256: sha256(text) };
      }),
      putObject: vi.fn().mockImplementation(async (_owner: string, key: string, content: string) => {
        r2Store.set(key, content);
        return { ok: true, key, size: Buffer.byteLength(content), etag: "mock-etag", sha256: sha256(content) };
      }),
      getObjectText: vi.fn().mockImplementation(async (_owner: string, key: string) => {
        const text = r2Store.get(key);
        if (!text) return null;
        return { text, etag: "mock-etag", sha256: sha256(text) };
      }),
    } as unknown as R2WorkerClient;

    const result = await executeSavedTitlesCloudSync(
      {
        ownerId: testOwnerId,
        pendingEntries: [samplePendingEntry],
      },
      { r2Client: mockR2, db: null }
    );

    expect(result.ok).toBe(true);
    expect(result.revision).toBe(5); // Bumped from 4 to 5
    expect(result.totalCloudEntries).toBe(2); // Existing historical + new pending entry

    const updatedCanonical = JSON.parse(r2Store.get(manifestKey)!) as SavedTitlesManifest;
    const ids = updatedCanonical.entries.map((e) => e.id);
    expect(ids).toContain("st_link_hist_0");
    expect(ids).toContain("st_srch_test_1");
  });

  it("handles deletion tombstones during merge", async () => {
    const r2Store = new Map<string, string>();
    const manifestKey = `dailymotion/persistence/${testOwnerId}/saved-titles/manifest.json`;

    const existingEntry: SavedTitleEntry = {
      ...samplePendingEntry,
      status: "cloud_synced",
    };

    const existingManifest: SavedTitlesManifest = {
      manifestVersion: 1,
      manifestType: "saved-titles",
      provider: "dailymotion-discovery",
      owner: { ownerId: testOwnerId },
      manifestId: `st-manifest-${testOwnerId}`,
      revision: 1,
      createdAt: "2026-11-13T09:00:00.000Z",
      updatedAt: "2026-11-13T09:00:00.000Z",
      entries: [existingEntry],
    };
    r2Store.set(manifestKey, JSON.stringify(existingManifest));

    const mockR2 = {
      configured: true,
      getObjectJson: vi.fn().mockImplementation(async (_owner: string, key: string) => {
        const text = r2Store.get(key);
        if (!text) return null;
        return { data: JSON.parse(text), sha256: sha256(text) };
      }),
      putObject: vi.fn().mockImplementation(async (_owner: string, key: string, content: string) => {
        r2Store.set(key, content);
        return { ok: true, key, size: Buffer.byteLength(content), etag: "mock-etag", sha256: sha256(content) };
      }),
      getObjectText: vi.fn().mockImplementation(async (_owner: string, key: string) => {
        const text = r2Store.get(key);
        if (!text) return null;
        return { text, etag: "mock-etag", sha256: sha256(text) };
      }),
    } as unknown as R2WorkerClient;

    // Send a tombstone entry
    const tombstoneEntry: SavedTitleEntry = {
      ...samplePendingEntry,
      isDeleted: true,
    };

    const result = await executeSavedTitlesCloudSync(
      {
        ownerId: testOwnerId,
        pendingEntries: [tombstoneEntry],
      },
      { r2Client: mockR2, db: null }
    );

    expect(result.ok).toBe(true);
    expect(result.totalCloudEntries).toBe(0); // Successfully removed
  });

  it("preserves local state and fails at upload phase if Worker returns error", async () => {
    const mockR2 = {
      configured: true,
      getObjectJson: vi.fn().mockResolvedValue(null),
      putObject: vi.fn().mockRejectedValue(new Error("Worker network timeout 504")),
      getObjectText: vi.fn().mockResolvedValue(null),
    } as unknown as R2WorkerClient;

    const result = await executeSavedTitlesCloudSync(
      {
        ownerId: testOwnerId,
        pendingEntries: [samplePendingEntry],
      },
      { r2Client: mockR2, db: null }
    );

    expect(result.ok).toBe(false);
    expect(result.phase).toBe("upload");
    expect(result.error).toContain("Worker network timeout 504");
    expect(result.error).toContain("Local pending records preserved");
  });

  it("preserves local state and fails at verify phase if read-back checksum mismatches", async () => {
    const mockR2 = {
      configured: true,
      getObjectJson: vi.fn().mockResolvedValue(null),
      putObject: vi.fn().mockResolvedValue({ ok: true }),
      // Corrupt read-back
      getObjectText: vi.fn().mockResolvedValue({
        text: '{"corrupted": true}',
        etag: "mock-etag",
        sha256: "corrupted_sha",
      }),
    } as unknown as R2WorkerClient;

    const result = await executeSavedTitlesCloudSync(
      {
        ownerId: testOwnerId,
        pendingEntries: [samplePendingEntry],
      },
      { r2Client: mockR2, db: null }
    );

    expect(result.ok).toBe(false);
    expect(result.phase).toBe("verify");
    expect(result.error).toContain("Integrity verification failure");
  });
});
