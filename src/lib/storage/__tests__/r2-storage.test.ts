import { describe, expect, it } from "vitest";
import {
  datasetVersionPointerKey,
  generationManifestKey,
  generationPartKey,
  legacyArchiveObjectKey,
  normalizeStorageOwnerId,
} from "../r2-canonical-paths";
import { signCapabilityToken } from "../r2-capability-token";
import { computeAggregateSha256, serializeGenerationBundle, sha256Hex } from "../r2-manifest-serializer";
import { R2WorkerClient } from "../r2-worker-client";
import { createZipArchive } from "../zip-builder";
import {
  handleWorkerRequest,
  type Env,
  type R2BucketLike,
  type R2ObjectLike,
} from "../../../../cloudflare/workers/dailymotion-discovery-api/src/index";

class InMemoryBucket implements R2BucketLike {
  readonly store = new Map<string, { data: Uint8Array; etag: string; contentType?: string; customMetadata?: Record<string, string> }>();

  async get(key: string): Promise<R2ObjectLike | null> {
    const entry = this.store.get(key);
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
    if (options?.onlyIf?.etagDoesNotMatch === "*" && this.store.has(key)) return null;
    const bytes =
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : value instanceof Uint8Array
          ? value
          : new Uint8Array(value);
    const etag = `"${bytes.byteLength}-${this.store.size + 1}"`;
    this.store.set(key, {
      data: bytes.slice(),
      etag,
      contentType: options?.httpMetadata?.contentType,
      customMetadata: options?.customMetadata,
    });
    return this.head(key);
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      this.store.delete(k);
    }
  }

  async list(options?: { prefix?: string }): Promise<{ objects: R2ObjectLike[]; truncated: boolean }> {
    const objects: R2ObjectLike[] = [];
    for (const [k, v] of this.store.entries()) {
      if (!options?.prefix || k.startsWith(options.prefix)) {
        objects.push({ key: k, size: v.data.byteLength, etag: v.etag, uploaded: new Date(), customMetadata: v.customMetadata });
      }
    }
    return { objects, truncated: false };
  }
}

describe("Cloudflare R2 Canonical Paths, Serializer, and Worker Client", () => {
  it("normalizes owner IDs and rejects traversal segments", () => {
    expect(normalizeStorageOwnerId("Admin")).toBe("admin");
    expect(() => normalizeStorageOwnerId("../other")).toThrow();
    expect(datasetVersionPointerKey("admin", "saved-items")).toBe(
      "dailymotion/persistence/admin/saved-items/version.json"
    );
    expect(generationManifestKey("admin", "collections", "gen-001")).toBe(
      "dailymotion/persistence/admin/collections/generations/gen-001/manifest.json"
    );
    expect(generationPartKey("admin", "collections", "gen-001", 3)).toBe(
      "dailymotion/persistence/admin/collections/generations/gen-001/parts/part-000003.json"
    );
    expect(legacyArchiveObjectKey("admin", "mig-01", "/legacy/titles.json")).toBe(
      "dailymotion/persistence/admin/legacy-supabase-archive/mig-01/legacy/titles.json"
    );
  });

  it("splits records into deterministic UTF-8 parts and verifies aggregate SHA-256", () => {
    const records = Array.from({ length: 12 }, (_, idx) => ({
      id: `item-${idx}`,
      title: `Dailymotion sample title #${idx} — ${"x".repeat(240)}`,
    }));

    const bundle = serializeGenerationBundle({
      ownerId: "admin",
      datasetSlug: "saved-items",
      generationId: "gen-test-1",
      records,
      targetPartBytes: 1200,
      createdAt: "2026-11-12T10:00:00.000Z",
    });

    expect(bundle.parts.length).toBeGreaterThan(1);
    expect(bundle.manifest.recordCount).toBe(12);
    expect(bundle.manifest.partCount).toBe(bundle.parts.length);
    expect(bundle.manifest.aggregateSha256).toBe(computeAggregateSha256(bundle.parts));
    expect(bundle.versionPointer.activeGenerationId).toBe("gen-test-1");
  });

  it("executes full batch_upload, batch_verify, manifest upload, and read-back via R2WorkerClient", async () => {
    const bucket = new InMemoryBucket();
    const secret = "integration-worker-secret-0123456789abcdef0123456789";
    const env: Env = {
      DM_BUCKET: bucket,
      WORKER_AUTH_SECRET: secret,
      ALLOWED_ORIGINS: "http://localhost:3000",
    };

    const client = new R2WorkerClient({
      workerUrl: "https://worker.test",
      hmacSecret: secret,
      fetchFn: async (input, init) => {
        const req = input instanceof Request ? input : new Request(String(input), init);
        return handleWorkerRequest(req, env);
      },
    });

    const bundle = serializeGenerationBundle({
      ownerId: "admin",
      datasetSlug: "saved-searches",
      generationId: "gen-2026-a",
      records: [{ id: "preset-1", query: "news", version: "v1" }],
      createdAt: "2026-11-12T12:00:00.000Z",
    });

    const scopePrefix = "dailymotion/persistence/admin/saved-searches/generations/gen-2026-a";
    const uploadRes = await client.batchUpload(
      "admin",
      scopePrefix,
      "batch-a",
      bundle.parts.map((p) => ({
        key: p.key,
        contentBase64: Buffer.from(p.jsonString, "utf8").toString("base64"),
        contentType: "application/json",
        expectedSha256: p.sha256,
      }))
    );
    expect(uploadRes.uploadedCount).toBe(bundle.parts.length);

    const verifyRes = await client.batchVerify(
      "admin",
      scopePrefix,
      "batch-a",
      bundle.parts.map((p) => ({ key: p.key, sha256: p.sha256, byteCount: p.byteCount }))
    );
    expect(verifyRes.ok).toBe(true);
    expect(verifyRes.verifiedCount).toBe(bundle.parts.length);

    await client.putObject("admin", bundle.manifestKey, bundle.manifestJson, { sha256: bundle.manifestSha256 });
    await client.putObject("admin", bundle.versionPointerKey, bundle.versionPointerJson);

    const fetchedPointer = await client.getObjectJson<{ activeGenerationId: string }>("admin", bundle.versionPointerKey);
    expect(fetchedPointer?.data.activeGenerationId).toBe("gen-2026-a");

    const listed = await client.listPrefix("admin", "dailymotion/persistence/admin/saved-searches/");
    expect(listed.length).toBe(3);

    expect(sha256Hex(bundle.parts[0].jsonString)).toBe(bundle.parts[0].sha256);
    expect(() => signCapabilityToken({ operation: "list", key: "dailymotion/persistence/admin/", storageOwnerUuid: "admin" }, "short")).toThrow();
  });

  it("builds valid PKZIP 2.0 archive bytes", () => {
    const zip = createZipArchive([
      { filename: "manifest.json", data: JSON.stringify({ ok: true }) },
      { filename: "readme.txt", data: "Dailymotion Discovery Export" },
    ]);
    // Local file header signature 0x04034b50 -> bytes 50 4b 03 04
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(zip.length).toBeGreaterThan(60);
  });
});
