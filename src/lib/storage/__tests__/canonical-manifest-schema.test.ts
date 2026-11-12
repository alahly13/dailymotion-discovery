import { describe, it, expect } from "vitest";
import {
  buildCanonicalManifest,
  validateCanonicalManifest,
  DailymotionCanonicalManifestSchema,
} from "../canonical-manifest-schema";
import {
  getDatasetRootPath,
  getDatasetVersionPointerKey,
  getGenerationManifestKey,
  getGenerationPartKey,
  getDiscoverySnapshotManifestKey,
  getDiscoverySnapshotPartKey,
} from "../dailymotion-canonical-paths";

describe("Canonical Manifest System & Paths (2026)", () => {
  it("builds and validates a canonical manifest conforming strictly to schema", () => {
    const built = buildCanonicalManifest({
      ownerId: "admin",
      generationId: "gen-2026-001",
      dataset: "saved-items",
      source: {
        apiVersion: "v2",
        page: "saved-items",
        resourceType: "videos",
      },
      parts: [
        {
          partIndex: 1,
          key: "dailymotion/persistence/admin/saved-items/generations/gen-2026-001/parts/part-000001.json",
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          byteCount: 1024,
          recordCount: 15,
        },
      ],
      videoCount: 15,
      channelCount: 0,
    });

    expect(built.manifest.manifestVersion).toBe(1);
    expect(built.manifest.application).toBe("dailymotion-discovery");
    expect(built.manifest.provider).toBe("dailymotion");
    expect(built.manifest.summary.totalItems).toBe(15);
    expect(built.manifest.integrity.algorithm).toBe("SHA-256");
    expect(built.manifest.integrity.manifestChecksum).toHaveLength(64);

    const validation = validateCanonicalManifest(built.manifest);
    expect(validation.success).toBe(true);
    expect(validation.data?.generationId).toBe("gen-2026-001");
  });

  it("fails validation when required manifest fields are missing or invalid", () => {
    const invalid = {
      manifestVersion: 2, // invalid version
      application: "other-app",
    };
    const validation = validateCanonicalManifest(invalid);
    expect(validation.success).toBe(false);
    expect(validation.error).toBeDefined();
  });

  it("produces deterministic canonical paths matching reference architecture", () => {
    expect(getDatasetRootPath("admin", "saved-items")).toBe("dailymotion/persistence/admin/saved-items");
    expect(getDatasetVersionPointerKey("admin", "saved-items")).toBe("dailymotion/persistence/admin/saved-items/version.json");
    expect(getGenerationManifestKey("admin", "saved-items", "gen-99")).toBe(
      "dailymotion/persistence/admin/saved-items/generations/gen-99/manifest.json"
    );
    expect(getGenerationPartKey("admin", "saved-items", "gen-99", 1)).toBe(
      "dailymotion/persistence/admin/saved-items/generations/gen-99/parts/part-000001.json"
    );
    expect(getDiscoverySnapshotManifestKey("admin", "videos", "snap-123")).toBe(
      "dailymotion/persistence/admin/discovery/videos/snapshots/snap-123/manifest.json"
    );
    expect(getDiscoverySnapshotPartKey("admin", "videos", "snap-123", 1)).toBe(
      "dailymotion/persistence/admin/discovery/videos/snapshots/snap-123/data/page-0001.json"
    );
  });
});
