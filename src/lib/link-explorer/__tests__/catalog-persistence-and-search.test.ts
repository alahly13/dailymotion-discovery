import { describe, expect, it } from "vitest";
import type { DiscoveryItem } from "@/lib/discovery/types";
import {
  buildCatalogItemKey,
  persistProgressiveBatch,
  getCatalogItemsForCheckpoint,
  countCatalogItemsForCheckpoint,
  deleteCatalogItemsForCheckpoint,
  consolidateAndFinalizeCatalog,
} from "../catalog-persistence-service";
import {
  normalizeSearchString,
  searchLocalCatalog,
  type LocalCatalogSearchCriteria,
} from "../local-catalog-search-service";
import {
  acquireScanLease,
  releaseScanLease,
  isScanLeaseActive,
  buildQueryFingerprint,
  type ScanCheckpointRecord,
} from "../scan-checkpoint-service";
import { createPartitionLedger } from "../catalog-partition-engine";

describe("Catalog Persistence, Local Search & Concurrency Leases (2026)", () => {
  const createMockItem = (partial: Partial<DiscoveryItem>): DiscoveryItem => ({
    kind: "video",
    apiVersion: "v1",
    id: "mock_id",
    title: "Mock Title",
    description: "Mock Description",
    thumbnail: "https://example.com/thumb.jpg",
    url: "https://www.dailymotion.com/video/mock_id",
    duration: 120,
    language: "en",
    country: "US",
    category: "news",
    createdAt: "2024-01-01T00:00:00.000Z",
    year: 2024,
    tags: [],
    ownerId: "owner_mock",
    ownerName: "Mock Owner",
    views: 1000,
    extra: {},
    raw: {},
    ...partial,
  });

  const sampleItems: DiscoveryItem[] = [
    createMockItem({
      kind: "video",
      id: "x10001",
      title: "أخبار اليوم العاجلة - تغطية خاصة وحصرية",
      description: "نشرة إخبارية مفصلة تتضمن أهم التطورات والأحداث العالمية اليومية.",
      thumbnail: "https://example.com/thumb1.jpg",
      duration: 360,
      views: 125000,
      createdAt: "2024-05-15T14:30:00.000Z",
      apiVersion: "v1",
      tags: ["أخبار", "سياسة", "عالمي"],
      ownerId: "news_channel_ar",
      ownerName: "News Channel Arabic",
    }),
    createMockItem({
      kind: "video",
      id: "x10002",
      title: "Full Match Highlights: Champions Cup Final 2023",
      description: "Watch all goals and dramatic penalties from the grand championship match.",
      thumbnail: "https://example.com/thumb2.jpg",
      duration: 720,
      views: 45000,
      createdAt: "2023-11-20T20:00:00.000Z",
      apiVersion: "v1",
      tags: ["football", "sports", "highlights"],
      ownerId: "sports_daily",
      ownerName: "Sports Daily",
    }),
    createMockItem({
      kind: "video",
      id: "x10003",
      title: "مباراة الكأس: الأهداف الكاملة والملخص",
      description: "شاهد جميع الأهداف المثيرة من مباراة نهائي الكأس لكرة القدم.",
      thumbnail: "https://example.com/thumb3.jpg",
      duration: 180, // Short < 300s
      views: 850, // Under 1k
      createdAt: "2023-11-21T18:00:00.000Z",
      apiVersion: "v1",
      tags: ["رياضة", "كورة", "ملخص"],
      ownerId: "sports_daily",
      ownerName: "Sports Daily",
    }),
    createMockItem({
      kind: "playlist",
      id: "pl999",
      title: "Documentaries Series 2022",
      description: "A comprehensive playlist of nature and wildlife documentaries.",
      thumbnail: "https://example.com/thumb4.jpg",
      duration: 0,
      views: 3200,
      createdAt: "2022-04-10T10:00:00.000Z",
      apiVersion: "v1",
      tags: ["nature", "wildlife", "documentary"],
      ownerId: "planet_earth",
      ownerName: "Planet Earth",
    }),
  ];

  // ============================================================
  // 1. PROGRESSIVE PART-BY-PART PERSISTENCE & METADATA MERGING
  // ============================================================
  describe("Progressive Batch Persistence & Non-Destructive Merging", () => {
    it("builds deterministic primary keys for catalog items", () => {
      const key = buildCatalogItemKey("chk_user123_v1_channel_lsulli282", "video", "x8n8x8");
      expect(key).toBe("chk_user123_v1_channel_lsulli282::video:x8n8x8");
    });

    it("persists batches progressively and merges metadata on overlapping items", async () => {
      const checkpointKey = `test_chk_${Date.now()}`;
      const ownerId = "test_owner";
      const targetResourceId = "lsulli282";

      // Batch 1: item with basic metadata
      const initialItem: DiscoveryItem = createMockItem({
        kind: "video",
        id: "x99901",
        title: "Original Title",
        description: null,
        duration: 120,
        views: 100,
        createdAt: "2024-01-01T00:00:00Z",
        apiVersion: "v1",
        tags: ["initial"],
      });

      const res1 = await persistProgressiveBatch({
        checkpointKey,
        scanId: "scan_1",
        ownerId,
        targetResourceId,
        apiVersion: "v1",
        items: [initialItem],
        page: 1,
      });

      expect(res1.newlyAdded).toBe(1);
      expect(res1.totalStored).toBe(1);

      // Batch 2: same item id with updated richer description and higher views
      const updatedItem: DiscoveryItem = createMockItem({
        kind: "video",
        id: "x99901",
        title: "Original Title",
        description: "Enriched description discovered on a later window or page.",
        duration: 120,
        views: 500, // Higher view count
        createdAt: "2024-01-01T00:00:00Z",
        apiVersion: "v1",
        tags: ["enriched", "hd"],
      });

      const res2 = await persistProgressiveBatch({
        checkpointKey,
        scanId: "scan_1",
        ownerId,
        targetResourceId,
        apiVersion: "v1",
        items: [updatedItem],
        page: 2,
      });

      expect(res2.updated).toBe(1);
      expect(res2.totalStored).toBe(1); // Deduped, count remains 1

      // Verify merged data in database
      const stored = await getCatalogItemsForCheckpoint(checkpointKey);
      expect(stored.length).toBe(1);
      expect(stored[0]?.id).toBe("x99901");
      expect(stored[0]?.description).toBe("Enriched description discovered on a later window or page.");
      expect(stored[0]?.views).toBe(500);

      // Clean up
      await deleteCatalogItemsForCheckpoint(checkpointKey);
      const afterDelete = await countCatalogItemsForCheckpoint(checkpointKey);
      expect(afterDelete).toBe(0);
    });
  });

  // ============================================================
  // 2. LOCAL CATALOG SEARCH SYSTEM & BILINGUAL NORMALIZATION
  // ============================================================
  describe("Local Catalog Search Engine (Zero API Calls)", () => {
    it("normalizes Arabic text (removes Tashkeel, unifies Alef, Taa Marbuta, Alif Maqsura)", () => {
      // With Harakat / Tashkeel
      expect(normalizeSearchString("أَخْبَارٌ")).toBe("اخبار");
      // Different Alef forms: أ إ آ -> ا
      expect(normalizeSearchString("إعلان")).toBe("اعلان");
      expect(normalizeSearchString("آفاق")).toBe("افاق");
      // Taa Marbuta: ة -> ه
      expect(normalizeSearchString("تغطية")).toBe("تغطيه");
      // Alif Maqsura: ى -> ي
      expect(normalizeSearchString("علي")).toBe("علي");
      expect(normalizeSearchString("شاهدوا")).toBe("شاهدوا");
    });

    it("matches Arabic items regardless of diacritics or Alef variation", () => {
      // User types plain "اخبار" without hamza or fatha
      const res = searchLocalCatalog(sampleItems, { query: "اخبار" });
      expect(res.items.length).toBe(1);
      expect(res.items[0]?.id).toBe("x10001");
    });

    it("matches multiple tokens across title, description, and tags", () => {
      const res = searchLocalCatalog(sampleItems, { query: "highlights final" });
      expect(res.items.length).toBe(1);
      expect(res.items[0]?.id).toBe("x10002");
    });

    it("filters items by kind correctly", () => {
      const resVideos = searchLocalCatalog(sampleItems, { kind: "video" });
      expect(resVideos.items.length).toBe(3);

      const resPlaylists = searchLocalCatalog(sampleItems, { kind: "playlist" });
      expect(resPlaylists.items.length).toBe(1);
      expect(resPlaylists.items[0]?.id).toBe("pl999");
    });

    it("filters items by year", () => {
      const res2023 = searchLocalCatalog(sampleItems, { year: 2023 });
      expect(res2023.items.length).toBe(2);

      const res2022 = searchLocalCatalog(sampleItems, { year: 2022 });
      expect(res2022.items.length).toBe(1);
      expect(res2022.items[0]?.id).toBe("pl999");
    });

    it("filters items by duration range", () => {
      // Short: < 300s (x10003 is 180s)
      const resShort = searchLocalCatalog(sampleItems, { durationRange: "short" });
      expect(resShort.items.length).toBe(1);
      expect(resShort.items[0]?.id).toBe("x10003");

      // Medium: 300s - 1200s (x10001 is 360s, x10002 is 720s)
      const resMedium = searchLocalCatalog(sampleItems, { durationRange: "medium" });
      expect(resMedium.items.length).toBe(2);
    });

    it("filters items by view count tier", () => {
      // Over 100k views (x10001 is 125,000)
      const resOver100k = searchLocalCatalog(sampleItems, { viewsRange: "over_100k" });
      expect(resOver100k.items.length).toBe(1);
      expect(resOver100k.items[0]?.id).toBe("x10001");

      // Under 1k views (x10003 is 850)
      const resUnder1k = searchLocalCatalog(sampleItems, { viewsRange: "under_1k" });
      expect(resUnder1k.items.length).toBe(1);
      expect(resUnder1k.items[0]?.id).toBe("x10003");
    });

    it("sorts local items by views_desc and newest", () => {
      const resViews = searchLocalCatalog(sampleItems, { sortBy: "views_desc" });
      expect(resViews.items[0]?.id).toBe("x10001"); // 125k
      expect(resViews.items[1]?.id).toBe("x10002"); // 45k

      const resNewest = searchLocalCatalog(sampleItems, { sortBy: "newest" });
      expect(resNewest.items[0]?.id).toBe("x10001"); // 2024
      expect(resNewest.items[resNewest.items.length - 1]?.id).toBe("pl999"); // 2022
    });
  });

  // ============================================================
  // 3. MULTI-TAB CONCURRENCY LEASE & QUERY FINGERPRINTS
  // ============================================================
  describe("Multi-Tab Concurrency Lease & Query Fingerprinting", () => {
    it("generates deterministic query fingerprints", () => {
      const fp1 = buildQueryFingerprint({
        resourceId: "lsulli282",
        apiVersion: "v1",
        resourceType: "channel",
        strategy: "year_by_year",
        serverSort: "recent",
      });
      const fp2 = buildQueryFingerprint({
        resourceId: "lsulli282",
        apiVersion: "v1",
        resourceType: "channel",
        serverSort: "recent",
        strategy: "year_by_year",
      });
      expect(fp1).toBe(fp2);
    });

    it("enforces multi-tab lease protection", async () => {
      const mockChk: ScanCheckpointRecord = {
        id: "chk_test_lease_1",
        ownerId: "owner_1",
        scanId: "scan_1",
        apiVersion: "v1",
        resourceType: "channel",
        resourceId: "test_channel",
        canonicalUrl: "https://www.dailymotion.com/test_channel",
        targetIdentity: undefined,
        scanConfig: { strategy: "deep", maxPages: 0, pageSize: 100, throttleMs: 0, fieldsProfile: "standard" },
        currentPage: 1,
        nextCursor: null,
        visitedPages: [1],
        visitedCursors: [],
        completedPages: 1,
        itemsRetrieved: 100,
        status: "fetching_pages",
        completedWindows: [],
        lifetimeTotal: 1000,
        queryTotal: 100,
        canResume: true,
        updatedAt: new Date().toISOString(),
        leaseOwner: "tab_A",
        leaseExpiresAt: Date.now() + 20_000, // Valid for 20s
      };

      // Tab A holds lease: Tab A checking itself should return not active (can proceed)
      expect(isScanLeaseActive(mockChk, "tab_A")).toBe(false);

      // Tab B checking Tab A's active lease: returns true (blocked!)
      expect(isScanLeaseActive(mockChk, "tab_B")).toBe(true);

      // Expired lease check: should allow Tab B
      mockChk.leaseExpiresAt = Date.now() - 5_000; // Expired 5s ago
      expect(isScanLeaseActive(mockChk, "tab_B")).toBe(false);

      // Tab B acquires lease
      const acquired = await acquireScanLease(mockChk, "tab_B");
      expect(acquired).toBe(true);
      expect(mockChk.leaseOwner).toBe("tab_B");
      expect(mockChk.leaseExpiresAt).toBeGreaterThan(Date.now());

      // Tab B releases lease
      await releaseScanLease(mockChk, "tab_B");
      expect(mockChk.leaseOwner).toBeNull();
      expect(mockChk.leaseExpiresAt).toBeNull();
    });
  });

  // ============================================================
  // 4. CONSOLIDATE AND FINALIZE CATALOG
  // ============================================================
  describe("Consolidate & Finalize Catalog", () => {
    it("consolidates progressive catalog items into a completed manifest with sha256Checksum", async () => {
      const checkpointKey = `chk_finalize_${Date.now()}`;
      const ownerId = "owner_finalize";
      const targetResourceId = "finalize_channel";

      // Seed 2 items into database
      await persistProgressiveBatch({
        checkpointKey,
        scanId: "scan_fin",
        ownerId,
        targetResourceId,
        apiVersion: "v1",
        items: [sampleItems[0]!, sampleItems[1]!],
        page: 1,
      });

      const ledger = createPartitionLedger({
        scanId: "scan_fin",
        apiVersion: "v1",
        resourceType: "channel",
        resourceId: targetResourceId,
        canonicalUrl: "https://www.dailymotion.com/finalize_channel",
        strategy: "automatic_maximum_coverage",
        direction: "newest_to_oldest",
      });

      const manifest = await consolidateAndFinalizeCatalog({
        checkpointKey,
        ownerId,
        apiVersion: "v1",
        resourceKind: "channel",
        resourceId: targetResourceId,
        canonicalSourceUrl: "https://www.dailymotion.com/finalize_channel",
        resourceTitle: "Finalize Channel Title",
        scanId: "scan_fin",
        retrievalLedger: ledger,
        providerReportedLifetimeTotal: 2,
      });

      expect(manifest.manifestId).toContain(targetResourceId);
      expect(manifest.totalUniqueItems).toBe(2);
      expect(manifest.items.length).toBe(2);
      expect(manifest.sha256Checksum).toBeDefined();
      expect(manifest.sha256Checksum.length).toBeGreaterThan(10);
      expect(manifest.status).toBe("complete_within_verified_scope");

      // Verify items removed from in-progress store after finalization
      const remainingItems = await countCatalogItemsForCheckpoint(checkpointKey);
      expect(remainingItems).toBe(0);
    });
  });
});
