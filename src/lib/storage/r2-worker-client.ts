import { getR2WorkerConfig, signCapabilityToken } from "./r2-capability-token";

/**
 * Server-only HTTP client for the `dailymotion-discovery-api` Cloudflare Worker.
 *
 * Uses short-lived Web Crypto HS256 capability tokens per request and supports
 * custom `fetch` injection so Worker <-> R2 integration tests run without network access.
 */

export type FetchLike = typeof fetch;

export interface R2WorkerClientOptions {
  workerUrl?: string;
  hmacSecret?: string;
  fetchFn?: FetchLike;
}

export interface WorkerHealthResponse {
  ok: boolean;
  worker: string;
  bucket?: string;
  binding_configured: boolean;
  secret_configured: boolean;
  timestamp?: string;
}

export interface WorkerListObject {
  key: string;
  size: number;
  etag: string;
  uploaded?: string;
  customMetadata?: Record<string, string>;
}

export interface WorkerBatchUploadItem {
  key: string;
  contentBase64: string;
  contentType?: string;
  expectedSha256?: string;
  customMetadata?: Record<string, string>;
}

export interface WorkerBatchUploadReceipt {
  key: string;
  size: number;
  etag: string;
  sha256: string;
  uploaded: string;
}

export interface WorkerBatchVerifyItem {
  key: string;
  sha256: string;
  byteCount?: number;
}

export interface WorkerBatchVerifyResult {
  ok: boolean;
  batchId: string;
  verifiedCount: number;
  failedCount: number;
  verified: string[];
  failures: Array<{ key: string; reason: string; expectedSha256?: string; actualSha256?: string }>;
}

export class R2WorkerClient {
  private readonly workerUrl: string;
  private readonly hmacSecret: string;
  private readonly fetchFn: FetchLike;

  constructor(options?: R2WorkerClientOptions) {
    const cfg = getR2WorkerConfig();
    this.workerUrl = (options?.workerUrl ?? cfg.workerUrl).trim().replace(/\/+$/, "");
    this.hmacSecret = (options?.hmacSecret ?? cfg.hmacSecret).trim();
    this.fetchFn = options?.fetchFn ?? fetch;
  }

  get configured(): boolean {
    return Boolean(this.workerUrl && this.hmacSecret);
  }

  private assertConfigured(): void {
    if (!this.workerUrl || !this.hmacSecret) {
      throw new Error(
        "Cloudflare R2 Worker is not configured (set CLOUDFLARE_R2_WORKER_URL and CLOUDFLARE_R2_WORKER_HMAC_SECRET)."
      );
    }
  }

  async health(): Promise<WorkerHealthResponse> {
    if (!this.workerUrl) {
      return {
        ok: false,
        worker: "dailymotion-discovery-api",
        binding_configured: false,
        secret_configured: false,
      };
    }
    const res = await this.fetchFn(`${this.workerUrl}/health`, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Worker /health failed with HTTP ${res.status}`);
    }
    return (await res.json()) as WorkerHealthResponse;
  }

  async putObject(
    ownerId: string,
    key: string,
    jsonBody: string,
    customMetadata?: Record<string, string>
  ): Promise<{ ok: boolean; key: string; size: number; etag: string; sha256: string }> {
    this.assertConfigured();
    const token = signCapabilityToken(
      {
        operation: "upload",
        key,
        storageOwnerUuid: ownerId,
        contentType: "application/json",
      },
      this.hmacSecret
    );
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    if (customMetadata?.sha256) headers["x-amz-meta-sha256"] = customMetadata.sha256;

    const encodedPath = key.split("/").map(encodeURIComponent).join("/");
    const res = await this.fetchFn(`${this.workerUrl}/objects/${encodedPath}`, {
      method: "PUT",
      headers,
      body: jsonBody,
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Worker PUT ${key} failed (${res.status}): ${errText}`);
    }
    return (await res.json()) as { ok: boolean; key: string; size: number; etag: string; sha256: string };
  }

  async getObjectText(ownerId: string, key: string): Promise<{ text: string; etag: string | null; sha256: string | null } | null> {
    this.assertConfigured();
    const token = signCapabilityToken(
      {
        operation: "download",
        key,
        storageOwnerUuid: ownerId,
      },
      this.hmacSecret
    );
    const encodedPath = key.split("/").map(encodeURIComponent).join("/");
    const res = await this.fetchFn(`${this.workerUrl}/objects/${encodedPath}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Worker GET ${key} failed (${res.status}): ${errText}`);
    }
    return {
      text: await res.text(),
      etag: res.headers.get("etag"),
      sha256: res.headers.get("x-content-sha256"),
    };
  }

  async getObjectJson<T>(ownerId: string, key: string): Promise<{ data: T; sha256: string | null } | null> {
    const raw = await this.getObjectText(ownerId, key);
    if (!raw) return null;
    return {
      data: JSON.parse(raw.text) as T,
      sha256: raw.sha256,
    };
  }

  async listPrefix(ownerId: string, prefix: string, limit = 200): Promise<WorkerListObject[]> {
    this.assertConfigured();
    const objects: WorkerListObject[] = [];
    let cursor: string | undefined;

    do {
      const token = signCapabilityToken(
        {
          operation: "list",
          key: prefix,
          storageOwnerUuid: ownerId,
        },
        this.hmacSecret
      );
      const url = new URL(`${this.workerUrl}/list`);
      url.searchParams.set("prefix", prefix);
      url.searchParams.set("limit", String(limit));
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await this.fetchFn(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Worker LIST ${prefix} failed (${res.status}): ${errText}`);
      }
      const json = (await res.json()) as { objects: WorkerListObject[]; truncated: boolean; cursor?: string };
      objects.push(...json.objects);
      cursor = json.truncated ? json.cursor : undefined;
    } while (cursor);

    return objects;
  }

  async batchUpload(
    ownerId: string,
    scopePrefix: string,
    batchId: string,
    items: WorkerBatchUploadItem[]
  ): Promise<{ ok: boolean; batchId: string; uploadedCount: number; receipts: WorkerBatchUploadReceipt[] }> {
    this.assertConfigured();
    const token = signCapabilityToken(
      {
        operation: "batch_upload",
        key: scopePrefix,
        storageOwnerUuid: ownerId,
        batchId,
        allowedKeys: items.map((i) => i.key),
      },
      this.hmacSecret
    );
    const res = await this.fetchFn(`${this.workerUrl}/batch/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scopePrefix, batchId, items }),
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Worker POST /batch/upload failed (${res.status}): ${errText}`);
    }
    return (await res.json()) as { ok: boolean; batchId: string; uploadedCount: number; receipts: WorkerBatchUploadReceipt[] };
  }

  async batchVerify(
    ownerId: string,
    scopePrefix: string,
    batchId: string,
    items: WorkerBatchVerifyItem[]
  ): Promise<WorkerBatchVerifyResult> {
    this.assertConfigured();
    const token = signCapabilityToken(
      {
        operation: "batch_verify",
        key: scopePrefix,
        storageOwnerUuid: ownerId,
        batchId,
      },
      this.hmacSecret
    );
    const res = await this.fetchFn(`${this.workerUrl}/batch/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scopePrefix, batchId, items }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok && res.status !== 422) {
      throw new Error(`Worker POST /batch/verify failed (${res.status}): ${text}`);
    }
    return JSON.parse(text) as WorkerBatchVerifyResult;
  }
}
