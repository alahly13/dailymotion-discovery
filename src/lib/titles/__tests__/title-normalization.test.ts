import { describe, expect, it } from "vitest";
import {
  normalizeTitle,
  isMeaningfulTitle,
  isPlaceholderTitle,
  mergeTitles,
  buildStoredTitleRecord,
  UNTITLED_VIDEO_PLACEHOLDER,
} from "../title-normalization";

describe("Title Normalization & Safe Merging Engine", () => {
  it("normalizes titles and cleans up HTML entities while preserving Unicode", () => {
    expect(normalizeTitle("Breaking News: Space Mission &amp; Discovery")).toBe(
      "Breaking News: Space Mission & Discovery"
    );
    expect(normalizeTitle("&quot;Hello World&quot;")).toBe('"Hello World"');
    expect(normalizeTitle("   العربية: تقرير خاص حول الاكتشافات الجديدة   ")).toBe(
      "العربية: تقرير خاص حول الاكتشافات الجديدة"
    );
    expect(normalizeTitle(null)).toBe(UNTITLED_VIDEO_PLACEHOLDER);
    expect(normalizeTitle("")).toBe(UNTITLED_VIDEO_PLACEHOLDER);
    expect(normalizeTitle("   ")).toBe(UNTITLED_VIDEO_PLACEHOLDER);
  });

  it("identifies placeholder vs meaningful titles correctly", () => {
    expect(isPlaceholderTitle("")).toBe(true);
    expect(isPlaceholderTitle("untitled")).toBe(true);
    expect(isPlaceholderTitle("Untitled Dailymotion video")).toBe(true);
    expect(isPlaceholderTitle("Untitled Video")).toBe(true);
    expect(isMeaningfulTitle("Dailymotion Launch Event 2026")).toBe(true);
    expect(isMeaningfulTitle("x123456")).toBe(true); // arbitrary string
  });

  it("performs non-destructive title merging", () => {
    // 1. Missing incoming does not erase an existing meaningful title
    expect(mergeTitles("Historical Documentary Part 1", null)).toBe("Historical Documentary Part 1");
    expect(mergeTitles("Historical Documentary Part 1", "")).toBe("Historical Documentary Part 1");
    expect(mergeTitles("Historical Documentary Part 1", "Untitled Dailymotion video")).toBe(
      "Historical Documentary Part 1"
    );

    // 2. Meaningful incoming updates an existing placeholder
    expect(mergeTitles("Untitled Video", "Actual Scientific Lecture")).toBe("Actual Scientific Lecture");
    expect(mergeTitles("Untitled Dailymotion video", "Actual Scientific Lecture")).toBe(
      "Actual Scientific Lecture"
    );

    // 3. Meaningful incoming updates existing title cleanly
    expect(mergeTitles("Old Video Title", "New Verified Video Title")).toBe("New Verified Video Title");

    // 4. If both are placeholders, returns clean fallback
    expect(mergeTitles("", "")).toBe(UNTITLED_VIDEO_PLACEHOLDER);
    expect(mergeTitles(null, undefined)).toBe(UNTITLED_VIDEO_PLACEHOLDER);
  });

  it("builds correct lightweight StoredTitleRecord for R2 and IndexedDB", () => {
    const record = buildStoredTitleRecord({
      kind: "video",
      id: "x8abc123",
      canonicalItemKey: "dailymotion:video:x8abc123",
      title: "Mars Rover Live Stream",
      updatedAt: "2026-11-21T12:00:00.000Z",
    });

    expect(record).toEqual({
      provider: "dailymotion",
      kind: "video",
      id: "x8abc123",
      canonicalItemKey: "dailymotion:video:x8abc123",
      title: "Mars Rover Live Stream",
      updatedAt: "2026-11-21T12:00:00.000Z",
      schemaVersion: 1,
    });
  });
});
