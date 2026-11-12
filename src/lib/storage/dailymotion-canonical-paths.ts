/**
 * Authoritative Canonical Path Registry for Dailymotion Discovery (2026)
 *
 * All persistent research datasets, snapshots, and manifests MUST use this centralized registry.
 * Prevents arbitrary, unvalidated, or non-deterministic R2 object keys.
 *
 * Structure:
 * dailymotion/
 *   persistence/
 *     {OWNER_UUID}/
 *       saved-items/
 *         snapshots/{GENERATION_ID}/manifest.json
 *         snapshots/{GENERATION_ID}/parts/part-000001.json
 *         version.json
 *       discovery/
 *         videos/snapshots/{SNAPSHOT_ID}/manifest.json
 *         channels/snapshots/{SNAPSHOT_ID}/manifest.json
 *         search/snapshots/{SNAPSHOT_ID}/manifest.json
 *       collections/
 *         snapshots/{GENERATION_ID}/...
 *       saved-searches/
 *         snapshots/{GENERATION_ID}/...
 *       search-history/
 *         snapshots/{GENERATION_ID}/...
 *       legacy-supabase-archive/{BATCH_TAG}/...
 */

import {
  R2_CANONICAL_PREFIX,
  R2_TEMP_PREFIX,
  CANONICAL_DATASET_SLUGS,
  type CanonicalDatasetSlug,
  normalizeStorageOwnerId,
  assertSafeSegment,
  getConfiguredStorageOwner,
  datasetRootPrefix as r2DatasetRootPrefix,
  datasetVersionPointerKey as r2DatasetVersionPointerKey,
  generationPrefix as r2GenerationPrefix,
  generationManifestKey as r2GenerationManifestKey,
  generationPartKey as r2GenerationPartKey,
  legacyArchiveObjectKey as r2LegacyArchiveObjectKey,
} from "./r2-canonical-paths";

export {
  R2_CANONICAL_PREFIX,
  R2_TEMP_PREFIX,
  CANONICAL_DATASET_SLUGS,
  type CanonicalDatasetSlug,
  normalizeStorageOwnerId,
  assertSafeSegment,
  getConfiguredStorageOwner,
};

export type DiscoveryResourceType = "videos" | "channels" | "search" | "playlists" | "users";

/**
 * Root directory for a specific dataset under an owner
 */
export function getDatasetRootPath(ownerId: string, datasetSlug: CanonicalDatasetSlug): string {
  return r2DatasetRootPrefix(ownerId, datasetSlug);
}

/**
 * Key for dataset version pointer (version.json)
 */
export function getDatasetVersionPointerKey(ownerId: string, datasetSlug: CanonicalDatasetSlug): string {
  return r2DatasetVersionPointerKey(ownerId, datasetSlug);
}

/**
 * Key for generation manifest (manifest.json)
 */
export function getGenerationManifestKey(ownerId: string, datasetSlug: CanonicalDatasetSlug, generationId: string): string {
  return r2GenerationManifestKey(ownerId, datasetSlug, generationId);
}

/**
 * Key for a numbered data part (parts/part-000001.json)
 */
export function getGenerationPartKey(
  ownerId: string,
  datasetSlug: CanonicalDatasetSlug,
  generationId: string,
  partIndexOneBased: number
): string {
  return r2GenerationPartKey(ownerId, datasetSlug, generationId, partIndexOneBased);
}

/**
 * Discovery page snapshot manifest path
 */
export function getDiscoverySnapshotManifestKey(
  ownerId: string,
  resourceType: DiscoveryResourceType,
  snapshotId: string
): string {
  const owner = normalizeStorageOwnerId(ownerId);
  const resource = assertSafeSegment(resourceType, "resourceType");
  const snap = assertSafeSegment(snapshotId, "snapshotId");
  return `${R2_CANONICAL_PREFIX}/${owner}/discovery/${resource}/snapshots/${snap}/manifest.json`;
}

/**
 * Discovery page snapshot part path
 */
export function getDiscoverySnapshotPartKey(
  ownerId: string,
  resourceType: DiscoveryResourceType,
  snapshotId: string,
  pageIndexOneBased: number
): string {
  const owner = normalizeStorageOwnerId(ownerId);
  const resource = assertSafeSegment(resourceType, "resourceType");
  const snap = assertSafeSegment(snapshotId, "snapshotId");
  const padded = String(pageIndexOneBased).padStart(4, "0");
  return `${R2_CANONICAL_PREFIX}/${owner}/discovery/${resource}/snapshots/${snap}/data/page-${padded}.json`;
}

/**
 * Path for legacy Supabase Storage archive object
 */
export function getLegacyArchiveObjectKey(ownerId: string, batchTag: string, legacyRelativeKey: string): string {
  return r2LegacyArchiveObjectKey(ownerId, batchTag, legacyRelativeKey);
}
