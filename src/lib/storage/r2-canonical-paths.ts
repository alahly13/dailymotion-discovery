/**
 * Canonical Cloudflare R2 path builder for Dailymotion Discovery.
 *
 * All authoritative research data lives under strict owner-scoped prefixes:
 *   dailymotion/persistence/<ownerId>/<datasetSlug>/version.json
 *   dailymotion/persistence/<ownerId>/<datasetSlug>/generations/<generationId>/manifest.json
 *   dailymotion/persistence/<ownerId>/<datasetSlug>/generations/<generationId>/parts/part-000001.json
 *
 * Legacy Supabase Storage snapshots migrated non-destructively live under:
 *   dailymotion/persistence/<ownerId>/legacy-supabase-archive/<legacyPath>
 *
 * Path invariants MUST stay aligned with
 * `cloudflare/workers/dailymotion-discovery-api/src/index.ts` (`sanitizeObjectKey` + `isOwnerScopedDailymotionKey`).
 */

export const R2_CANONICAL_PREFIX = "dailymotion/persistence";
export const R2_TEMP_PREFIX = "dailymotion/temp";

export const CANONICAL_DATASET_SLUGS = [
  "saved-items",
  "collections",
  "collection-items",
  "saved-searches",
  "search-history",
  "saved-titles",
  "research-notes",
  "legacy-supabase-archive",
] as const;

export type CanonicalDatasetSlug = (typeof CANONICAL_DATASET_SLUGS)[number];

const SAFE_SEGMENT_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export function normalizeStorageOwnerId(ownerId?: string | null): string {
  const raw = (ownerId ?? "admin").trim().toLowerCase();
  if (!raw || raw.includes("..") || raw.includes("/") || raw.includes("\\")) {
    throw new Error(`Invalid storage owner identifier: "${ownerId ?? ""}"`);
  }
  const normalized = raw.replace(/[^a-z0-9._-]/g, "-");
  if (!SAFE_SEGMENT_RE.test(normalized)) {
    throw new Error(`Normalized storage owner identifier is unsafe: "${normalized}"`);
  }
  return normalized;
}

export function assertSafeSegment(segment: string, label: string): string {
  const cleaned = segment.trim().toLowerCase();
  if (!cleaned || cleaned.includes("..") || cleaned.includes("/") || cleaned.includes("\\") || !SAFE_SEGMENT_RE.test(cleaned)) {
    throw new Error(`Unsafe R2 path ${label}: "${segment}"`);
  }
  return cleaned;
}

export function getConfiguredStorageOwner(): string {
  return normalizeStorageOwnerId(process.env.STORAGE_OWNER_UUID || "admin");
}

export function datasetRootPrefix(ownerId: string, datasetSlug: CanonicalDatasetSlug): string {
  const owner = normalizeStorageOwnerId(ownerId);
  return `${R2_CANONICAL_PREFIX}/${owner}/${datasetSlug}`;
}

export function datasetVersionPointerKey(ownerId: string, datasetSlug: CanonicalDatasetSlug): string {
  return `${datasetRootPrefix(ownerId, datasetSlug)}/version.json`;
}

export function generationPrefix(ownerId: string, datasetSlug: CanonicalDatasetSlug, generationId: string): string {
  const gen = assertSafeSegment(generationId, "generationId");
  return `${datasetRootPrefix(ownerId, datasetSlug)}/generations/${gen}`;
}

export function generationManifestKey(ownerId: string, datasetSlug: CanonicalDatasetSlug, generationId: string): string {
  return `${generationPrefix(ownerId, datasetSlug, generationId)}/manifest.json`;
}

export function generationPartKey(
  ownerId: string,
  datasetSlug: CanonicalDatasetSlug,
  generationId: string,
  partIndexOneBased: number
): string {
  if (!Number.isInteger(partIndexOneBased) || partIndexOneBased < 1) {
    throw new Error(`Part index must be a positive integer (received ${partIndexOneBased})`);
  }
  const padded = String(partIndexOneBased).padStart(6, "0");
  return `${generationPrefix(ownerId, datasetSlug, generationId)}/parts/part-${padded}.json`;
}

export function legacyArchiveObjectKey(ownerId: string, batchTag: string, legacyRelativeKey: string): string {
  const owner = normalizeStorageOwnerId(ownerId);
  const tag = assertSafeSegment(batchTag, "batchTag");
  const cleanRel = legacyRelativeKey
    .replace(/^\/+/, "")
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!cleanRel) {
    throw new Error("Legacy relative key cannot be empty");
  }
  return `${R2_CANONICAL_PREFIX}/${owner}/legacy-supabase-archive/${tag}/${cleanRel}`;
}

export function ownerScopePrefix(ownerId: string): string {
  return `${R2_CANONICAL_PREFIX}/${normalizeStorageOwnerId(ownerId)}/`;
}

/**
 * Authoritative Canonical R2 Paths for Saved Titles Manifest System (2026)
 */
export function savedTitlesRootPrefix(ownerId: string): string {
  return `${R2_CANONICAL_PREFIX}/${normalizeStorageOwnerId(ownerId)}/saved-titles`;
}

export function savedTitlesManifestKey(ownerId: string): string {
  return `${savedTitlesRootPrefix(ownerId)}/manifest.json`;
}

export function savedTitlesVersionPointerKey(ownerId: string): string {
  return `${savedTitlesRootPrefix(ownerId)}/version.json`;
}

export function savedTitlesGenerationManifestKey(ownerId: string, generationId: string): string {
  const gen = assertSafeSegment(generationId, "generationId");
  return `${savedTitlesRootPrefix(ownerId)}/generations/${gen}/manifest.json`;
}

/**
 * Professional Owner-Scoped Dailymotion Architecture Paths (2026)
 *
 * Dedicated storage tree strictly isolated per administrator/owner:
 *   admins/{adminId}/dailymotion/items/{resourceType}/{id}.json
 *   admins/{adminId}/dailymotion/titles/{resourceType}/{id}.json
 *   admins/{adminId}/dailymotion/indexes/{indexName}.json
 *   admins/{adminId}/dailymotion/manifest.json
 *   admins/{adminId}/dailymotion/generations/{generationId}/manifest.json
 *   admins/{adminId}/dailymotion/checkpoints/{scanId}.json
 *   admins/{adminId}/dailymotion/sync-receipts/{batchId}.json
 */
export function adminRootPrefix(ownerId?: string | null): string {
  const owner = normalizeStorageOwnerId(ownerId);
  return `admins/${owner}/dailymotion`;
}

export function sanitizeResourceId(id: string): string {
  const cleaned = id.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  if (!cleaned) {
    throw new Error("Resource ID cannot be empty or invalid");
  }
  return cleaned;
}

export function adminItemObjectKey(ownerId: string, resourceType: string, id: string): string {
  const type = assertSafeSegment(resourceType, "resourceType");
  const cleanId = sanitizeResourceId(id);
  return `${adminRootPrefix(ownerId)}/items/${type}/${cleanId}.json`;
}

export function adminTitleObjectKey(ownerId: string, resourceType: string, id: string): string {
  const type = assertSafeSegment(resourceType, "resourceType");
  const cleanId = sanitizeResourceId(id);
  return `${adminRootPrefix(ownerId)}/titles/${type}/${cleanId}.json`;
}

export function adminIndexKey(ownerId: string, indexName: string): string {
  const index = assertSafeSegment(indexName, "indexName");
  return `${adminRootPrefix(ownerId)}/indexes/${index}.json`;
}

export function adminManifestKey(ownerId: string, generationId?: string): string {
  if (generationId) {
    const gen = assertSafeSegment(generationId, "generationId");
    return `${adminRootPrefix(ownerId)}/generations/${gen}/manifest.json`;
  }
  return `${adminRootPrefix(ownerId)}/manifest.json`;
}

export function adminCheckpointKey(ownerId: string, scanId: string): string {
  const scan = assertSafeSegment(scanId, "scanId");
  return `${adminRootPrefix(ownerId)}/checkpoints/${scan}.json`;
}

export function adminSyncReceiptKey(ownerId: string, batchId: string): string {
  const batch = assertSafeSegment(batchId, "batchId");
  return `${adminRootPrefix(ownerId)}/sync-receipts/${batch}.json`;
}
