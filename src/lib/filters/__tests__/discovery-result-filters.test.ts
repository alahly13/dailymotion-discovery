import { describe, expect, it } from "vitest";
import {
  applyDiscoveryResultPipeline,
  DEFAULT_DISCOVERY_LOCAL_FILTERS,
  listActiveLocalFilterChips,
} from "../discovery-result-filters";
import { getFilterCapabilitiesFor } from "@/lib/discovery/filter-capabilities";
import { classifyDiscoveryItem } from "@/lib/resources/dailymotion-resource-taxonomy";
import type { DiscoveryItem } from "@/lib/discovery/types";

function makeItem(overrides: Partial<DiscoveryItem> = {}): DiscoveryItem {
  return {
    kind: "video",
    apiVersion: "v1",
    id: "x100",
    title: "Next.js 16 Architecture",
    description: "Deep dive on Dailymotion APIs",
    thumbnail: "https://example.com/thumb.jpg",
    url: "https://www.dailymotion.com/video/x100",
    duration: 300,
    language: "en",
    country: "US",
    category: "tech",
    createdAt: "2026-06-15T12:00:00.000Z",
    year: 2026,
    tags: ["nextjs", "typescript"],
    ownerId: "u1",
    ownerName: "EngineeringChannel",
    views: 500,
    extra: { explicit: false, is_for_kids: false },
    raw: { id: "x100" },
    ...overrides,
  };
}

describe("applyDiscoveryResultPipeline", () => {
  it("preserves zero views and zero duration as valid numeric values", () => {
    const items = [
      makeItem({ id: "x-zero", views: 0, duration: 0, title: "Brand New Live" }),
      makeItem({ id: "x-null", views: null, duration: null, title: "Unknown Metrics" }),
      makeItem({ id: "x-high", views: 1000, duration: 600, title: "High Views" }),
    ];

    const exactZeroViews = applyDiscoveryResultPipeline(items, {
      ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
      minViews: 0,
      maxViews: 0,
      strictMetadata: true,
    });
    expect(exactZeroViews.map((i) => i.id)).toEqual(["x-zero"]);

    const exactZeroDur = applyDiscoveryResultPipeline(items, {
      ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
      minDurationSec: 0,
      maxDurationSec: 0,
      strictMetadata: true,
    });
    expect(exactZeroDur.map((i) => i.id)).toEqual(["x-zero"]);
  });

  it("treats dateTo YYYY-MM-DD as inclusive UTC end of day", () => {
    const items = [
      makeItem({ id: "end-of-day", createdAt: "2026-06-15T23:45:00.000Z" }),
      makeItem({ id: "next-day", createdAt: "2026-06-16T00:01:00.000Z" }),
    ];
    const filtered = applyDiscoveryResultPipeline(items, {
      ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
      dateTo: "2026-06-15",
    });
    expect(filtered.map((i) => i.id)).toEqual(["end-of-day"]);
  });

  it("supports include, exclude, exact phrase, and field targeting", () => {
    const items = [
      makeItem({ id: "match", title: "Cloudflare Worker Storage Guide", description: "R2 integrity", tags: ["r2", "worker"] }),
      makeItem({ id: "excluded", title: "Cloudflare Worker Teaser", description: "teaser promo" }),
      makeItem({ id: "wrong-field", title: "Unrelated Title", ownerName: "Cloudflare" }),
    ];

    const filtered = applyDiscoveryResultPipeline(items, {
      ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
      includeText: "cloudflare",
      excludeKeywords: "teaser",
      exactPhrase: "Worker Storage",
      targetFields: "title",
    });
    expect(filtered.map((i) => i.id)).toEqual(["match"]);
  });

  it("filters explicit, kids, resource types, and sorts zero-safe numerically", () => {
    const items = [
      makeItem({ id: "a", kind: "video", views: 0, extra: { explicit: false, is_for_kids: true } }),
      makeItem({ id: "b", kind: "playlist", views: 250, extra: { explicit: false, is_for_kids: false } }),
      makeItem({ id: "c", kind: "video", views: 50, extra: { explicit: true, is_for_kids: false } }),
    ];

    expect(
      applyDiscoveryResultPipeline(items, {
        ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
        explicitFilter: "non_explicit",
        kidsFilter: "kids_only",
      }).map((i) => i.id)
    ).toEqual(["a"]);

    expect(
      applyDiscoveryResultPipeline(items, {
        ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
        kinds: ["video"],
        localSort: "views_desc",
      }).map((i) => i.id)
    ).toEqual(["c", "a"]);
  });

  it("builds accurate active local chips and capability layer separation", () => {
    const chips = listActiveLocalFilterChips({
      ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
      includeText: "news",
      minViews: 0,
      strictMetadata: true,
    });
    expect(chips.map((c) => c.key)).toEqual(["includeText", "minViews", "strictMetadata"]);

    const v2Caps = getFilterCapabilitiesFor("v2", "videos");
    const queryCap = v2Caps.find((c) => c.key === "query");
    const visCap = v2Caps.find((c) => c.key === "visibility");
    expect(queryCap?.support).toBe("local");
    expect(visCap?.support).toBe("api");

    expect(classifyDiscoveryItem({ kind: "channel", apiVersion: "v2" })).toBe("PROFILE");
    expect(classifyDiscoveryItem({ kind: "channel", apiVersion: "v1" })).toBe("CHANNEL");
  });

  it("filters accurately by country code", () => {
    const items = [
      makeItem({ id: "item-us", country: "US" }),
      makeItem({ id: "item-fr", country: "FR" }),
      makeItem({ id: "item-none", country: null }),
    ];

    const usOnly = applyDiscoveryResultPipeline(items, {
      ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
      country: "US",
    });
    expect(usOnly.map((i) => i.id)).toEqual(["item-us"]);

    const frOnly = applyDiscoveryResultPipeline(items, {
      ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
      country: "fr",
    });
    expect(frOnly.map((i) => i.id)).toEqual(["item-fr"]);

    const chips = listActiveLocalFilterChips({
      ...DEFAULT_DISCOVERY_LOCAL_FILTERS,
      country: "US",
    });
    expect(chips).toContainEqual({ key: "country", label: "Country: US" });
  });
});
