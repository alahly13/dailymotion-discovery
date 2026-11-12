/**
 * Dailymotion Discovery — Dedicated Cloudflare R2 Worker API
 *
 * Worker Name: dailymotion-discovery-api
 * R2 Binding:  env.DM_BUCKET -> dailymotion-discovery-private (Private)
 *
 * Security invariants:
 *   1. Native R2 binding only (zero S3 SDKs, zero AWS credentials, zero public bucket URLs).
 *   2. Every data endpoint requires a short-lived Web Crypto HS256 capability token
 *      signed by the Next.js server (`iss: "dailymotion-discovery-web"`,
 *      `aud: "dailymotion-discovery-api"`).
 *   3. Path sanitizer blocks `..`, backslashes, control chars, and double slashes.
 *   4. Immutable dataset parts (`generations/.../parts/part-*.json`) reject overwrite
 *      with 409 Conflict (`onlyIf` conditional put).
 *   5. Enforces strict JSON-only payloads and sizing budgets matching Next.js serializer
 *      (45 MiB per object, 200 MiB and 50 items per batch).
 */

export interface R2Conditional {
  etagDoesNotMatch?: string;
}

export interface R2PutOptionsLike {
  onlyIf?: R2Conditional;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

export interface R2ObjectLike {
  key: string;
  size: number;
  etag: string;
  uploaded?: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  head(key: string): Promise<R2ObjectLike | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: R2PutOptionsLike): Promise<R2ObjectLike | null>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; delimiter?: string; limit?: number }): Promise<{
    objects: R2ObjectLike[];
    truncated: boolean;
    cursor?: string;
    delimitedPrefixes?: string[];
  }>;
}

export interface Env {
  DM_BUCKET: R2BucketLike;
  WORKER_AUTH_SECRET?: string;
  ALLOWED_ORIGINS?: string;
}

export interface CapabilityClaims {
  iss: string;
  aud: string;
  sub: string;
  storage_owner_uuid: string;
  operation: "upload" | "download" | "head" | "list" | "delete" | "batch_upload" | "batch_verify";
  key: string;
  batch_id?: string;
  allowed_keys?: string[];
  max_bytes?: number;
  content_type?: string;
  iat: number;
  exp: number;
  jti: string;
}

export const WORKER_IDENTITY = "dailymotion-discovery-api";
export const EXPECTED_ISSUER = "dailymotion-discovery-web";
const MAX_SINGLE_OBJECT_BYTES = 45 * 1024 * 1024;
const MAX_BATCH_BYTES = 200 * 1024 * 1024;
const MAX_BATCH_ITEMS = 50;
const ALLOWED_JSON_TYPES = new Set(["application/json", "application/json; charset=utf-8"]);
const DEFAULT_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  let b64 = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

export function sanitizeObjectKey(raw: string): string {
  const decoded = decodeURIComponent(raw).replace(/^\/+/, "");
  if (!decoded || decoded.includes("..") || decoded.includes("\\") || decoded.includes("//") || /[\u0000-\u001f]/.test(decoded)) {
    throw new Error("Invalid object key: traversal or control characters rejected.");
  }
  return decoded;
}

export function isOwnerScopedDailymotionKey(key: string, owner: string): boolean {
  const cleanOwner = owner.trim().toLowerCase();
  if (!cleanOwner) return false;
  const lower = key.toLowerCase();
  return (
    lower.startsWith(`dailymotion/persistence/${cleanOwner}/`) ||
    lower.startsWith(`dailymotion/temp/${cleanOwner}/`) ||
    lower === `dailymotion/persistence/${cleanOwner}` ||
    lower === `dailymotion/temp/${cleanOwner}`
  );
}

function isImmutablePartKey(key: string): boolean {
  return /\/generations\/[^/]+\/parts\/part-\d+\.json$/i.test(key);
}

function corsHeaders(request: Request, env: Env): Headers {
  const origin = request.headers.get("Origin") || "";
  const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) : DEFAULT_ORIGINS;
  const headers = new Headers();
  if (allowed.includes(origin)) headers.set("Access-Control-Allow-Origin", origin);
  else if (!origin) headers.set("Access-Control-Allow-Origin", allowed[0]);
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, PUT, POST, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Batch-Key, X-Overwrite-Allowed");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function jsonResponse(body: unknown, status: number, headersBase: Headers): Response {
  const headers = new Headers(headersBase);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

export async function verifyCapabilityToken(
  authHeader: string | null,
  secret: string | undefined,
  expectedOperation: CapabilityClaims["operation"],
  targetKey: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000)
): Promise<{ valid: true; claims: CapabilityClaims } | { valid: false; status: number; error: string }> {
  if (!secret) return { valid: false, status: 500, error: "Worker auth secret is not configured." };
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, status: 401, error: "Bearer capability token required." };
  }
  const parts = authHeader.slice(7).trim().split(".");
  if (parts.length !== 3) return { valid: false, status: 401, error: "Malformed capability token." };
  const [headerB64, payloadB64, sigB64] = parts;

  try {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", cryptoKey, base64UrlToBytes(sigB64), enc.encode(`${headerB64}.${payloadB64}`));
    if (!ok) return { valid: false, status: 401, error: "Invalid capability token signature." };

    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64))) as CapabilityClaims;
    if (claims.iss !== EXPECTED_ISSUER) return { valid: false, status: 401, error: "Token issuer mismatch." };
    if (claims.aud !== WORKER_IDENTITY) return { valid: false, status: 403, error: "Token audience mismatch." };
    if (claims.exp <= nowEpochSeconds) return { valid: false, status: 401, error: "Capability token expired." };
    if (claims.operation !== expectedOperation) {
      return { valid: false, status: 403, error: `Operation '${expectedOperation}' denied by '${claims.operation}' grant.` };
    }
    const owner = (claims.storage_owner_uuid || "").trim();
    if (!owner || !isOwnerScopedDailymotionKey(targetKey, owner)) {
      return { valid: false, status: 403, error: "Target key is outside the authorized owner namespace." };
    }
    if (expectedOperation === "list" || expectedOperation === "batch_upload" || expectedOperation === "batch_verify") {
      if (!targetKey.startsWith(claims.key)) {
        return { valid: false, status: 403, error: "Requested scope falls outside grant prefix." };
      }
    } else if (claims.key !== targetKey) {
      return { valid: false, status: 403, error: "Requested object key does not match grant key." };
    }
    return { valid: true, claims };
  } catch {
    return { valid: false, status: 401, error: "Failed to verify capability token." };
  }
}

export async function handleWorkerRequest(request: Request, env: Env): Promise<Response> {
  const headers = corsHeaders(request, env);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === "/health" && request.method === "GET") {
    return jsonResponse(
      {
        ok: true,
        worker: WORKER_IDENTITY,
        bucket: "dailymotion-discovery-private",
        binding_configured: Boolean(env.DM_BUCKET),
        secret_configured: Boolean(env.WORKER_AUTH_SECRET),
        timestamp: new Date().toISOString(),
      },
      200,
      headers
    );
  }

  if (!env.DM_BUCKET) {
    return jsonResponse({ ok: false, error: "DM_BUCKET R2 binding not configured." }, 500, headers);
  }

  // GET /list?prefix=...&cursor=...&delimiter=...
  if (pathname === "/list" && request.method === "GET") {
    let prefix: string;
    try {
      prefix = sanitizeObjectKey(url.searchParams.get("prefix") ?? "");
    } catch (error) {
      return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Invalid prefix." }, 400, headers);
    }
    const auth = await verifyCapabilityToken(request.headers.get("Authorization"), env.WORKER_AUTH_SECRET, "list", prefix);
    if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, auth.status, headers);

    const listed = await env.DM_BUCKET.list({
      prefix,
      cursor: url.searchParams.get("cursor") || undefined,
      delimiter: url.searchParams.get("delimiter") || undefined,
      limit: Math.min(Math.max(Number(url.searchParams.get("limit") || "100"), 1), 1000),
    });
    return jsonResponse(
      {
        ok: true,
        objects: listed.objects.map((o) => ({
          key: o.key,
          size: o.size,
          etag: o.etag,
          uploaded: o.uploaded instanceof Date ? o.uploaded.toISOString() : new Date().toISOString(),
          contentType: o.httpMetadata?.contentType,
          customMetadata: o.customMetadata,
        })),
        truncated: listed.truncated,
        cursor: listed.cursor,
        delimitedPrefixes: listed.delimitedPrefixes,
      },
      200,
      headers
    );
  }

  // POST /batch/upload
  if (pathname === "/batch/upload" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as {
      scopePrefix?: string;
      batchId?: string;
      items?: Array<{ key: string; contentBase64: string; contentType?: string; expectedSha256?: string }>;
    } | null;

    if (!body || !body.scopePrefix || !Array.isArray(body.items) || body.items.length === 0) {
      return jsonResponse({ ok: false, error: "Invalid batch upload body." }, 400, headers);
    }
    if (body.items.length > MAX_BATCH_ITEMS) {
      return jsonResponse({ ok: false, error: `Batch item count exceeds ${MAX_BATCH_ITEMS}.` }, 400, headers);
    }
    let prefix: string;
    try {
      prefix = sanitizeObjectKey(body.scopePrefix);
    } catch (error) {
      return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Invalid scopePrefix." }, 400, headers);
    }

    const auth = await verifyCapabilityToken(request.headers.get("Authorization"), env.WORKER_AUTH_SECRET, "batch_upload", prefix);
    if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, auth.status, headers);

    let totalBytes = 0;
    const receipts: Array<{ key: string; size: number; etag: string; sha256: string; uploaded: string }> = [];

    for (const item of body.items) {
      let key: string;
      try {
        key = sanitizeObjectKey(item.key);
      } catch (error) {
        return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Invalid item key." }, 400, headers);
      }
      if (!key.startsWith(prefix) || !isOwnerScopedDailymotionKey(key, auth.claims.storage_owner_uuid)) {
        return jsonResponse({ ok: false, error: `Batch item '${key}' outside authorized prefix.` }, 403, headers);
      }
      if (auth.claims.allowed_keys && !auth.claims.allowed_keys.includes(key)) {
        return jsonResponse({ ok: false, error: `Batch item '${key}' not listed in allowed_keys.` }, 403, headers);
      }
      const ctype = (item.contentType || "application/json").toLowerCase();
      if (!ALLOWED_JSON_TYPES.has(ctype)) {
        return jsonResponse({ ok: false, error: `Unsupported contentType '${ctype}'. JSON only.` }, 415, headers);
      }

      const rawBinary = Uint8Array.from(atob(item.contentBase64), (c) => c.charCodeAt(0));
      if (rawBinary.byteLength > MAX_SINGLE_OBJECT_BYTES) {
        return jsonResponse({ ok: false, error: `Item '${key}' exceeds 45 MiB limit.` }, 413, headers);
      }
      totalBytes += rawBinary.byteLength;
      if (totalBytes > MAX_BATCH_BYTES) {
        return jsonResponse({ ok: false, error: "Total batch exceeds 200 MiB limit." }, 413, headers);
      }

      const actualSha = bytesToHex(await crypto.subtle.digest("SHA-256", rawBinary));
      if (item.expectedSha256 && item.expectedSha256.toLowerCase() !== actualSha) {
        return jsonResponse({ ok: false, error: `Upload checksum mismatch for '${key}'.` }, 422, headers);
      }

      const immutable = isImmutablePartKey(key);
      const putObj = await env.DM_BUCKET.put(key, rawBinary, {
        onlyIf: immutable ? { etagDoesNotMatch: "*" } : undefined,
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: {
          sha256: actualSha,
          owner: auth.claims.storage_owner_uuid,
          batchId: body.batchId ?? auth.claims.batch_id ?? "",
        },
      });
      if (!putObj) {
        return jsonResponse({ ok: false, error: `Conflict: immutable object '${key}' already exists.` }, 409, headers);
      }
      receipts.push({
        key,
        size: rawBinary.byteLength,
        etag: putObj.etag,
        sha256: actualSha,
        uploaded: putObj.uploaded instanceof Date ? putObj.uploaded.toISOString() : new Date().toISOString(),
      });
    }

    return jsonResponse({ ok: true, batchId: body.batchId ?? auth.claims.batch_id ?? "", uploadedCount: receipts.length, receipts }, 200, headers);
  }

  // POST /batch/verify
  if (pathname === "/batch/verify" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as {
      scopePrefix?: string;
      batchId?: string;
      items?: Array<{ key: string; sha256: string; byteCount?: number }>;
    } | null;

    if (!body || !body.scopePrefix || !Array.isArray(body.items) || body.items.length === 0) {
      return jsonResponse({ ok: false, error: "Invalid batch verify body." }, 400, headers);
    }
    let prefix: string;
    try {
      prefix = sanitizeObjectKey(body.scopePrefix);
    } catch (error) {
      return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Invalid scopePrefix." }, 400, headers);
    }
    const auth = await verifyCapabilityToken(request.headers.get("Authorization"), env.WORKER_AUTH_SECRET, "batch_verify", prefix);
    if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, auth.status, headers);

    const verified: Array<{ key: string; size: number; sha256: string }> = [];
    const failures: Array<{ key: string; reason: string; expectedSha256?: string; actualSha256?: string; expectedBytes?: number; actualBytes?: number }> = [];

    for (const item of body.items) {
      let key: string;
      try {
        key = sanitizeObjectKey(item.key);
      } catch {
        failures.push({ key: item.key, reason: "INVALID_KEY" });
        continue;
      }
      if (!key.startsWith(prefix) || !isOwnerScopedDailymotionKey(key, auth.claims.storage_owner_uuid)) {
        failures.push({ key, reason: "OUTSIDE_SCOPE" });
        continue;
      }
      const obj = await env.DM_BUCKET.get(key);
      if (!obj || !obj.arrayBuffer) {
        failures.push({ key, reason: "NOT_FOUND" });
        continue;
      }
      const buf = await obj.arrayBuffer();
      const actualSha = bytesToHex(await crypto.subtle.digest("SHA-256", buf));
      if (item.sha256.toLowerCase() !== actualSha) {
        failures.push({ key, reason: "CHECKSUM_MISMATCH", expectedSha256: item.sha256, actualSha256: actualSha });
        continue;
      }
      if (item.byteCount !== undefined && obj.size !== item.byteCount) {
        failures.push({ key, reason: "BYTE_COUNT_MISMATCH", expectedBytes: item.byteCount, actualBytes: obj.size });
        continue;
      }
      verified.push({ key, size: obj.size, sha256: actualSha });
    }

    return jsonResponse(
      {
        ok: failures.length === 0,
        batchId: body.batchId ?? "",
        verifiedCount: verified.length,
        failedCount: failures.length,
        verified,
        failures,
      },
      failures.length === 0 ? 200 : 422,
      headers
    );
  }

  // Single object routes: /objects/<key>
  if (pathname.startsWith("/objects/")) {
    let key: string;
    try {
      key = sanitizeObjectKey(pathname.slice("/objects/".length));
    } catch (error) {
      return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Invalid key." }, 400, headers);
    }

    if (request.method === "GET") {
      const auth = await verifyCapabilityToken(request.headers.get("Authorization"), env.WORKER_AUTH_SECRET, "download", key);
      if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, auth.status, headers);
      const obj = await env.DM_BUCKET.get(key);
      if (!obj || !obj.arrayBuffer) return jsonResponse({ ok: false, error: "Object not found." }, 404, headers);
      const outHeaders = new Headers(headers);
      outHeaders.set("Content-Type", obj.httpMetadata?.contentType || "application/json; charset=utf-8");
      outHeaders.set("Content-Length", String(obj.size));
      outHeaders.set("ETag", obj.etag);
      return new Response(await obj.arrayBuffer(), { status: 200, headers: outHeaders });
    }

    if (request.method === "HEAD") {
      const auth = await verifyCapabilityToken(request.headers.get("Authorization"), env.WORKER_AUTH_SECRET, "head", key);
      if (!auth.valid) return new Response(null, { status: auth.status, headers });
      const obj = await env.DM_BUCKET.head(key);
      if (!obj) return new Response(null, { status: 404, headers });
      const outHeaders = new Headers(headers);
      outHeaders.set("Content-Length", String(obj.size));
      outHeaders.set("ETag", obj.etag);
      return new Response(null, { status: 200, headers: outHeaders });
    }

    if (request.method === "PUT") {
      const auth = await verifyCapabilityToken(request.headers.get("Authorization"), env.WORKER_AUTH_SECRET, "upload", key);
      if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, auth.status, headers);
      const contentType = (request.headers.get("Content-Type") || "application/json").toLowerCase();
      if (!ALLOWED_JSON_TYPES.has(contentType)) {
        return jsonResponse({ ok: false, error: "JSON content-type required." }, 415, headers);
      }
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > MAX_SINGLE_OBJECT_BYTES) {
        return jsonResponse({ ok: false, error: "Payload exceeds 45 MiB ceiling." }, 413, headers);
      }
      const immutable = isImmutablePartKey(key);
      const sha256 = bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
      const putObj = await env.DM_BUCKET.put(key, bytes, {
        onlyIf: immutable ? { etagDoesNotMatch: "*" } : undefined,
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: { sha256, owner: auth.claims.storage_owner_uuid },
      });
      if (!putObj) return jsonResponse({ ok: false, error: "Conflict: immutable object already exists." }, 409, headers);
      return jsonResponse({ ok: true, key, size: bytes.byteLength, etag: putObj.etag, sha256 }, 200, headers);
    }

    if (request.method === "DELETE") {
      const auth = await verifyCapabilityToken(request.headers.get("Authorization"), env.WORKER_AUTH_SECRET, "delete", key);
      if (!auth.valid) return jsonResponse({ ok: false, error: auth.error }, auth.status, headers);
      await env.DM_BUCKET.delete(key);
      return jsonResponse({ ok: true, deleted: key }, 200, headers);
    }
  }

  return jsonResponse({ ok: false, error: "Not found." }, 404, headers);
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleWorkerRequest(request, env);
  },
};

export default worker;
