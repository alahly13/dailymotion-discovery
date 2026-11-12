import { describe, expect, it } from "vitest";
import { executeSaveAll, hydrateDatasetsFromCloud } from "../r2-sync-service";
import { verifyR2DatasetsIntegrity } from "@/lib/storage/storage-explorer-service";
import { R2WorkerClient } from "@/lib/storage/r2-worker-client";
import {
  handleWorkerRequest,
  type Env,
  type R2BucketLike,
  type R2ObjectLike,
} from "../../../../cloudflare/workers/dailymotion-discovery-api/src/index";

class TestR2Bucket implements R2BucketLike {
  readonly objects = new Map<string, { data: Uint8Array; etag: string; contentType?: string; customMetadata?: Record<string, string> }>();

  async get(key: string): Promise<R2ObjectLike | null> {
    const entry = this.objects.get(key);
    if (!entry) return null;
    return {
      key,
      size: entry.data.byteLength,
      etag: entry.etag,
      uploaded: new Date(),
      httpMetadata: { contentType: entry.contentType },
      customMetadata: entry.customMetadata,
      arrayBuffer: async () => entry.data.slice().buffer,
    };
  }

  async head(key: string): Promise<R2ObjectLike | null> {
    return this.get(key);
  }

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { onlyIf?: { etagDoesNotMatch?: string }; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
  ): Promise<R2ObjectLike | null> {
    if (options?.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    const bytes =
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : value instanceof Uint8Array
          ? value
          : new Uint8Array(value);
    const etag = `"${bytes.byteLength}-${this.objects.size + 1}"`;
    this.objects.set(key, {
      data: bytes.slice(),
      etag,
      contentType: options?.httpMetadata?.contentType,
      customMetadata: options?.customMetadata,
    });
    return this.head(key);
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      this.objects.delete(k);
    }
  }

  async list(options?: { prefix?: string }): Promise<{ objects: R2ObjectLike[]; truncated: boolean }> {
    const objects: R2ObjectLike[] = [];
    for (const [k, v] of this.objects.entries()) {
      if (!options?.prefix || k.startsWith(options.prefix)) {
        objects.push({ key: k, size: v.data.byteLength, etag: v.etag, uploaded: new Date(), customMetadata: v.customMetadata });
      }
    }
    return { objects, truncated: false };
  }
}

describe("R2 Two-Phase Save All, Integrity Verify, and Hydration", () => {
  it("commits datasets to R2 Worker via SHA-256 verification and hydrates back cleanly", async () => {
    const bucket = new TestR2Bucket();
    const secret = "sync-integration-secret-0123456789abcdef0123456789";
    const env: Env = {
      DM_BUCKET: bucket,
      WORKER_AUTH_SECRET: secret,
      ALLOWED_ORIGINS: "http://localhost:3000",
    };

    const r2Client = new R2WorkerClient({
      workerUrl: "https://worker.test",
      hmacSecret: secret,
      fetchFn: async (input, init) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        return handleWorkerRequest(req, env);
      },
    });

    const receipt = await executeSaveAll(
      {
        batchId: "batch-sync-1",
        idempotencyKey: "save-all-batch-sync-1",
        pendingOperationIds: ["op-1", "op-2"],
        datasets: {
          savedItems: [{ compositeKey: "v1:video:x123", id: "x123", title: "Saved Demo" }],
          collections: [{ id: "col-1", name: "Research Desk", description: "Clips", tags: [] }],
          collectionItems: [{ id: "col-1::v1:video:x123", collectionId: "col-1", itemKey: "v1:video:x123", position: 0 }],
          savedSearches: [{ id: "preset-1", name: "News Query", apiVersion: "v1", resource: "videos", query: "news" }],
          searchHistory: [{ id: "hist-1", apiVersion: "v1", resource: "videos", query: "news", resultCount: 1 }],
          researchNotes: [],
        },
      },
      { r2Client, db: null, ownerId: "admin" }
    );

    expect(receipt.stage).toBe("CLOUD_COMMITTED");
    expect(receipt.verifiedByWorker).toBe(true);
    expect(receipt.counts.savedItems).toBe(1);

    const hydrated = await hydrateDatasetsFromCloud({ r2Client, db: null, ownerId: "admin" });
    expect(hydrated.source).toBe("r2-worker");
    expect(hydrated.datasets.savedItems).toHaveLength(1);
    expect(hydrated.datasets.collections).toHaveLength(1);
    expect(hydrated.datasets.savedSearches).toHaveLength(1);

    const integrity = await verifyR2DatasetsIntegrity({ r2Client, ownerId: "admin" });
    expect(integrity.ok).toBe(true);
    expect(integrity.verifiedDatasets).toBe(6);
  });
});
