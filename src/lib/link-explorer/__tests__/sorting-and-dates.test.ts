import { describe, it, expect, vi } from "vitest";
import {
  resolveApiSortParameter,
  resolveFieldSelection,
  resolveLinkExplorerInput,
} from "../link-explorer-service";
import {
  computeResourceIntelligence,
  type ScanProgressState,
} from "../link-explorer-types";
import {
  initializeStrategyPeriods,
  partitionCustomDateRange,
} from "../catalog-partition-engine";
import type { DiscoveryItem } from "@/lib/discovery/types";

describe("Sorting Parameter Resolution (Section 2)", () => {
  it("maps V2 sorting strictly to official REST API parameters", () => {
    expect(resolveApiSortParameter("v2", "newest_to_oldest", "channel")).toBe("-created_at");
    expect(resolveApiSortParameter("v2", "oldest_to_newest", "channel")).toBe("created_at");
    expect(resolveApiSortParameter("v2", "newest_to_oldest", "playlist")).toBe("-created_at");
    expect(resolveApiSortParameter("v2", "oldest_to_newest", "playlist")).toBe("created_at");
  });

  it("maps V1 sorting strictly to legacy parameters", () => {
    expect(resolveApiSortParameter("v1", "newest_to_oldest", "channel")).toBe("recent");
    expect(resolveApiSortParameter("v1", "oldest_to_newest", "channel")).toBe("old");
    expect(resolveApiSortParameter("v1", "newest_to_oldest", "playlist")).toBe("recent");
    expect(resolveApiSortParameter("v1", "oldest_to_newest", "playlist")).toBe("old");
  });

  it("defaults to newest_to_oldest when direction is omitted", () => {
    expect(resolveApiSortParameter("v2", undefined)).toBe("-created_at");
    expect(resolveApiSortParameter("v1", undefined)).toBe("recent");
  });
});

describe("Real Historical Date Discovery (Section 3)", () => {
  it("discovers only real years present in retrieved items without inventing dummy years", () => {
    // Simulating the LittleKuriboh channel from the user's screenshot (2016-2017 items only)
    const mockItems = [
      {
        id: "x5fz41v",
        title: "YGOTAS Episode 51 - The Death Of Tristan Taylor",
        kind: "video",
        apiVersion: "v1",
        createdAt: "2017-03-24T12:00:00.000Z",
      },
      {
        id: "x537a8p",
        title: "Top 50 Songs Of The Week - May 21, 2016",
        kind: "video",
        apiVersion: "v1",
        createdAt: "2016-11-23T15:00:00.000Z",
      },
    ] as unknown as DiscoveryItem[];

    const intelligence = computeResourceIntelligence(
      mockItems,
      mockItems[0],
      "v1",
      {
        kind: "channel",
        identifier: "lsulli282",
        canonicalUrl: "https://www.dailymotion.com/user/lsulli282",
        rawInput: "https://www.dailymotion.com/user/lsulli282",
        apiPathV1: "/user/lsulli282",
        apiPathV2: "/profiles/lsulli282",
        displayLabel: "lsulli282",
        warnings: [],
      }
    );

    // Must strictly only have 2017 and 2016
    const years = intelligence.distribution.byYear.map((y) => y.year);
    expect(years).toEqual([2017, 2016]);
    expect(years).not.toContain(2005);
    expect(years).not.toContain(2015);
    expect(years).not.toContain(2026);

    // Oldest and newest timestamps match real records
    expect(intelligence.chronology.oldestVideo?.id).toBe("x537a8p");
    expect(intelligence.chronology.newestVideo?.id).toBe("x5fz41v");
  });

  it("initializes a single Primary Discovery Window when no dates are known yet instead of 20+ empty year periods", () => {
    const periods = initializeStrategyPeriods(
      "automatic_maximum_coverage",
      "newest_to_oldest",
      null, // earliestDateIso not known yet
      null,
      "v1",
      "lsulli282"
    );

    expect(periods.length).toBe(1);
    expect(periods[0].label).toBe("Primary Discovery Window");
    expect(periods[0].granularity).toBe("entire_range");
  });
});

describe("Playlist Ingestion & Date Semantics (Section 4)", () => {
  it("preserves complete membership ingestion for playlists without artificial date partitioning", () => {
    const periods = initializeStrategyPeriods(
      "automatic_maximum_coverage",
      "newest_to_oldest",
      "2010-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
      "v2",
      "x88apm",
      undefined,
      "playlist" // resourceType is playlist
    );

    expect(periods.length).toBe(1);
    expect(periods[0].label).toBe("Playlist Membership (Complete Ingestion)");
    expect(periods[0].granularity).toBe("entire_range");
  });

  it("sets membership notice acknowledging that Dailymotion API does not expose membership-added timestamps", () => {
    const mockPlaylistItems = [
      {
        id: "v123",
        title: "Old Video Added Recently",
        kind: "video",
        apiVersion: "v2",
        createdAt: "2012-05-10T00:00:00.000Z",
      },
      {
        id: "v456",
        title: "New Video Added Recently",
        kind: "video",
        apiVersion: "v2",
        createdAt: "2024-01-15T00:00:00.000Z",
      },
    ] as unknown as DiscoveryItem[];

    const intelligence = computeResourceIntelligence(
      mockPlaylistItems,
      {
        id: "x88apm",
        title: "Test Playlist",
        kind: "playlist",
        apiVersion: "v2",
        createdAt: "2023-08-01T00:00:00.000Z",
      } as unknown as DiscoveryItem,
      "v2",
      {
        kind: "playlist",
        identifier: "x88apm",
        canonicalUrl: "https://www.dailymotion.com/playlist/x88apm",
        rawInput: "https://www.dailymotion.com/playlist/x88apm",
        apiPathV1: "/playlist/x88apm",
        apiPathV2: "/playlists/x88apm",
        displayLabel: "x88apm",
        warnings: [],
      }
    );

    expect(intelligence.membershipDateAvailable).toBe(false);
    expect(intelligence.membershipDateNotice).toContain("does not expose membership-added timestamps");
    expect(intelligence.playlistCreatedDate).toBe("2023-08-01T00:00:00.000Z");
  });
});

describe("Custom Date Range Filtering (Section 5)", () => {
  it("generates correct bounded periods for custom date ranges", () => {
    const periods = partitionCustomDateRange(
      "2024-01-01",
      "2024-03-31",
      "month",
      "oldest_to_newest",
      "v2",
      "lemonde"
    );

    expect(periods.length).toBe(3);
    expect(periods[0].label).toBe("Jan 2024");
    expect(periods[1].label).toBe("Feb 2024");
    expect(periods[2].label).toBe("Mar 2024");
  });

  it("supports single-window entire_range granularity for custom dates", () => {
    const periods = partitionCustomDateRange(
      "2022-06-01",
      "2023-06-01",
      "entire_range",
      "newest_to_oldest",
      "v1",
      "lemonde"
    );

    expect(periods.length).toBe(1);
    expect(periods[0].label).toContain("2022-06-01 to 2023-06-01");
  });
});

describe("Pause, Resume, and Cancel Lifecycle (Section 6)", () => {
  it("pauses immediately when isPaused returns true", async () => {
    let progressReported: ScanProgressState | undefined;
    let callCount = 0;

    // Mock global fetch to return multi-page data
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          ok: true,
          items: [{ id: `item-${callCount}`, title: `Item ${callCount}`, kind: "video" }],
          hasMore: true,
          total: 100,
        }),
      } as any;
    });

    try {
      await resolveLinkExplorerInput(
        "https://www.dailymotion.com/user/testuser",
        "v1",
        "channel",
        { pageSize: 10, maxPages: 5, throttleMs: 0 },
        (progress) => {
          progressReported = progress;
        },
        undefined,
        undefined,
        undefined,
        // isPaused function: pauses after first page fetch
        () => callCount >= 1
      );

      expect(progressReported?.status).toBe("paused");
      expect(callCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("marks status as cancelled when abortSignal is triggered", async () => {
    let progressReported: ScanProgressState | undefined;
    const abortCtrl = new AbortController();
    abortCtrl.abort(); // already aborted

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, items: [] }),
    } as any);

    try {
      await resolveLinkExplorerInput(
        "https://www.dailymotion.com/playlist/x88apm",
        "v2",
        "playlist",
        { pageSize: 10, maxPages: 5, throttleMs: 0 },
        (progress) => {
          progressReported = progress;
        },
        abortCtrl.signal
      );

      expect(progressReported?.status).toBe("cancelled");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
