import { describe, expect, it } from "vitest";
import {
  STORAGE_BUCKET,
  buildEnvelope,
  manifestSnapshotPath,
  playlistSnapshotPath,
  savedItemsSnapshotPath,
  searchHistoryPath,
  searchSnapshotPath,
  sha256Hex,
  verifyEnvelope,
} from "../paths";

describe("storage path conventions", () => {
  it("uses the private application-data bucket with versioned paths", () => {
    expect(STORAGE_BUCKET).toBe("application-data");
    const when = new Date("2026-10-11T12:00:00Z");
    expect(searchHistoryPath("v1", "b1", when)).toBe("users/admin/search-history/v1/2026/10/b1.json");
    expect(searchSnapshotPath("v2", "s1", when)).toBe("users/admin/search-snapshots/v2/2026/10/s1.json");
    expect(savedItemsSnapshotPath("r1")).toBe("users/admin/saved-items/snapshots/r1.json");
    expect(playlistSnapshotPath("p1", "r2")).toBe("users/admin/playlists/p1/snapshots/r2.json");
    expect(manifestSnapshotPath("channel", "r3")).toBe("users/admin/manifests/channel/r3.json");
  });

  it("builds checksummed envelopes and detects tampering", () => {
    const { envelope, checksum } = buildEnvelope("saved-items", "v1", { a: 1 }, "rev-1");
    expect(checksum).toBe(sha256Hex(JSON.stringify({ a: 1 })));
    expect(verifyEnvelope(envelope)).toBe(true);
    expect(verifyEnvelope({ ...envelope, data: { a: 2 } })).toBe(false);
    expect(verifyEnvelope({ ...envelope, schemaVersion: "999" })).toBe(false);
  });
});
