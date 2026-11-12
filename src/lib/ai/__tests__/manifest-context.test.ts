import { describe, expect, it } from "vitest";
import { compactManifestContext } from "../manifest-context";

describe("compactManifestContext", () => {
  it("enforces maxItems and maxChars while preserving evidence IDs", () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: `vid-${i}`,
      apiVersion: "v1",
      kind: "video",
      title: `Dailymotion sample title ${i} — ${"detail ".repeat(20)}`,
      ownerName: "NewsDesk",
      duration: 95,
      views: i * 100,
      tags: ["news", "live"],
    }));

    const res = compactManifestContext(items, { maxItems: 10, maxChars: 2000 });
    expect(res.totalInputItems).toBe(40);
    expect(res.includedItems).toBe(10);
    expect(res.truncated).toBe(true);
    expect(res.evidenceIds).toHaveLength(10);
    expect(res.evidenceIds[0]).toBe("vid-0");
    expect(res.serialized.length).toBeLessThanOrEqual(2000);
  });
});
