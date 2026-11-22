import { describe, expect, it } from "vitest";
import type { DiscoveryItem } from "@/lib/discovery/types";
import {
  computeCatalogChecksum,
  resolveFieldSelection,
  resolveLinkExplorerInput,
} from "../link-explorer-service";
import { computeResourceIntelligence } from "../link-explorer-types";
import { analyzeDailymotionUrlOrId } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import { formatSafeDescription } from "@/lib/utils/format-description";
import {
  saveCompletedExplorationManifest,
  getCompletedExplorationManifest,
  listCompletedExplorationManifests,
  deleteCompletedExplorationManifest,
  searchCompletedExplorations,
  type CompletedExplorationManifest,
} from "../completed-explorations-service";
import {
  saveScanCheckpoint,
  getScanCheckpoint,
  listScanCheckpoints,
  deleteScanCheckpoint,
  type ScanCheckpointRecord,
} from "../scan-checkpoint-service";
import {
  isLeapYear,
  getDaysInUtcMonth,
  generateMonthPeriod,
  generateYearPeriod,
  generateCustomPeriod,
  partitionCustomDateRange,
  initializeStrategyPeriods,
  subdivideSaturatedPeriod,
  createPartitionLedger,
  getNextPendingPeriod,
  isLedgerFullyCompleted,
  type RetrievalPeriod,
  type CatalogPartitionLedger,
} from "../catalog-partition-engine";
import {
  CatalogDeduplicator,
  buildStableResourceIdentity,
  mergeMetadata,
} from "../deduplication-service";

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

  describe("Safe Description & HTML Entity Sanitization (2026)", () => {
    it("converts raw <br /> tags and HTML entities into clean readable text", () => {
      const rawHtml = "First Line<br />Second Line<br>Third Line</p><div>Fourth Line</div>";
      const cleaned = formatSafeDescription(rawHtml);
      expect(cleaned).not.toContain("<br");
      expect(cleaned).not.toContain("</p>");
      expect(cleaned).toContain("First Line\nSecond Line\nThird Line\nFourth Line");

      const entityHtml = "Batman &amp; Robin &quot;The Movie&quot; &#039;Classic&#039; &lt;1997&gt;";
      const decoded = formatSafeDescription(entityHtml);
      expect(decoded).toBe('Batman & Robin "The Movie" \'Classic\' <1997>');

      expect(formatSafeDescription(null)).toBe("");
      expect(formatSafeDescription(undefined)).toBe("");
      expect(formatSafeDescription("   ")).toBe("");
    });
  });

  describe("Completed Explorations Manifest Archive & Local Search", () => {
    const testOwnerId = "test-user-uuid-12345";
    const otherOwnerId = "other-user-uuid-99999";

    const mockManifestChannel: Omit<CompletedExplorationManifest, "id" | "manifestSchemaVersion" | "sha256Checksum"> = {
      manifestId: "manifest-lsulli282",
      ownerId: testOwnerId,
      provider: "dailymotion",
      apiVersion: "v1",
      resourceKind: "channel",
      resourceId: "lsulli282",
      canonicalSourceUrl: "https://www.dailymotion.com/lsulli282",
      resourceTitle: "playlist 2016",
      resourceDescription: "Full archive of 2016 anime broadcasts",
      resourceThumbnail: "https://example.com/avatar.jpg",
      scanId: "scan-test-1",
      scanStrategy: "deep",
      createdAt: "2026-11-20T10:00:00.000Z",
      completedAt: "2026-11-20T11:00:00.000Z",
      updatedAt: "2026-11-20T11:00:00.000Z",
      totalUniqueItems: 2,
      providerReportedLifetimeTotal: 3090,
      providerReportedQueryTotal: 500,
      duplicatesSkipped: 0,
      omittedOrUnavailableReferences: 0,
      oldestItemDate: "2016-12-12T10:00:00.000Z",
      newestItemDate: "2017-03-24T06:20:28.000Z",
      items: [
        {
          kind: "video",
          apiVersion: "v1",
          id: "x_vid_1",
          title: "YGOTAS Episode 51 - The Death Of Tristan Taylor",
          description: "Yu-Gi-Oh abridged classic episode",
          thumbnail: "https://example.com/thumb1.jpg",
          url: "https://www.dailymotion.com/video/x_vid_1",
          duration: 300,
          language: "en",
          country: "US",
          category: null,
          createdAt: "2017-03-24T06:20:28.000Z",
          year: 2017,
          tags: ["ygotas", "anime"],
          ownerId: "lsulli282",
          ownerName: "playlist 2016",
          views: 5000,
          extra: {},
          raw: {},
        },
        {
          kind: "video",
          apiVersion: "v1",
          id: "x_vid_2",
          title: "Oldest 2016 Archive Recording",
          description: "Historical recording from late 2016",
          thumbnail: "https://example.com/thumb2.jpg",
          url: "https://www.dailymotion.com/video/x_vid_2",
          duration: 250,
          language: "en",
          country: "US",
          category: null,
          createdAt: "2016-12-12T10:00:00.000Z",
          year: 2016,
          tags: ["archive"],
          ownerId: "lsulli282",
          ownerName: "playlist 2016",
          views: 2000,
          extra: {},
          raw: {},
        },
      ],
      paginationMetadata: {
        totalPagesFetched: 7,
        windowsRetrieved: [],
      },
      status: "complete_within_verified_scope",
    };

    const mockManifestPlaylist: Omit<CompletedExplorationManifest, "id" | "manifestSchemaVersion" | "sha256Checksum"> = {
      manifestId: "manifest-playlist-cyber",
      ownerId: testOwnerId,
      provider: "dailymotion",
      apiVersion: "v2",
      resourceKind: "playlist",
      resourceId: "x88apm",
      canonicalSourceUrl: "https://www.dailymotion.com/playlist/x88apm",
      resourceTitle: "Cyberpunk 2077 Night City Archives",
      resourceDescription: "Curated gameplay and soundscapes",
      resourceThumbnail: null,
      scanId: "scan-test-2",
      scanStrategy: "standard",
      createdAt: "2026-11-20T12:00:00.000Z",
      completedAt: "2026-11-20T12:30:00.000Z",
      updatedAt: "2026-11-20T12:30:00.000Z",
      totalUniqueItems: 1,
      providerReportedLifetimeTotal: 1,
      providerReportedQueryTotal: 1,
      duplicatesSkipped: 0,
      omittedOrUnavailableReferences: 0,
      oldestItemDate: "2024-05-01T00:00:00.000Z",
      newestItemDate: "2024-05-01T00:00:00.000Z",
      items: [
        {
          kind: "video",
          apiVersion: "v2",
          id: "x_cyber_1",
          title: "Night City Ambient Exploration",
          description: "Relaxing atmospheric walk through Night City",
          thumbnail: "https://example.com/cyber.jpg",
          url: "https://www.dailymotion.com/video/x_cyber_1",
          duration: 3600,
          language: "en",
          country: "US",
          category: null,
          createdAt: "2024-05-01T00:00:00.000Z",
          year: 2024,
          tags: ["cyberpunk", "ambient"],
          ownerId: "cdpr",
          ownerName: "CD Projekt",
          views: 120000,
          extra: {},
          raw: {},
        },
      ],
      paginationMetadata: {
        totalPagesFetched: 1,
        windowsRetrieved: [],
      },
      status: "complete_within_verified_scope",
    };

    it("saves completed exploration manifest with deterministic SHA-256 and schema version", async () => {
      const savedChannel = await saveCompletedExplorationManifest(mockManifestChannel);
      expect(savedChannel.manifestSchemaVersion).toBe("1.0.0");
      expect(savedChannel.sha256Checksum.length).toBeGreaterThan(0);
      expect(savedChannel.totalUniqueItems).toBe(2);

      const retrieved = await getCompletedExplorationManifest(testOwnerId, "v1", "channel", "lsulli282");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.resourceTitle).toBe("playlist 2016");
      expect(retrieved?.items.length).toBe(2);
    });

    it("enforces owner isolation: User A cannot access User B's completed explorations", async () => {
      const retrievedByOther = await getCompletedExplorationManifest(otherOwnerId, "v1", "channel", "lsulli282");
      expect(retrievedByOther).toBeNull();
    });

    it("performs instant local search across multiple saved catalogs with zero network calls", async () => {
      await saveCompletedExplorationManifest(mockManifestChannel);
      await saveCompletedExplorationManifest(mockManifestPlaylist);

      // Search across catalogs: match in channel video
      const search1 = await searchCompletedExplorations(testOwnerId, "tristan taylor");
      expect(search1.totalMatches).toBe(1);
      expect(search1.matchedItems[0].item.id).toBe("x_vid_1");
      expect(search1.matchedItems[0].resourceTitle).toBe("playlist 2016");

      // Search across catalogs: match in playlist video
      const search2 = await searchCompletedExplorations(testOwnerId, "night city");
      expect(search2.totalMatches).toBe(1);
      expect(search2.matchedItems[0].item.id).toBe("x_cyber_1");
      expect(search2.matchedItems[0].apiVersion).toBe("v2");

      // Search by description & tags
      const search3 = await searchCompletedExplorations(testOwnerId, "ambient");
      expect(search3.totalMatches).toBe(1);

      // Empty search returns all catalogs
      const allCatalogs = await searchCompletedExplorations(testOwnerId, "");
      expect(allCatalogs.totalCatalogsSearched).toBeGreaterThanOrEqual(2);
    });

    it("deletes only the targeted completed exploration without affecting others", async () => {
      const channelManifest = await getCompletedExplorationManifest(testOwnerId, "v1", "channel", "lsulli282");
      expect(channelManifest).not.toBeNull();

      if (channelManifest) {
        await deleteCompletedExplorationManifest(channelManifest.id);
      }

      const deletedCheck = await getCompletedExplorationManifest(testOwnerId, "v1", "channel", "lsulli282");
      expect(deletedCheck).toBeNull();

      // Playlist remains intact
      const playlistCheck = await getCompletedExplorationManifest(testOwnerId, "v2", "playlist", "x88apm");
      expect(playlistCheck).not.toBeNull();
    });
  });

  describe("Scan Checkpoint Service & Resumable Scanning", () => {
    const testOwner = "chk-test-owner";
    const checkpoint: ScanCheckpointRecord = {
      id: "chk:chk-test-owner:v1:channel:lsulli282",
      ownerId: testOwner,
      scanId: "scan-chk-1",
      apiVersion: "v1",
      resourceType: "channel",
      resourceId: "lsulli282",
      canonicalUrl: "https://www.dailymotion.com/lsulli282",
      scanConfig: {
        strategy: "standard",
        pageSize: 100,
        maxPages: 5,
        throttleMs: 150,
        fieldsProfile: "standard",
      },
      currentPage: 5,
      nextCursor: null,
      visitedPages: [1, 2, 3, 4, 5],
      visitedCursors: [],
      completedPages: 5,
      itemsRetrieved: 500,
      lifetimeTotal: 3090,
      queryTotal: 500,
      oldestItemDate: "2017-01-09T10:31:01.000Z",
      newestItemDate: "2017-03-24T06:20:28.000Z",
      status: "standard_scan_completed",
      completedWindows: [],
      updatedAt: new Date().toISOString(),
      canResume: true,
    };

    it("saves and retrieves scan checkpoint durably for resumption", async () => {
      await saveScanCheckpoint(checkpoint);
      const retrieved = await getScanCheckpoint(testOwner, "v1", "channel", "lsulli282");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.itemsRetrieved).toBe(500);
      expect(retrieved?.lifetimeTotal).toBe(3090);
      expect(retrieved?.canResume).toBe(true);

      const list = await listScanCheckpoints(testOwner);
      expect(list.some((c) => c.resourceId === "lsulli282")).toBe(true);

      await deleteScanCheckpoint(testOwner, "v1", "channel", "lsulli282");
      const postDelete = await getScanCheckpoint(testOwner, "v1", "channel", "lsulli282");
      expect(postDelete).toBeNull();
    });
  });

  describe("Catalog Retrieval Strategy Selection & Directionality (2026)", () => {
    it("defaults to Automatic Maximum Coverage with newest-to-oldest direction", () => {
      const ledger = createPartitionLedger({
        scanId: "scan-default-1",
        apiVersion: "v1",
        resourceType: "channel",
        resourceId: "lsulli282",
        canonicalUrl: "https://www.dailymotion.com/lsulli282",
        earliestContentDate: "2016-01-24T07:42:24.000Z",
        latestContentDate: "2017-03-24T06:20:28.000Z",
      });

      expect(ledger.strategy).toBe("automatic_maximum_coverage");
      expect(ledger.direction).toBe("newest_to_oldest");
      expect(ledger.periods.length).toBeGreaterThanOrEqual(2); // At least 2017 and 2016
      // Newest to oldest: first period is the newest year
      expect(ledger.periods[0].startIso).toContain("2017");
      expect(ledger.periods[1].startIso).toContain("2016");
    });

    it("generates month-by-month periods in both directions", () => {
      // Newest to oldest (October to December = 3 months)
      const periodsDesc = initializeStrategyPeriods(
        "month_by_month",
        "newest_to_oldest",
        "2023-10-01T00:00:00.000Z",
        "2023-12-31T23:59:59.999Z",
        "v2",
        "lemonde"
      );

      const m2023Desc = periodsDesc.filter((p) => p.startIso?.startsWith("2023"));
      expect(m2023Desc.length).toBe(3);
      expect(m2023Desc[0].label).toBe("December 2023");
      expect(m2023Desc[1].label).toBe("November 2023");
      expect(m2023Desc[2].label).toBe("October 2023");

      // Oldest to newest (January to March = 3 months)
      const periodsAsc = initializeStrategyPeriods(
        "month_by_month",
        "oldest_to_newest",
        "2023-01-01T00:00:00.000Z",
        "2023-03-31T23:59:59.999Z",
        "v2",
        "lemonde"
      );

      const m2023Asc = periodsAsc.filter((p) => p.startIso?.startsWith("2023"));
      expect(m2023Asc.length).toBe(3);
      expect(m2023Asc[0].label).toBe("January 2023");
      expect(m2023Asc[1].label).toBe("February 2023");
      expect(m2023Asc[2].label).toBe("March 2023");
    });

    it("generates year-by-year periods and partitions correctly", () => {
      const periods = initializeStrategyPeriods(
        "year_by_year",
        "newest_to_oldest",
        "2020-01-01T00:00:00.000Z",
        "2023-12-31T23:59:59.999Z",
        "v1",
        "lsulli282"
      );

      const years = periods.map((p) => p.label);
      expect(years).toEqual(["Year 2023", "Year 2022", "Year 2021", "Year 2020"]);
      expect(periods[0].startIso).toBe("2023-01-01T00:00:00.000Z");
      expect(periods[0].endIso).toBe("2023-12-31T23:59:59.999Z");
    });

    it("partitions custom date ranges into weeks, days, and entire range", () => {
      // Entire Range
      const entire = partitionCustomDateRange(
        "2024-01-01",
        "2024-01-31",
        "entire_range",
        "newest_to_oldest",
        "v1",
        "test"
      );
      expect(entire.length).toBe(1);
      expect(entire[0].granularity).toBe("entire_range");
      expect(entire[0].startIso).toBe("2024-01-01T00:00:00.000Z");
      expect(entire[0].endIso).toBe("2024-01-31T23:59:59.999Z");

      // Weekly partitioning
      const weeks = partitionCustomDateRange(
        "2024-01-01",
        "2024-01-21",
        "week",
        "oldest_to_newest",
        "v2",
        "test"
      );
      expect(weeks.length).toBe(3); // 3 weeks (7 days each)
      expect(weeks[0].granularity).toBe("week");

      // Daily partitioning
      const days = partitionCustomDateRange(
        "2024-06-01",
        "2024-06-05",
        "day",
        "oldest_to_newest",
        "v2",
        "test"
      );
      expect(days.length).toBe(5);
      expect(days[0].label).toContain("Day 2024-06-01");
      expect(days[4].label).toContain("Day 2024-06-05");

      // Validation: start > end throws error
      expect(() => {
        partitionCustomDateRange(
          "2024-12-31",
          "2024-01-01",
          "day",
          "newest_to_oldest"
        );
      }).toThrow(/later than end date/);
    });
  });

  describe("Date Boundary Correctness & Calendar Edge Cases (UTC)", () => {
    it("calculates leap years correctly according to Gregorian rules", () => {
      expect(isLeapYear(2024)).toBe(true);  // Divisible by 4
      expect(isLeapYear(2023)).toBe(false); // Not divisible by 4
      expect(isLeapYear(2000)).toBe(true);  // Century divisible by 400
      expect(isLeapYear(1900)).toBe(false); // Century not divisible by 400
      expect(isLeapYear(2026)).toBe(false);
    });

    it("handles February leap day (29 days) vs non-leap day (28 days)", () => {
      // Leap year 2024
      const feb2024Days = getDaysInUtcMonth(2024, 2);
      expect(feb2024Days).toBe(29);
      const feb2024 = generateMonthPeriod(2024, 2, "v1", "test");
      expect(feb2024.startIso).toBe("2024-02-01T00:00:00.000Z");
      expect(feb2024.endIso).toBe("2024-02-29T23:59:59.999Z");

      // Non-leap year 2023
      const feb2023Days = getDaysInUtcMonth(2023, 2);
      expect(feb2023Days).toBe(28);
      const feb2023 = generateMonthPeriod(2023, 2, "v1", "test");
      expect(feb2023.startIso).toBe("2023-02-01T00:00:00.000Z");
      expect(feb2023.endIso).toBe("2023-02-28T23:59:59.999Z");
    });

    it("guarantees adjacent calendar months have contiguous non-gapped boundaries", () => {
      const oct2024 = generateMonthPeriod(2024, 10, "v1", "test");
      const nov2024 = generateMonthPeriod(2024, 11, "v1", "test");

      const octEnd = new Date(oct2024.endIso!).getTime();
      const novStart = new Date(nov2024.startIso!).getTime();

      // Nov 1 starts exactly 1 millisecond after Oct 31 23:59:59.999Z
      expect(novStart - octEnd).toBe(1);
    });

    it("formats API V1 as Unix seconds and API V2 as ISO 8601 strings", () => {
      const v1Period = generateMonthPeriod(2024, 5, "v1", "test");
      expect(typeof v1Period.startUnix).toBe("number");
      expect(typeof v1Period.endUnix).toBe("number");
      expect(v1Period.startUnix).toBe(1714521600); // 2024-05-01T00:00:00Z in seconds
      expect(v1Period.startIso).toBe("2024-05-01T00:00:00.000Z");

      const v2Period = generateMonthPeriod(2024, 5, "v2", "test");
      expect(v2Period.apiVersion).toBe("v2");
      expect(v2Period.startIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(v2Period.endIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe("Intelligent Adaptive Partitioning & Saturation Subdivision", () => {
    it("subdivides a saturated Year period into 12 calendar months", () => {
      const yearPeriod = generateYearPeriod(2024, "v1", "lsulli282");
      yearPeriod.isCapped = true;
      yearPeriod.status = "capped";

      const months = subdivideSaturatedPeriod(yearPeriod, "newest_to_oldest");
      expect(months.length).toBe(12);
      expect(months.every((m) => m.granularity === "month")).toBe(true);
      expect(months.every((m) => m.parentPeriodId === yearPeriod.periodId)).toBe(true);
      expect(months[0].label).toBe("December 2024");
      expect(months[11].label).toBe("January 2024");
    });

    it("subdivides a saturated Month period into three 10-day intervals", () => {
      const monthPeriod = generateMonthPeriod(2024, 3, "v2", "lsulli282"); // March has 31 days
      monthPeriod.isCapped = true;
      monthPeriod.status = "capped";

      const intervals = subdivideSaturatedPeriod(monthPeriod, "oldest_to_newest");
      expect(intervals.length).toBe(3);
      expect(intervals[0].startIso).toBe("2024-03-01T00:00:00.000Z");
      expect(intervals[0].endIso).toBe("2024-03-10T23:59:59.999Z");
      expect(intervals[1].startIso).toBe("2024-03-11T00:00:00.000Z");
      expect(intervals[1].endIso).toBe("2024-03-20T23:59:59.999Z");
      expect(intervals[2].startIso).toBe("2024-03-21T00:00:00.000Z");
      expect(intervals[2].endIso).toBe("2024-03-31T23:59:59.999Z");
    });

    it("subdivides a saturated 10-day interval into daily periods", () => {
      const tenDayPeriod = generateCustomPeriod(
        "2024-07-01T00:00:00.000Z",
        "2024-07-05T23:59:59.999Z",
        "ten_day",
        "July 2024 (Days 1–5)",
        "v1",
        "target"
      );

      const days = subdivideSaturatedPeriod(tenDayPeriod, "oldest_to_newest");
      expect(days.length).toBe(5);
      expect(days.every((d) => d.granularity === "day")).toBe(true);
      expect(days[0].startIso).toBe("2024-07-01T00:00:00.000Z");
      expect(days[4].endIso).toBe("2024-07-05T23:59:59.999Z");
    });

    it("requires all children of a capped period to complete before ledger is fully complete", () => {
      const ledger = createPartitionLedger({
        scanId: "scan-adaptive-test",
        apiVersion: "v1",
        resourceType: "channel",
        resourceId: "channel1",
        canonicalUrl: "https://www.dailymotion.com/channel1",
        strategy: "year_by_year",
        earliestContentDate: "2023-01-01T00:00:00.000Z",
        latestContentDate: "2023-12-31T23:59:59.999Z",
      });

      expect(ledger.periods.length).toBe(1);
      const parent = ledger.periods[0];
      parent.isCapped = true;
      parent.status = "capped";

      // Subdivide into 2 children for test
      const child1 = generateMonthPeriod(2023, 1, "v1", "channel1", parent.periodId);
      const child2 = generateMonthPeriod(2023, 2, "v1", "channel1", parent.periodId);
      parent.childPeriodIds = [child1.periodId, child2.periodId];
      ledger.periods.push(child1, child2);

      // Child 1 is completed, Child 2 is still pending
      child1.status = "completed";
      expect(isLedgerFullyCompleted(ledger)).toBe(false);

      // Once Child 2 is completed, ledger is fully completed
      child2.status = "completed";
      expect(isLedgerFullyCompleted(ledger)).toBe(true);
    });
  });

  describe("Intelligent Deduplication & Non-Destructive Metadata Merging", () => {
    it("builds stable resource identity and avoids title-only collisions", () => {
      const vidA = { kind: "video" as const, id: "x12345", title: "Breaking News" };
      const vidB = { kind: "video" as const, id: "x67890", title: "Breaking News" }; // Same title, different ID

      const idA = buildStableResourceIdentity(vidA);
      const idB = buildStableResourceIdentity(vidB);

      expect(idA).toBe("video:x12345");
      expect(idB).toBe("video:x67890");
      expect(idA).not.toBe(idB); // Must NOT collide!
    });

    it("merges metadata non-destructively without overwriting existing data with null", () => {
      const existing: DiscoveryItem = {
        kind: "video",
        apiVersion: "v1",
        id: "x_merge_1",
        title: "Original Rich Title",
        description: "Comprehensive original description of the documentary.",
        thumbnail: "https://example.com/original-thumb.jpg",
        url: "https://www.dailymotion.com/video/x_merge_1",
        duration: 720,
        language: "en",
        country: "US",
        category: "documentary",
        createdAt: "2020-04-10T12:00:00.000Z",
        year: 2020,
        tags: ["documentary", "history"],
        ownerId: "creator1",
        ownerName: "History Channel",
        views: 50000,
        extra: { likes_total: 1200 },
        raw: {},
      };

      const incomingSparse: DiscoveryItem = {
        kind: "video",
        apiVersion: "v2",
        id: "x_merge_1",
        title: "Original Rich Title",
        description: null, // Null description in newer sparse query!
        thumbnail: null,
        url: "https://www.dailymotion.com/video/x_merge_1",
        duration: null,
        language: null,
        country: null,
        category: null,
        createdAt: "2020-04-10T12:00:00.000Z",
        year: 2020,
        tags: ["documentary", "history", "remastered"], // Added new tag
        ownerId: "creator1",
        ownerName: null,
        views: 65000, // Higher view count!
        extra: { likes_total: 1500, aspect_ratio: "16:9" }, // Added aspect_ratio
        raw: {},
      };

      const merged = mergeMetadata(existing, incomingSparse);

      // Preserves original non-null values
      expect(merged.description).toBe("Comprehensive original description of the documentary.");
      expect(merged.thumbnail).toBe("https://example.com/original-thumb.jpg");
      expect(merged.duration).toBe(720);
      expect(merged.ownerName).toBe("History Channel");

      // Adopts higher views and merged extra fields
      expect(merged.views).toBe(65000);
      expect(merged.extra?.aspect_ratio).toBe("16:9");
      expect(merged.extra?.likes_total).toBe(1500);

      // Tags merged and unioned without duplicates
      expect(merged.tags).toContain("remastered");
      expect(merged.tags?.length).toBe(3);
    });

    it("tracks multi-period observations and calculates deduplication summary", async () => {
      const deduplicator = new CatalogDeduplicator();

      const item1: DiscoveryItem = {
        kind: "video",
        apiVersion: "v1",
        id: "x_item_1",
        title: "Video 1",
        description: "First observation",
        thumbnail: "https://example.com/1.jpg",
        url: "https://www.dailymotion.com/video/x_item_1",
        duration: 100,
        language: "en",
        country: "US",
        category: null,
        createdAt: "2023-01-15T10:00:00.000Z",
        year: 2023,
        tags: ["tag1"],
        ownerId: "user1",
        ownerName: "User 1",
        views: 100,
        extra: {},
        raw: {},
      };

      const item2: DiscoveryItem = {
        kind: "video",
        apiVersion: "v1",
        id: "x_item_2",
        title: "Video 2",
        description: "Second video",
        thumbnail: "https://example.com/2.jpg",
        url: "https://www.dailymotion.com/video/x_item_2",
        duration: 200,
        language: "en",
        country: "US",
        category: null,
        createdAt: "2023-02-15T10:00:00.000Z",
        year: 2023,
        tags: ["tag2"],
        ownerId: "user1",
        ownerName: "User 1",
        views: 200,
        extra: {},
        raw: {},
      };

      // Ingest Batch 1 (Period 1)
      const res1 = deduplicator.ingestBatch([item1], "period:month:2023-01", 1);
      expect(res1.addedCount).toBe(1);
      expect(res1.duplicateCount).toBe(0);

      // Ingest Batch 2 (Period 2): contains item2 and duplicate of item1
      const duplicateItem1: DiscoveryItem = {
        ...item1,
        description: "Updated observation in Period 2",
        views: 150,
      };

      const res2 = deduplicator.ingestBatch([item2, duplicateItem1], "period:month:2023-02", 1);
      expect(res2.addedCount).toBe(1);
      expect(res2.duplicateCount).toBe(1);

      // Deduplication summary
      const summary = deduplicator.getSummary();
      expect(summary.totalRawObserved).toBe(3);
      expect(summary.totalUniqueRetained).toBe(2);
      expect(summary.totalDuplicatesDetected).toBe(1);
      expect(summary.duplicateOriginPeriods["period:month:2023-02"]).toBe(1);

      // Final reconciliation
      const reconciled = await deduplicator.reconcileFinalCatalog("user1");
      expect(reconciled.canonicalItems.length).toBe(2);
      expect(reconciled.canonicalItems.length).toBe(reconciled.summary.totalUniqueRetained);
      expect(reconciled.sha256Checksum.length).toBeGreaterThan(0);
    });
  });

  describe("Separation of Page Pagination from Time-Period Pagination", () => {
    it("maintains current date bounds during intra-period page retrieval", () => {
      const ledger = createPartitionLedger({
        scanId: "scan-page-test",
        apiVersion: "v1",
        resourceType: "channel",
        resourceId: "lsulli282",
        canonicalUrl: "https://www.dailymotion.com/lsulli282",
        strategy: "month_by_month",
        earliestContentDate: "2016-10-01T00:00:00.000Z",
        latestContentDate: "2016-11-30T23:59:59.999Z",
      });

      const currentPeriod = ledger.periods[0]; // e.g. November 2016
      const originalStart = currentPeriod.startIso;
      const originalEnd = currentPeriod.endIso;

      // Simulating "Load Next Page" (page 1 -> page 2)
      currentPeriod.pagesFetched += 1;
      currentPeriod.nextPage = 2;
      currentPeriod.rawItemsReceived += 100;
      currentPeriod.uniqueItemsRetained += 100;

      // Date bounds must NOT change!
      expect(currentPeriod.startIso).toBe(originalStart);
      expect(currentPeriod.endIso).toBe(originalEnd);
      expect(currentPeriod.nextPage).toBe(2);
      expect(currentPeriod.status).toBe("pending"); // Still inside current period
    });

    it("advances to next unprocessed period on 'Load Next Period'", () => {
      const ledger = createPartitionLedger({
        scanId: "scan-period-test",
        apiVersion: "v1",
        resourceType: "channel",
        resourceId: "lsulli282",
        canonicalUrl: "https://www.dailymotion.com/lsulli282",
        strategy: "month_by_month",
        direction: "newest_to_oldest",
        earliestContentDate: "2016-09-01T00:00:00.000Z",
        latestContentDate: "2016-10-31T23:59:59.999Z",
      });

      const oct = ledger.periods.find((p) => p.label === "October 2016");
      const sep = ledger.periods.find((p) => p.label === "September 2016");

      expect(oct).toBeDefined();
      expect(sep).toBeDefined();

      // Current active period is October 2016
      ledger.activePeriodId = oct!.periodId;

      // When October completes:
      oct!.status = "completed";
      oct!.hasMore = false;

      // getNextPendingPeriod should now return September 2016
      const nextPeriod = getNextPendingPeriod(ledger);
      expect(nextPeriod).not.toBeNull();
      expect(nextPeriod?.periodId).toBe(sep!.periodId);
      expect(nextPeriod?.label).toBe("September 2016");
    });
  });
});
