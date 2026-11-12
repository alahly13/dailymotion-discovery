import crypto from "node:crypto";
import {
  type CanonicalDatasetSlug,
  generationManifestKey,
  generationPartKey,
  datasetVersionPointerKey,
} from "./r2-canonical-paths";

/**
 * Deterministic UTF-8 byte-aware generation manifest & part serializer.
 *
 * Enforces the 40 MiB target / 45 MiB hard ceiling per R2 object part, computing
 * per-part SHA-256 checksums and an aggregate SHA-256 digest across sorted parts.
 */

export const R2_TARGET_PART_BYTES = 40 * 1024 * 1024;
export const R2_HARD_PART_LIMIT_BYTES = 45 * 1024 * 1024;
export const R2_MANIFEST_FORMAT_VERSION = "2026.1";

export interface SerializedPart {
  partIndex: number;
  key: string;
  sha256: string;
  byteCount: number;
  recordCount: number;
  jsonString: string;
}

export interface GenerationManifestDocument {
  formatVersion: string;
  platform: "dailymotion";
  datasetSlug: CanonicalDatasetSlug;
  ownerId: string;
  generationId: string;
  createdAt: string;
  recordCount: number;
  partCount: number;
  totalBytes: number;
  aggregateSha256: string;
  parts: Array<{
    partIndex: number;
    key: string;
    sha256: string;
    byteCount: number;
    recordCount: number;
  }>;
  metadata?: Record<string, unknown>;
}

export interface DatasetVersionPointer {
  formatVersion: string;
  platform: "dailymotion";
  datasetSlug: CanonicalDatasetSlug;
  ownerId: string;
  activeGenerationId: string;
  manifestKey: string;
  aggregateSha256: string;
  recordCount: number;
  totalBytes: number;
  committedAt: string;
}

export interface SerializedGenerationBundle {
  datasetSlug: CanonicalDatasetSlug;
  ownerId: string;
  generationId: string;
  manifestKey: string;
  versionPointerKey: string;
  manifest: GenerationManifestDocument;
  manifestJson: string;
  manifestSha256: string;
  manifestBytes: number;
  versionPointer: DatasetVersionPointer;
  versionPointerJson: string;
  parts: SerializedPart[];
}

export function sha256Hex(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function computeAggregateSha256(
  parts: Array<{ partIndex: number; sha256: string; byteCount: number }>
): string {
  const ordered = [...parts].sort((a, b) => a.partIndex - b.partIndex);
  const canonical = ordered.map((p) => `${p.partIndex}:${p.sha256}:${p.byteCount}`).join("\n");
  return sha256Hex(canonical);
}

export interface SerializeGenerationOptions<T> {
  ownerId: string;
  datasetSlug: CanonicalDatasetSlug;
  generationId: string;
  records: T[];
  targetPartBytes?: number;
  hardPartLimitBytes?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export function serializeGenerationBundle<T>(options: SerializeGenerationOptions<T>): SerializedGenerationBundle {
  const targetBytes = Math.min(options.targetPartBytes ?? R2_TARGET_PART_BYTES, R2_HARD_PART_LIMIT_BYTES);
  const hardLimitBytes = Math.min(options.hardPartLimitBytes ?? R2_HARD_PART_LIMIT_BYTES, R2_HARD_PART_LIMIT_BYTES);
  const createdAt = options.createdAt ?? new Date().toISOString();

  const buckets: T[][] = [];
  let currentBucket: T[] = [];
  let currentBytes = 64; // base wrapper overhead

  const buildWrapperString = (partIndex: number, items: T[]): string =>
    JSON.stringify({
      formatVersion: R2_MANIFEST_FORMAT_VERSION,
      datasetSlug: options.datasetSlug,
      generationId: options.generationId,
      partIndex,
      recordCount: items.length,
      items,
    });

  if (options.records.length === 0) {
    buckets.push([]);
  } else {
    for (const record of options.records) {
      const encodedRecord = JSON.stringify(record);
      const recordBytes = Buffer.byteLength(encodedRecord, "utf8") + 1;

      if (recordBytes + 256 > hardLimitBytes) {
        throw new Error(
          `Single record in dataset "${options.datasetSlug}" exceeds R2 hard per-object cap (${recordBytes} bytes > ${hardLimitBytes} bytes).`
        );
      }

      if (currentBucket.length > 0 && currentBytes + recordBytes > targetBytes) {
        buckets.push(currentBucket);
        currentBucket = [];
        currentBytes = 64;
      }

      currentBucket.push(record);
      currentBytes += recordBytes;
    }

    if (currentBucket.length > 0) {
      buckets.push(currentBucket);
    }
  }

  const parts: SerializedPart[] = buckets.map((items, idx) => {
    const partIndex = idx + 1;
    const jsonString = buildWrapperString(partIndex, items);
    const byteCount = Buffer.byteLength(jsonString, "utf8");
    if (byteCount > hardLimitBytes) {
      throw new Error(`Serialized part ${partIndex} exceeds hard byte limit (${byteCount} > ${hardLimitBytes})`);
    }
    return {
      partIndex,
      key: generationPartKey(options.ownerId, options.datasetSlug, options.generationId, partIndex),
      sha256: sha256Hex(jsonString),
      byteCount,
      recordCount: items.length,
      jsonString,
    };
  });

  const aggregateSha256 = computeAggregateSha256(parts);
  const totalBytes = parts.reduce((acc, p) => acc + p.byteCount, 0);

  const manifest: GenerationManifestDocument = {
    formatVersion: R2_MANIFEST_FORMAT_VERSION,
    platform: "dailymotion",
    datasetSlug: options.datasetSlug,
    ownerId: options.ownerId,
    generationId: options.generationId,
    createdAt,
    recordCount: options.records.length,
    partCount: parts.length,
    totalBytes,
    aggregateSha256,
    parts: parts.map((p) => ({
      partIndex: p.partIndex,
      key: p.key,
      sha256: p.sha256,
      byteCount: p.byteCount,
      recordCount: p.recordCount,
    })),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };

  const manifestKey = generationManifestKey(options.ownerId, options.datasetSlug, options.generationId);
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestBytes = Buffer.byteLength(manifestJson, "utf8");
  const manifestSha256 = sha256Hex(manifestJson);

  const versionPointerKey = datasetVersionPointerKey(options.ownerId, options.datasetSlug);
  const versionPointer: DatasetVersionPointer = {
    formatVersion: R2_MANIFEST_FORMAT_VERSION,
    platform: "dailymotion",
    datasetSlug: options.datasetSlug,
    ownerId: options.ownerId,
    activeGenerationId: options.generationId,
    manifestKey,
    aggregateSha256,
    recordCount: options.records.length,
    totalBytes,
    committedAt: createdAt,
  };

  return {
    datasetSlug: options.datasetSlug,
    ownerId: options.ownerId,
    generationId: options.generationId,
    manifestKey,
    versionPointerKey,
    manifest,
    manifestJson,
    manifestSha256,
    manifestBytes,
    versionPointer,
    versionPointerJson: JSON.stringify(versionPointer, null, 2),
    parts,
  };
}
