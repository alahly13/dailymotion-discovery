import { describe, expect, it } from "vitest";
import type { DiscoveryItem } from "@/lib/discovery/types";
import {
  computeCatalogChecksum,
  resolveFieldSelection,
  resolveLinkExplorerInput,
} from "../link-explorer-service";
import { computeResourceIntelligence } from "../link-explorer-types";
import { analyzeDailymotionUrlOrId } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";

describe("Link Explorer Intelligence & Capability Architecture (2026)", () => {
  const mockItems: DiscoveryItem[] = [
    {
      kind: "video",
      apiVersion: "v1",
      id: "x10001",
      title: "First Historical Broadcast",
      description: "Oldest recorded video in channel archive",
      thumbnail: "https://example.com/thumb1.jpg",
      url: "https://www.dailymotion.com/video/x10001",
      duration: 360,
      language: "en",
      country: "US",
      category: "news",
      createdAt: "2012-05-10T14:30:00Z",
      year: 2012,
      tags: ["news", "archive"],
      ownerId: "lemonde",
      ownerName: "Le Monde",
      views: 125000,
      extra: { likes_total: 1500 },
      raw: {},
    },
    {
      kind: "video",
      apiVersion: "v1",
      id: "x10002",
      title: "Mid-Era Report",
      description: "Mid-era news report",
      thumbnail: "https://example.com/thumb2.jpg",
      url: "https://www.dailymotion.com/video/x10002",
      duration: 180,
      language: "fr",
      country: "FR",
      category: "news",
      createdAt: "2019-08-20T10:00:00Z",
      year: 2019,
      tags: ["france", "report"],
      ownerId: "lemonde",
      ownerName: "Le Monde",
      views: 45000,
      extra: { likes_total: 800 },
      raw: {},
    },
    {
      kind: "video",
      apiVersion: "v1",
      id: "x10003",
      title: "Latest Breaking News",
      description: "Fresh broadcast from today",
      thumbnail: "https://example.com/thumb3.jpg",
      url: "https://www.dailymotion.com/video/x10003",
      duration: 540,
      language: "fr",
      country: "FR",
      category: "news",
      createdAt: new Date().toISOString(),
      year: new Date().getUTCFullYear(),
      tags: ["breaking", "live"],
      ownerId: "lemonde",
      ownerName: "Le Monde",
      views: 5200,
      extra: { likes_total: 320 },
      raw: {},
    },
  ];

  const analyzed = analyzeDailymotionUrlOrId("https://www.dailymotion.com/lemonde");

  const mockMainItem: DiscoveryItem = {
    kind: "channel",
    apiVersion: "v1",
    id: "lemonde",
    title: "Le Monde",
    description: "Official channel of the daily newspaper Le Monde.",
    thumbnail: "https://example.com/lemonde-avatar.jpg",
    url: "https://www.dailymotion.com/lemonde",
    duration: null,
    language: "fr",
    country: "FR",
    category: "news",
    createdAt: "2008-01-15T12:00:00Z",
    year: 2008,
    tags: ["news", "journalism"],
    ownerId: "lemonde",
    ownerName: "Le Monde",
    views: null,
    extra: {
      videos_total: 3000,
      verified: true,
    },
    raw: {},
  };

  it("computes comprehensive resource intelligence from retrieved items", () => {
    const intelligence = computeResourceIntelligence(
      mockItems,
      mockMainItem,
      "v1",
      analyzed,
      "completed"
    );

    // Profile metadata
    expect(intelligence.profile.name).toBe("Le Monde");
    expect(intelligence.profile.id).toBe("lemonde");
    expect(intelligence.profile.verified).toBe(true);
    expect(intelligence.profile.apiVersion).toBe("v1");
    expect(intelligence.profile.country).toBe("FR");

    // Statistics
    expect(intelligence.statistics.providerReportedVideos).toBe(3000);
    expect(intelligence.statistics.locallyRetrievedVideos).toBe(3);
    expect(intelligence.statistics.totalRetrieved).toBe(3);
    expect(intelligence.statistics.isEstimated).toBe(true); // > 1,000 items

    // Chronology
    expect(intelligence.chronology.oldestVideo?.id).toBe("x10001");
    expect(intelligence.chronology.oldestVideo?.title).toBe("First Historical Broadcast");
    expect(intelligence.chronology.newestVideo?.id).toBe("x10003");
    expect(intelligence.chronology.isRecentlyActive).toBe(true);

    // Distribution
    expect(intelligence.distribution.byYear.length).toBeGreaterThan(0);
    expect(intelligence.distribution.byYear.some((y) => y.year === 2012)).toBe(true);
    expect(intelligence.distribution.byYear.some((y) => y.year === 2019)).toBe(true);
  });

  it("computes deterministic SHA-256 catalog checksum", async () => {
    const hash1 = await computeCatalogChecksum(mockItems, "lemonde");
    const hash2 = await computeCatalogChecksum(mockItems, "lemonde");
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe("string");
    expect(hash1.length).toBeGreaterThan(0);
  });

  it("resolves sparse fields for V1 and V2 independently", () => {
    // V1 fields
    const v1Basic = resolveFieldSelection("v1", "basic");
    expect(v1Basic).toContain("thumbnail_480_url");
    expect(v1Basic).toContain("created_time");

    const v1Standard = resolveFieldSelection("v1", "standard");
    expect(v1Standard).toContain("views_total");
    expect(v1Standard).toContain("owner.screenname");

    // V2 fields
    const v2Basic = resolveFieldSelection("v2", "basic");
    expect(v2Basic).toContain("video_id");
    expect(v2Basic).toContain("created_at");
    expect(v2Basic).not.toContain("thumbnail_480_url"); // strictly V2 REST schema

    const v2Extended = resolveFieldSelection("v2", "extended");
    expect(v2Extended).toContain("likes_total");
    expect(v2Extended).toContain("aspect_ratio");
  });

  it("strictly redirects keyword queries to Global Search", async () => {
    const res = await resolveLinkExplorerInput("breaking news latest", "v1");
    expect(res.ok).toBe(false);
    expect(res.effectiveKind).toBe("search");
    expect(res.reason).toBe("keyword_search_redirect");
    expect(res.error).toContain("Global Search");
  });
});
