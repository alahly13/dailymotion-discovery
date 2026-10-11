import { afterEach, describe, expect, it, vi } from "vitest";
import {
  V1_SEARCH_SCHEMA,
  V2_SEARCH_SCHEMA,
  buildSearchCacheKey,
  resolveFields,
  resolveSort,
  schemaFor,
} from "../param-schema";
import { defaultLocalization, parseFamilyFilterEnv } from "../version-config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("schema availability truth", () => {
  it("exposes family_filter + localization for v1 only", () => {
    const v1Keys = schemaFor("v1").map((d) => d.key);
    const v2Keys = schemaFor("v2").map((d) => d.key);
    expect(v1Keys).toContain("familyFilter");
    expect(v1Keys).toContain("localization");
    expect(v2Keys).not.toContain("familyFilter");
    expect(v2Keys).not.toContain("localization");
    expect(v2Keys).toContain("isExplicit");
  });

  it("uses limit for v1 and page_size for v2 (never both)", () => {
    const v1Size = V1_SEARCH_SCHEMA.find((d) => d.key === "pageSize");
    const v2Size = V2_SEARCH_SCHEMA.find((d) => d.key === "pageSize");
    expect(v1Size?.wire).toBe("limit");
    expect(v2Size?.wire).toBe("page_size");
    expect(v1Size?.max).toBe(100);
    expect(v2Size?.max).toBe(100);
  });
});

describe("sort validation", () => {
  it("forces relevance off without a query (v1)", () => {
    const { sort, notice } = resolveSort("v1", "relevance", false);
    expect(sort).toBe("recent");
    expect(notice).toMatch(/needs a search query/);
  });

  it("keeps relevance with a query and resets unknown sorts", () => {
    expect(resolveSort("v1", "relevance", true).sort).toBe("relevance");
    expect(resolveSort("v1", "relevance", true).notice).toBeNull();
    const reset = resolveSort("v1", "bogus", true);
    expect(reset.sort).toBe("relevance");
    expect(reset.notice).toMatch(/not supported/);
  });

  it("restricts v2 to created_at sorts", () => {
    expect(resolveSort("v2", "-created_at", true).notice).toBeNull();
    const reset = resolveSort("v2", "relevance", true);
    expect(reset.sort).toBe("-created_at");
    expect(reset.notice).toMatch(/not supported/);
  });
});

describe("field selection protection", () => {
  it("always keeps mandatory fields and drops unknown ones", () => {
    expect(resolveFields("v1", ["description", "bogus", "title"])).toEqual(["id", "title", "description"]);
    expect(resolveFields("v2", [])).toBeNull();
    expect(resolveFields("v2", ["bogus"])).toEqual(["video_id", "title"]);
    expect(resolveFields("v1", null)).toBeNull();
  });
});

describe("cache-key separation", () => {
  it("separates versions and is order-invariant", () => {
    const a = buildSearchCacheKey("v1", "general", "search", { q: "news", sort: "recent" });
    const b = buildSearchCacheKey("v1", "general", "search", { sort: "recent", q: "news" });
    const c = buildSearchCacheKey("v2", "general", "browse", { sort: "recent", q: "news" });
    const d = buildSearchCacheKey("v1", "general", "search", { q: "sport", sort: "recent" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it("omits empty values so Auto/empty never collides with explicit false", () => {
    const omitted = buildSearchCacheKey("v1", "general", "search", { q: "x", familyFilter: "" });
    const explicitFalse = buildSearchCacheKey("v1", "general", "search", { q: "x", familyFilter: "false" });
    expect(omitted).not.toBe(explicitFalse);
  });
});

describe("family filter env tri-state", () => {
  it("distinguishes missing from deliberate false", () => {
    vi.stubEnv("DAILYMOTION_FAMILY_FILTER", "");
    expect(parseFamilyFilterEnv()).toBeNull();
    vi.stubEnv("DAILYMOTION_FAMILY_FILTER", "false");
    expect(parseFamilyFilterEnv()).toBe(false);
    vi.stubEnv("DAILYMOTION_FAMILY_FILTER", "true");
    expect(parseFamilyFilterEnv()).toBe(true);
    vi.stubEnv("DAILYMOTION_FAMILY_FILTER", "garbage");
    expect(parseFamilyFilterEnv()).toBeNull();
  });

  it("defaults localization to detect", () => {
    vi.stubEnv("DAILYMOTION_LOCALIZATION", "");
    expect(defaultLocalization()).toBe("detect");
    vi.stubEnv("DAILYMOTION_LOCALIZATION", "fr_FR");
    expect(defaultLocalization()).toBe("fr_FR");
  });
});
