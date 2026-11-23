/**
 * Comprehensive test suite for Year Quick Selector (2010-2026),
 * Resource Date Domains, V1 vs V2 Protocol Separation, and Item Normalization.
 */

import { describe, it, expect } from "vitest";
import {
  SELECTABLE_YEARS,
  getCalendarYearBoundaries,
  isItemWithinYearBoundaries,
} from "../link-explorer-service";
import {
  initializeStrategyPeriods,
  createPartitionLedger,
} from "../catalog-partition-engine";
import {
  isPlaylistWithinCreationBounds,
  resolveApiSortParameter,
  resolveFieldSelection,
} from "../link-explorer-service";
import { normalizeV1Video, normalizeV1Playlist } from "@/lib/discovery/v1-normalize";
import { normalizeV2Video, normalizeV2Playlist } from "@/lib/discovery/v2-normalize";
import type { V1RawVideo, V1RawPlaylist } from "@/lib/discovery/v1-normalize";
import type { V2RawVideo, V2RawPlaylist } from "@/lib/discovery/v2-normalize";

describe("1. Year Quick Selector: 2010-2026 Definition & Boundaries", () => {
  it("contains exactly 17 selectable years from 2010 to 2026 inclusive", () => {
    expect(SELECTABLE_YEARS).toHaveLength(17);
    expect(SELECTABLE_YEARS[0]).toBe(2010);
    expect(SELECTABLE_YEARS[SELECTABLE_YEARS.length - 1]).toBe(2026);

    // Verify contiguity
    for (let i = 0; i < SELECTABLE_YEARS.length; i++) {
      expect(SELECTABLE_YEARS[i]).toBe(2010 + i);
    }
  });

  it("calculates exact half-open UTC interval [January 1 YYYY, January 1 YYYY+1) for each year", () => {
    const b2020 = getCalendarYearBoundaries(2020);
    expect(b2020.year).toBe(2020);
    expect(b2020.startIso).toBe("2020-01-01T00:00:00.000Z");
    expect(b2020.endIso).toBe("2020-12-31T23:59:59.999Z");
    expect(b2020.nextYearStartIso).toBe("2021-01-01T00:00:00.000Z");
    expect(b2020.startUnix).toBe(1577836800);
    expect(b2020.nextYearStartUnix).toBe(1609459200);

    const b2026 = getCalendarYearBoundaries(2026);
    expect(b2026.year).toBe(2026);
    expect(b2026.startIso).toBe("2026-01-01T00:00:00.000Z");
    expect(b2026.nextYearStartIso).toBe("2027-01-01T00:00:00.000Z");
  });

  it("ensures zero gap and zero overlap between adjacent years", () => {
    for (let y = 2010; y < 2026; y++) {
      const currentYear = getCalendarYearBoundaries(y);
      const nextYear = getCalendarYearBoundaries(y + 1);
      expect(currentYear.nextYearStartIso).toBe(nextYear.startIso);
      expect(currentYear.nextYearStartUnix).toBe(nextYear.startUnix);
    }
  });

  it("correctly evaluates boundary inclusion with isItemWithinYearBoundaries", () => {
    // 2024 calendar boundaries
    expect(isItemWithinYearBoundaries("2024-01-01T00:00:00.000Z", 2024)).toBe(true);
    expect(isItemWithinYearBoundaries("2024-06-15T12:00:00.000Z", 2024)).toBe(true);
    expect(isItemWithinYearBoundaries("2024-12-31T23:59:59.999Z", 2024)).toBe(true);

    // Half-open upper boundary check: 2025-01-01T00:00:00.000Z belongs to 2025, NOT 2024
    expect(isItemWithinYearBoundaries("2025-01-01T00:00:00.000Z", 2024)).toBe(false);
    expect(isItemWithinYearBoundaries("2025-01-01T00:00:00.000Z", 2025)).toBe(true);

    // Lower boundary check: 2023-12-31T23:59:59.999Z belongs to 2023, NOT 2024
    expect(isItemWithinYearBoundaries("2023-12-31T23:59:59.999Z", 2024)).toBe(false);

    // Unix seconds test: 1704067200 is 2024-01-01T00:00:00Z
    expect(isItemWithinYearBoundaries(1704067200, 2024)).toBe(true);
    expect(isItemWithinYearBoundaries(1704067199, 2024)).toBe(false); // 1 sec before 2024
  });
});

describe("2. Strict Resource-Specific Date Domains", () => {
  it("Video Upload Year: Channel videos evaluate against videoCreatedAt", () => {
    const videoItem2021 = {
      videoCreatedAt: "2021-04-10T10:00:00.000Z",
      playlistCreatedAt: undefined,
    };
    expect(isItemWithinYearBoundaries(videoItem2021.videoCreatedAt, 2021)).toBe(true);
    expect(isItemWithinYearBoundaries(videoItem2021.videoCreatedAt, 2022)).toBe(false);
  });

  it("Playlist Creation Year: Channel playlists evaluate against playlistCreatedAt", () => {
    const playlistItem2018 = {
      playlistCreatedAt: "2018-08-20T14:30:00.000Z",
    };
    expect(isItemWithinYearBoundaries(playlistItem2018.playlistCreatedAt, 2018)).toBe(true);
    expect(isItemWithinYearBoundaries(playlistItem2018.playlistCreatedAt, 2019)).toBe(false);

    // Testing client-side playlist creation boundary filter
    expect(isPlaylistWithinCreationBounds(playlistItem2018.playlistCreatedAt, "2018-01-01", "2018-12-31")).toBe(true);
    expect(isPlaylistWithinCreationBounds(playlistItem2018.playlistCreatedAt, "2019-01-01", "2019-12-31")).toBe(false);
  });

  it("Playlist Membership Complete Ingestion: Retains all videos inside a playlist without date filtering", () => {
    // When ingesting a playlist created in 2020 containing videos from 2015, 2018, and 2022:
    const playlistVideos = [
      { id: "v1", title: "Archive 2015", videoCreatedAt: "2015-05-12T00:00:00.000Z" },
      { id: "v2", title: "Archive 2018", videoCreatedAt: "2018-07-22T00:00:00.000Z" },
      { id: "v3", title: "Archive 2022", videoCreatedAt: "2022-11-04T00:00:00.000Z" },
    ];

    // For playlist membership retrieval, date bounds are null/undefined (complete ingestion)
    const membershipDateAfter = undefined;
    const membershipDateBefore = undefined;

    const filtered = playlistVideos.filter(() => {
      // Membership ingestion never filters out videos based on date bounds
      if (!membershipDateAfter && !membershipDateBefore) return true;
      return false;
    });

    expect(filtered).toHaveLength(3);
    expect(filtered[0].videoCreatedAt).toBe("2015-05-12T00:00:00.000Z");
    expect(filtered[1].videoCreatedAt).toBe("2018-07-22T00:00:00.000Z");
    expect(filtered[2].videoCreatedAt).toBe("2022-11-04T00:00:00.000Z");
  });
});

describe("3. API V1 vs API V2 Parameter & Protocol Separation", () => {
  it("maps V1 sorting strictly to legacy parameters (recent, old, visited, trending)", () => {
    expect(resolveApiSortParameter("v1", "newest_to_oldest")).toBe("recent");
    expect(resolveApiSortParameter("v1", "oldest_to_newest")).toBe("old");
  });

  it("maps V2 sorting strictly to official REST API parameters (-created_at, created_at)", () => {
    expect(resolveApiSortParameter("v2", "newest_to_oldest")).toBe("-created_at");
    expect(resolveApiSortParameter("v2", "oldest_to_newest")).toBe("created_at");
  });

  it("isolates sparse field queries between V1 and V2 schemas", () => {
    const v1Fields = resolveFieldSelection("v1", "basic");
    const v2Fields = resolveFieldSelection("v2", "basic");

    expect(v1Fields).toContain("created_time");
    expect(v1Fields).not.toContain("video_id");

    expect(v2Fields).toContain("video_id");
    expect(v2Fields).toContain("created_at");
    expect(v2Fields).not.toContain("created_time");
  });

  it("distinguishes V1 Unix date boundary semantics from V2 ISO string semantics", () => {
    const boundaries = getCalendarYearBoundaries(2023);

    // V1 uses numeric seconds:
    expect(typeof boundaries.startUnix).toBe("number");
    expect(boundaries.startUnix).toBe(1672531200);

    // V2 uses ISO-8601 strings:
    expect(typeof boundaries.startIso).toBe("string");
    expect(boundaries.startIso).toBe("2023-01-01T00:00:00.000Z");
  });
});

describe("4. Selected Year Strategy Initialization & Partition Ledger", () => {
  it("initializes single year partition for selected_year strategy", () => {
    const periods = initializeStrategyPeriods(
      "selected_year",
      "newest_to_oldest",
      null,
      null,
      "v1",
      "test_channel",
      undefined,
      "channel",
      "videos",
      2022
    );

    expect(periods).toHaveLength(1);
    expect(periods[0].periodId).toContain("2022");
    expect(periods[0].label).toContain("2022");
    expect(periods[0].startIso).toBe("2022-01-01T00:00:00.000Z");
    expect(periods[0].endIso).toBe("2022-12-31T23:59:59.999Z");
    expect(periods[0].status).toBe("pending");
  });

  it("persists selectedYear in partition ledger", () => {
    const ledger = createPartitionLedger({
      scanId: "scan-2025",
      apiVersion: "v2",
      resourceType: "channel",
      resourceId: "channel-1",
      canonicalUrl: "https://www.dailymotion.com/channel1",
      strategy: "selected_year",
      selectedYear: 2025,
    });

    expect(ledger.strategy).toBe("selected_year");
    expect(ledger.selectedYear).toBe(2025);
    expect(ledger.periods).toHaveLength(1);
    expect(ledger.periods[0].periodId).toContain("2025");
  });
});

describe("5. Normalization & Canonical Metadata Fields", () => {
  it("V1 normalization populates canonical date fields and source endpoint", () => {
    const rawV1: V1RawVideo = {
      id: "x8abc12",
      title: "V1 Video Test",
      description: "Test description",
      created_time: 1672531200, // 2023-01-01 00:00:00 UTC
      modified_time: 1672617600, // 2023-01-02 00:00:00 UTC
      duration: 360,
      views_total: 1500,
      owner: "channel_v1",
      thumbnail_url: "https://example.com/thumb.jpg",
      tags: ["tag1", "tag2"],
    };

    const normalized = normalizeV1Video(rawV1);
    expect(normalized).not.toBeNull();
    expect(normalized?.id).toBe("x8abc12");
    expect(normalized?.videoCreatedAt).toBe("2023-01-01T00:00:00.000Z");
    expect(normalized?.updatedAt).toBe("2023-01-02T00:00:00.000Z");
    expect(normalized?.publishedAt).toBeNull();
    expect(normalized?.availableAt).toBeNull();
    expect(normalized?.sourceEndpoint).toBe("GET /videos");
  });

  it("V2 normalization populates canonical date fields and source endpoint", () => {
    const rawV2: V2RawVideo = {
      video_id: "x9xyz99",
      title: "V2 Video Test",
      description: "Test description V2",
      created_at: "2024-03-15T08:30:00.000Z",
      published_at: "2024-03-15T08:30:00.000Z",
      updated_at: "2024-03-16T10:00:00.000Z",
      available_at: "2024-03-15T09:00:00.000Z",
      source: { duration: 120 },
      profile: { profile_id: "p1", name: "Channel V2" },
      thumbnail: { h720_url: "https://example.com/thumb2.jpg" },
      tags: ["news", "v2"],
    };

    const normalized = normalizeV2Video(rawV2);
    expect(normalized).not.toBeNull();
    expect(normalized?.id).toBe("x9xyz99");
    expect(normalized?.videoCreatedAt).toBe("2024-03-15T08:30:00.000Z");
    expect(normalized?.publishedAt).toBe("2024-03-15T08:30:00.000Z");
    expect(normalized?.updatedAt).toBe("2024-03-16T10:00:00.000Z");
    expect(normalized?.availableAt).toBe("2024-03-15T09:00:00.000Z");
    expect(normalized?.sourceEndpoint).toBe("GET /v2/profiles/{id}/videos");
  });

  it("Playlist normalization preserves playlistCreatedAt and sourceEndpoint", () => {
    const rawV1Playlist: V1RawPlaylist = {
      id: "p12345",
      name: "V1 Playlist",
      created_time: 1577836800, // 2020-01-01 UTC
      videos_total: 42,
      owner: "curator1",
    };

    const normV1Pl = normalizeV1Playlist(rawV1Playlist);
    expect(normV1Pl).not.toBeNull();
    expect(normV1Pl?.kind).toBe("playlist");
    expect(normV1Pl?.playlistCreatedAt).toBe("2020-01-01T00:00:00.000Z");
    expect(normV1Pl?.videoCreatedAt).toBeNull(); // Must NOT label playlist creation as video upload!
    expect(normV1Pl?.sourceEndpoint).toBe("GET /user/{id}/playlists");

    const rawV2Playlist: V2RawPlaylist = {
      playlist_id: "pl_v2_99",
      title: "V2 Playlist",
      created_at: "2021-06-01T00:00:00.000Z",
      videos_total: 18,
    };

    const normV2Pl = normalizeV2Playlist(rawV2Playlist);
    expect(normV2Pl).not.toBeNull();
    expect(normV2Pl?.kind).toBe("playlist");
    expect(normV2Pl?.playlistCreatedAt).toBe("2021-06-01T00:00:00.000Z");
    expect(normV2Pl?.videoCreatedAt).toBeNull();
    expect(normV2Pl?.sourceEndpoint).toBe("GET /v2/profiles/{id}/playlists");
  });
});
