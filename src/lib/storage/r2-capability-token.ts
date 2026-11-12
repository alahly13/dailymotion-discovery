import crypto from "node:crypto";

/**
 * Server-side HMAC-SHA256 capability token signer for `dailymotion-discovery-api` Worker.
 *
 * Tokens are short-lived, single-operation (or tightly scoped batch) bearer credentials.
 * Never expose `CLOUDFLARE_R2_WORKER_HMAC_SECRET` or minted tokens to browser code.
 */

export type WorkerOperation =
  | "upload"
  | "download"
  | "head"
  | "list"
  | "delete"
  | "batch_upload"
  | "batch_verify";

export interface CapabilityTokenRequest {
  operation: WorkerOperation;
  key: string;
  storageOwnerUuid: string;
  subject?: string;
  ttlSeconds?: number;
  batchId?: string;
  allowedKeys?: string[];
  maxBytes?: number;
  contentType?: string;
}

export interface SignedCapabilityClaims {
  iss: "dailymotion-discovery-web";
  aud: "dailymotion-discovery-api";
  sub: string;
  storage_owner_uuid: string;
  operation: WorkerOperation;
  key: string;
  batch_id?: string;
  allowed_keys?: string[];
  max_bytes?: number;
  content_type?: string;
  iat: number;
  exp: number;
  jti: string;
}

function encodeBase64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function getR2WorkerConfig(): {
  workerUrl: string;
  hmacSecret: string;
  bucketName: string;
  configured: boolean;
} {
  const workerUrl = (process.env.CLOUDFLARE_R2_WORKER_URL || "").trim().replace(/\/+$/, "");
  const hmacSecret = (process.env.CLOUDFLARE_R2_WORKER_HMAC_SECRET || "").trim();
  const bucketName = (process.env.CLOUDFLARE_R2_BUCKET_NAME || "dailymotion-discovery-private").trim();
  return {
    workerUrl,
    hmacSecret,
    bucketName,
    configured: Boolean(workerUrl && hmacSecret),
  };
}

export function signCapabilityToken(request: CapabilityTokenRequest, secretOverride?: string): string {
  const secret = (secretOverride ?? process.env.CLOUDFLARE_R2_WORKER_HMAC_SECRET ?? "").trim();
  if (!secret || secret.length < 16) {
    throw new Error("CLOUDFLARE_R2_WORKER_HMAC_SECRET must be configured with at least 16 characters to sign Worker tokens.");
  }

  const now = Math.floor(Date.now() / 1000);
  const ttl = request.ttlSeconds ?? 120;
  const owner = request.storageOwnerUuid.trim().toLowerCase();

  const claims: SignedCapabilityClaims = {
    iss: "dailymotion-discovery-web",
    aud: "dailymotion-discovery-api",
    sub: (request.subject || owner).trim(),
    storage_owner_uuid: owner,
    operation: request.operation,
    key: request.key,
    ...(request.batchId ? { batch_id: request.batchId } : {}),
    ...(request.allowedKeys && request.allowedKeys.length > 0 ? { allowed_keys: request.allowedKeys } : {}),
    ...(typeof request.maxBytes === "number" ? { max_bytes: request.maxBytes } : {}),
    ...(request.contentType ? { content_type: request.contentType } : {}),
    iat: now,
    exp: now + ttl,
    jti: crypto.randomUUID(),
  };

  const headerPart = encodeBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadPart = encodeBase64Url(JSON.stringify(claims));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = encodeBase64Url(crypto.createHmac("sha256", secret).update(signingInput).digest());

  return `${signingInput}.${signature}`;
}
