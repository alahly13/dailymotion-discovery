import { describe, expect, it } from "vitest";
import { applyAdvancedVideoFilters } from "../apply-advanced-video-filters";
import type { NormalizedVideoMetadata } from "@/types/video";

function makeVideo(overrides: Partial<NormalizedVideoMetadata>): NormalizedVideoMetadata {
  return {
    id: "v1",
    platform: "dailymotion",
    title: "Sample Video",
    description: "Sample description",
    thumbnail: "https://example.com/thumb.jpg",
    embedUrl: "https://www.dailymotion.com/embed/video/v1",
    url: "https://www.dailymotion.com/video/v1",
    duration: 300,
    views: 1500,
    rating: null,
    channelId: "tech",
    channelName: "Tech",
    ownerId: "u1",
    ownerName: "Creator",
    language: "en",
    tags: ["nextjs", "prisma"],
    createdAt: "2026-05-01T18:30:00.000Z",
    year: 2026,
    hasThumbnail: true,
    hasDescription: true,
    ...overrides,
  };
}

describe("applyAdvancedVideoFilters", () => {
  it("treats date-only dateTo as inclusive UTC end-of-day", () => {
    const videos = [
      makeVideo({ id: "same-day-evening", createdAt: "2026-05-01T23:50:00.000Z" }),
      makeVideo({ id: "next-day", createdAt: "2026-05-02T00:05:00.000Z" }),
    ];
    const filtered = applyAdvancedVideoFilters(videos, {
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
    });
    expect(filtered.map((v) => v.id)).toEqual(["same-day-evening"]);
  });

  it("filters by excludeKeyword and required tags", () => {
    const videos = [
      makeVideo({ id: "keep", title: "Prisma 7 Production Guide", tags: ["prisma", "postgres"] }),
      makeVideo({ id: "excluded", title: "Prisma 7 Teaser Trailer", tags: ["prisma", "postgres"] }),
      makeVideo({ id: "missing-tag", title: "Prisma 7 Guide", tags: ["prisma"] }),
    ];
    const filtered = applyAdvancedVideoFilters(videos, {
      excludeKeyword: "teaser, trailer",
      tags: "prisma, postgres",
    });
    expect(filtered.map((v) => v.id)).toEqual(["keep"]);
  });
});
