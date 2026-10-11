import { describe, expect, it } from "vitest";
import {
  buildV1PlaylistParams,
  buildV1UserParams,
  buildV1VideoParams,
  buildV2ProfileVideoParams,
  clampLimit,
  clampPage,
  isBlankQuery,
  toV2IsoDate,
  unixToIso,
} from "../query-serialization";

describe("v1 query serialization", () => {
  it("uses v1 parameter names (limit/page/search, never page_size)", () => {
    const params = buildV1VideoParams({ search: "news", limit: 50, page: 2 });
    expect(params.search).toBe("news");
    expect(params.limit).toBe("50");
    expect(params.page).toBe("2");
    expect("page_size" in params).toBe(false);
  });

  it("preserves exact Unicode queries (Arabic, quotes, emoji, apostrophes)", () => {
    const queries = [
      "العربية",
      `"exact phrase" d'équipe`,
      "news 🎬 highlights?",
      "  spaced  ",
    ];
    for (const query of queries) {
      expect(buildV1VideoParams({ search: query }).search).toBe(query);
    }
  });

  it("clamps limit to 100 and page to >= 1", () => {
    expect(clampLimit(500)).toBe(100);
    expect(clampLimit(0)).toBe(1);
    expect(clampPage(-3)).toBe(1);
    expect(clampPage(Number.NaN)).toBe(1);
  });

  it("serializes live flags as flag params", () => {
    const params = buildV1VideoParams({ live: "live_onair" });
    expect(params.live_onair).toBe("1");
  });

  it("serializes unix date filters as integers", () => {
    const params = buildV1VideoParams({ createdAfterUnix: 1682892000.9, createdBeforeUnix: 1685570399 });
    expect(params.created_after).toBe("1682892000");
    expect(params.created_before).toBe("1685570399");
  });

  it("builds user params with v1 user dialect", () => {
    const params = buildV1UserParams({ search: "sport", sort: "popular", limit: 10, page: 1 });
    expect(params).toMatchObject({ search: "sport", sort: "popular", limit: "10", page: "1" });
    expect("page_size" in params).toBe(false);
  });

  it("builds owner-scoped playlist params (no anonymous global search)", () => {
    const params = buildV1PlaylistParams({ owner: "lequipe", limit: 20, page: 1 });
    expect(params.owner).toBe("lequipe");
    expect("search" in params).toBe(false);
  });

  it("detects blank queries without altering real ones", () => {
    expect(isBlankQuery("")).toBe(true);
    expect(isBlankQuery("   ")).toBe(true);
    expect(isBlankQuery(null)).toBe(true);
    expect(isBlankQuery("0")).toBe(false);
    expect(isBlankQuery("news")).toBe(false);
  });
});

describe("v2 query serialization", () => {
  it("uses v2 parameter names (page/page_size, never limit/search)", () => {
    const params = buildV2ProfileVideoParams({ profileId: "xiy", page: 2, pageSize: 100 });
    expect(params.page).toBe("2");
    expect(params.page_size).toBe("100");
    expect("limit" in params).toBe(false);
    expect("search" in params).toBe(false);
  });

  it("serializes ISO-8601 date filters and visibility", () => {
    const params = buildV2ProfileVideoParams({
      profileId: "xiy",
      visibility: "public",
      createdAfterIso: "2026-05-01T00:00:00Z",
      createdBeforeIso: "2026-05-31T23:59:59Z",
    });
    expect(params.visibility).toBe("public");
    expect(params.created_after).toBe("2026-05-01T00:00:00Z");
    expect(params.created_before).toBe("2026-05-31T23:59:59Z");
  });

  it("converts UI dates to ISO and unix seconds to ISO for display", () => {
    expect(toV2IsoDate("2026-05-01")).toBe("2026-05-01T00:00:00.000Z");
    expect(toV2IsoDate("not-a-date")).toBeNull();
    expect(unixToIso(1486444210)).toBe("2017-02-07T05:10:10.000Z");
    expect(unixToIso(null)).toBeNull();
  });
});
