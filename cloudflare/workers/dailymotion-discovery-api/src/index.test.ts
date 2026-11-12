import { describe, expect, it } from "vitest";
import { signCapabilityToken } from "../../../../src/lib/storage/r2-capability-token";
import { handleWorkerRequest, sanitizeObjectKey, type Env, type R2BucketLike, type R2ObjectLike } from "./index";

class MemoryR2Bucket implements R2BucketLike {
  private objects = new Map<string, { data: Uint8Array; etag: string; contentType?: string; customMetadata?: Record<string, string> }>();

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
    if (options?.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) {
      return null;
    }
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
    const out: R2ObjectLike[] = [];
    for (const [k, v] of this.objects.entries()) {
      if (!options?.prefix || k.startsWith(options.prefix)) {
        out.push({ key: k, size: v.data.byteLength, etag: v.etag, uploaded: new Date(), customMetadata: v.customMetadata });
      }
    }
    return { objects: out, truncated: false };
  }
}

const SECRET = "test-worker-hmac-secret-0123456789abcdef0123456789abcdef";

function makeEnv(): Env {
  return {
    DM_BUCKET: new MemoryR2Bucket(),
    WORKER_AUTH_SECRET: SECRET,
    ALLOWED_ORIGINS: "http://localhost:3000",
  };
}

describe("dailymotion-discovery-api Worker", () => {
  it("rejects unauthorized requests and expired capability tokens", async () => {
    const env = makeEnv();
    const unauth = await handleWorkerRequest(new Request("https://worker.test/list?prefix=dailymotion/persistence/admin/"), env);
    expect(unauth.status).toBe(401);

    const expiredToken = signCapabilityToken(
      {
        operation: "list",
        key: "dailymotion/persistence/admin/",
        storageOwnerUuid: "admin",
        ttlSeconds: -10,
      },
      SECRET
    );
    const expiredRes = await handleWorkerRequest(
      new Request("https://worker.test/list?prefix=dailymotion/persistence/admin/", {
        headers: { Authorization: `Bearer ${expiredToken}` },
      }),
      env
    );
    expect(expiredRes.status).toBe(401);
  });

  it("blocks path traversal and cross-owner access", async () => {
    const env = makeEnv();
    const token = signCapabilityToken(
      {
        operation: "download",
        key: "dailymotion/persistence/owner-b/saved-items/version.json",
        storageOwnerUuid: "owner-a",
      },
      SECRET
    );
    const crossOwner = await handleWorkerRequest(
      new Request("https://worker.test/objects/dailymotion/persistence/owner-b/saved-items/version.json", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(crossOwner.status).toBe(403);

    // Standard Fetch URL collapses dot segments before handler dispatch (yielding 403 cross-owner),
    // while double slashes / backslashes trigger `sanitizeObjectKey` HTTP 400 directly.
    const doubleSlash = await handleWorkerRequest(
      new Request("https://worker.test/objects/dailymotion/persistence/owner-a//secret.json", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(doubleSlash.status).toBe(400);
    expect(() => sanitizeObjectKey("dailymotion/persistence/owner-a/../owner-b/secret.json")).toThrow();
  });

  it("uploads, enforces immutable part collision guard, and verifies SHA-256 batch", async () => {
    const env = makeEnv();
    const prefix = "dailymotion/persistence/admin/saved-items/generations/gen-01";
    const partKey = `${prefix}/parts/part-000001.json`;
    const payload = JSON.stringify({ generationId: "gen-01", items: [{ id: "x1" }] });
    const uploadToken = signCapabilityToken(
      {
        operation: "batch_upload",
        key: prefix,
        storageOwnerUuid: "admin",
        batchId: "batch-1",
        allowedKeys: [partKey],
      },
      SECRET
    );

    const uploadRes = await handleWorkerRequest(
      new Request("https://worker.test/batch/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${uploadToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          scopePrefix: prefix,
          batchId: "batch-1",
          items: [
            {
              key: partKey,
              contentBase64: Buffer.from(payload, "utf8").toString("base64"),
              contentType: "application/json",
            },
          ],
        }),
      }),
      env
    );
    expect(uploadRes.status).toBe(200);
    const uploadJson = (await uploadRes.json()) as { uploadedCount: number; receipts: Array<{ sha256: string; size: number }> };
    expect(uploadJson.uploadedCount).toBe(1);

    // Re-uploading the exact immutable part path must fail with 409 Conflict.
    const dupRes = await handleWorkerRequest(
      new Request("https://worker.test/batch/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${uploadToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          scopePrefix: prefix,
          batchId: "batch-1",
          items: [{ key: partKey, contentBase64: Buffer.from(payload, "utf8").toString("base64") }],
        }),
      }),
      env
    );
    expect(dupRes.status).toBe(409);

    const verifyToken = signCapabilityToken(
      { operation: "batch_verify", key: prefix, storageOwnerUuid: "admin", batchId: "batch-1" },
      SECRET
    );
    const verifyRes = await handleWorkerRequest(
      new Request("https://worker.test/batch/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${verifyToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          scopePrefix: prefix,
          batchId: "batch-1",
          items: [{ key: partKey, sha256: uploadJson.receipts[0].sha256, byteCount: uploadJson.receipts[0].size }],
        }),
      }),
      env
    );
    expect(verifyRes.status).toBe(200);
    const verifyJson = (await verifyRes.json()) as { ok: boolean; verifiedCount: number };
    expect(verifyJson.ok).toBe(true);
    expect(verifyJson.verifiedCount).toBe(1);
  });
});
