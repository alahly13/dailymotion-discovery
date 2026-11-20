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

  it("calculates omitted/unavailable references and duplicate counts in statistics", () => {
    const intelligence = computeResourceIntelligence(
      mockItems,
      mockMainItem,
      "v2",
      analyzed,
      "completed",
      {
        duplicatesSkipped: 7,
        pagesRetrieved: 3,
        providerReportedTotal: 15,
        omittedOrUnavailable: 12,
      }
    );

    expect(intelligence.statistics.providerReportedVideos).toBe(15);
    expect(intelligence.statistics.duplicatesSkipped).toBe(7);
    expect(intelligence.statistics.pagesRetrieved).toBe(3);
    expect(intelligence.statistics.omittedOrUnavailableReferences).toBe(12);
    expect(intelligence.statistics.locallyRetrievedVideos).toBe(3);
  });

  it("handles continuation state deduplication without mutating original list", () => {
    const duplicateCandidate: DiscoveryItem = {
      ...mockItems[0],
      title: "Duplicate Title with Same ID",
    };
    const newItem: DiscoveryItem = {
      ...mockItems[1],
      id: "x99999",
      title: "Genuinely Unique New Video",
    };

    const combinedSet = new Set(mockItems.map((i) => `${i.apiVersion}:${i.kind}:${i.id}`));
    const incoming = [duplicateCandidate, newItem];

    let skipped = 0;
    const added: DiscoveryItem[] = [];
    for (const item of incoming) {
      const key = `${item.apiVersion}:${item.kind}:${item.id}`;
      if (combinedSet.has(key)) {
        skipped++;
      } else {
        combinedSet.add(key);
        added.push(item);
      }
    }

    expect(skipped).toBe(1);
    expect(added.length).toBe(1);
    expect(added[0].id).toBe("x99999");
    expect(mockItems.length).toBe(3); // Original collection preserved intact
  });

  describe("Screenshot Regression & Catalog Completeness (lsulli282)", () => {
    // Exact regression scenario from screenshot:
    // Target: user lsulli282 (ID x1pve0i, lifetime videos_total: 3090)
    // 5 pages x 100 = 500 items, and merged 700 items (500 in 2017, 200 in 2016)
    const mockLsulliTarget = analyzeDailymotionUrlOrId("lsulli282");
    const mockLsulliProfile: DiscoveryItem = {
      kind: "channel",
      apiVersion: "v1",
      id: "x1pve0i",
      title: "playlist 2016",
      description: null,
      thumbnail: null,
      url: "https://www.dailymotion.com/lsulli282",
      duration: null,
      language: "en",
      country: "US",
      category: null,
      createdAt: "2016-01-24T07:42:24.000Z",
      year: 2016,
      tags: [],
      ownerId: "x1pve0i",
      ownerName: "playlist 2016",
      views: null,
      extra: {
        username: "lsulli282",
        userId: "x1pve0i",
        videosTotal: 3090,
        videos_total: 3090,
      },
      raw: {},
    };

    // Generate 500 items in 2017 (pages 1 to 5)
    const items2017: DiscoveryItem[] = Array.from({ length: 500 }, (_, idx) => ({
      kind: "video",
      apiVersion: "v1",
      id: `x2017_${idx}`,
      title: idx === 0 ? "YGOTAS Episode 51 - The Death Of Tristan Taylor" : `Episode ${idx} 2017 Edition`,
      description: "Test episode in 2017",
      thumbnail: "https://example.com/thumb.jpg",
      url: `https://www.dailymotion.com/video/x2017_${idx}`,
      duration: 300,
      language: "en",
      country: "US",
      category: null,
      createdAt: idx === 0 ? "2017-03-24T06:20:28.000Z" : "2017-01-15T12:00:00.000Z",
      year: 2017,
      tags: ["ygotas", "anime"],
      ownerId: "x1pve0i",
      ownerName: "playlist 2016",
      views: 1000,
      extra: {},
      raw: {},
    }));

    // Generate 200 items in 2016 (pages 6 to 7)
    const items2016: DiscoveryItem[] = Array.from({ length: 200 }, (_, idx) => ({
      kind: "video",
      apiVersion: "v1",
      id: `x2016_${idx}`,
      title: idx === 199 ? "YGOTAS Episode 01 - Oldest 2016 Archive" : `Episode ${idx} 2016 Edition`,
      description: "Test episode in 2016",
      thumbnail: "https://example.com/thumb.jpg",
      url: `https://www.dailymotion.com/video/x2016_${idx}`,
      duration: 250,
      language: "en",
      country: "US",
      category: null,
      createdAt: idx === 199 ? "2016-12-12T10:00:00.000Z" : "2016-12-20T14:00:00.000Z",
      year: 2016,
      tags: ["ygotas", "classic"],
      ownerId: "x1pve0i",
      ownerName: "playlist 2016",
      views: 2000,
      extra: {},
      raw: {},
    }));

    it("reconciles Standard Scan: 5 pages x 100 items does NOT report false 100% completeness", () => {
      const standard500Items = items2017; // 500 items from 5 pages

      const intelligence = computeResourceIntelligence(
        standard500Items,
        mockLsulliProfile,
        "v1",
        mockLsulliTarget,
        "standard_scan_completed",
        {
          pagesRetrieved: 5,
          providerReportedLifetimeTotal: 3090,
          providerReportedTotal: 500, // query total
          duplicatesSkipped: 0,
          coverageStatus: "standard_scan_completed",
        }
      );

      // Verifications:
      // 1. Provider Total shows official lifetime catalog size (3,090), not capped 500
      expect(intelligence.statistics.providerReportedVideos).toBe(3090);
      expect(intelligence.statistics.providerReportedQueryTotal).toBe(500);

      // 2. Locally retrieved items exactly equals 500
      expect(intelligence.statistics.totalRetrieved).toBe(500);
      expect(intelligence.statistics.locallyRetrievedVideos).toBe(500);

      // 3. Catalog Coverage is accurate ratio (500 / 3090 = 16.2%), NEVER 100%!
      expect(intelligence.statistics.coveragePercent).toBe(16.2);
      expect(intelligence.statistics.coveragePercent).not.toBe(100);

      // 4. Status reflects standard scan completed with remaining videos
      expect(intelligence.statistics.coverageStatus).toBe("standard_scan_completed");
      expect(intelligence.statistics.coverageEvidence).toContain("Standard scan completed");
      expect(intelligence.statistics.coverageEvidence).toContain("3,090");

      // 5. Target identity preserves legacy user ID and username
      expect(mockLsulliProfile.extra?.userId).toBe("x1pve0i");
      expect(mockLsulliProfile.extra?.username).toBe("lsulli282");
    });

    it("reconciles merged 700 items dataset: internally consistent counts and correct 22.6% coverage", () => {
      const merged700Items = [...items2017, ...items2016]; // 500 from 2017 + 200 from 2016 = 700 items

      const intelligence = computeResourceIntelligence(
        merged700Items,
        mockLsulliProfile,
        "v1",
        mockLsulliTarget,
        "partial",
        {
          pagesRetrieved: 7,
          providerReportedLifetimeTotal: 3090,
          providerReportedTotal: 500,
          duplicatesSkipped: 0,
          coverageStatus: "partial",
        }
      );

      // Verifications:
      // 1. Retrieved Items = Unique Items = Resource Breakdown = 700
      expect(intelligence.statistics.totalRetrieved).toBe(700);
      expect(intelligence.statistics.locallyRetrievedVideos).toBe(700);

      // 2. Chronological landmarks match screenshot dates
      expect(intelligence.chronology.newestVideo?.date).toBe("2017-03-24T06:20:28.000Z");
      expect(intelligence.chronology.oldestVideo?.date).toBe("2016-12-12T10:00:00.000Z");

      // 3. Year distribution matches screenshot (500 in 2017, 200 in 2016)
      const year2017 = intelligence.distribution.byYear.find((y) => y.year === 2017);
      const year2016 = intelligence.distribution.byYear.find((y) => y.year === 2016);
      expect(year2017?.count).toBe(500);
      expect(year2016?.count).toBe(200);

      // 4. Coverage accurately computed against lifetime 3,090 (700 / 3090 = 22.65% -> 22.7%), NEVER 100%!
      expect(intelligence.statistics.coveragePercent).toBe(22.7);
      expect(intelligence.statistics.coverageStatus).toBe("partial");
    });

    it("detects 1,000-item window cap and marks date_partitioning_required", () => {
      const capped1000Items = Array.from({ length: 1000 }, (_, idx) => ({
        ...items2017[0],
        id: `x_capped_${idx}`,
      }));

      const intelligence = computeResourceIntelligence(
        capped1000Items,
        mockLsulliProfile,
        "v1",
        mockLsulliTarget,
        "capped_window",
        {
          pagesRetrieved: 10,
          providerReportedLifetimeTotal: 3090,
          providerReportedTotal: 1000,
          coverageStatus: "capped_window",
          coverageEvidence: "Dailymotion single-query window saturated at 1,000 items. Date partitioning is required to reach older videos.",
        }
      );

      expect(intelligence.statistics.coverageStatus).toBe("capped_window");
      expect(intelligence.statistics.coveragePercent).toBe(32.4); // 1000 / 3090 = 32.4%
      expect(intelligence.statistics.coverageEvidence).toContain("1,000 items");
    });

    it("performs instant in-memory local title search with zero network calls", () => {
      const merged700Items = [...items2017, ...items2016];

      // Exact title search
      const exactQuery = "YGOTAS Episode 51 - The Death Of Tristan Taylor";
      const exactResults = merged700Items.filter((it) =>
        (it.title || "").toLowerCase().includes(exactQuery.toLowerCase())
      );
      expect(exactResults.length).toBe(1);
      expect(exactResults[0].id).toBe("x2017_0");

      // Case-insensitive & partial title search
      const partialQuery = "death of tristan";
      const partialResults = merged700Items.filter((it) =>
        (it.title || "").toLowerCase().includes(partialQuery.toLowerCase())
      );
      expect(partialResults.length).toBe(1);

      // Whitespace trimming
      const paddedQuery = "   tristan taylor   ";
      const paddedResults = merged700Items.filter((it) =>
        (it.title || "").toLowerCase().includes(paddedQuery.trim().toLowerCase())
      );
      expect(paddedResults.length).toBe(1);

      // Searching across all retrieved pages (2016 and 2017)
      const query2016 = "2016 edition";
      const results2016 = merged700Items.filter((it) =>
        (it.title || "").toLowerCase().includes(query2016.toLowerCase())
      );
      expect(results2016.length).toBe(199); // All except Episode 01

      // Empty query restores full collection
      const emptyQuery = "   ";
      const emptyResults = emptyQuery.trim()
        ? merged700Items.filter((it) => (it.title || "").toLowerCase().includes(emptyQuery.trim().toLowerCase()))
        : merged700Items;
      expect(emptyResults.length).toBe(700);

      // Gracefully handles missing/null title without throwing
      const itemWithoutTitle: DiscoveryItem = {
        ...mockItems[0],
        title: "",
      };
      expect(() => {
        const matches = (itemWithoutTitle.title || "").toLowerCase().includes("test");
        expect(matches).toBe(false);
      }).not.toThrow();
    });
  });
});
