import { describe, it, expect } from "vitest";
import {
  getDatasetRootPath,
  getDatasetVersionPointerKey,
  getGenerationManifestKey,
  getGenerationPartKey,
  getDiscoverySnapshotManifestKey,
  getDiscoverySnapshotPartKey,
  getLegacyArchiveObjectKey,
  R2_CANONICAL_PREFIX,
} from "../dailymotion-canonical-paths";

describe("dailymotion-canonical-paths", () => {
  const ownerUuid = "123e4567-e89b-12d3-a456-426614174000";

  it("builds consistent dataset root and version pointer paths", () => {
    const root = getDatasetRootPath(ownerUuid, "saved-items");
    expect(root).toBe(`${R2_CANONICAL_PREFIX}/${ownerUuid}/saved-items`);

    const versionKey = getDatasetVersionPointerKey(ownerUuid, "saved-items");
    expect(versionKey).toBe(`${R2_CANONICAL_PREFIX}/${ownerUuid}/saved-items/version.json`);
  });

  it("builds immutable generation manifest and part paths", () => {
    const genId = "gen_20261112_001";
    const manifestKey = getGenerationManifestKey(ownerUuid, "saved-items", genId);
    expect(manifestKey).toBe(
      `${R2_CANONICAL_PREFIX}/${ownerUuid}/saved-items/generations/${genId}/manifest.json`
    );

    const partKey = getGenerationPartKey(ownerUuid, "saved-items", genId, 1);
    expect(partKey).toBe(
      `${R2_CANONICAL_PREFIX}/${ownerUuid}/saved-items/generations/${genId}/parts/part-000001.json`
    );
  });

  it("builds discovery snapshot manifest and paginated part paths", () => {
    const snapId = "snap_video_2026";
    const manifestKey = getDiscoverySnapshotManifestKey(ownerUuid, "videos", snapId);
    expect(manifestKey).toBe(
      `${R2_CANONICAL_PREFIX}/${ownerUuid}/discovery/videos/snapshots/${snapId}/manifest.json`
    );

    const partKey = getDiscoverySnapshotPartKey(ownerUuid, "videos", snapId, 2);
    expect(partKey).toBe(
      `${R2_CANONICAL_PREFIX}/${ownerUuid}/discovery/videos/snapshots/${snapId}/data/page-0002.json`
    );
  });

  it("builds legacy archive keys under owner scope", () => {
    const archiveKey = getLegacyArchiveObjectKey(ownerUuid, "batch-1", "docs/report.json");
    expect(archiveKey).toContain(`${ownerUuid}/legacy-supabase-archive/batch-1/docs/report.json`);
  });

  it("rejects path traversal attempts in path segments", () => {
    expect(() => getGenerationManifestKey(ownerUuid, "saved-items", "../hacked")).toThrow();
  });
});
