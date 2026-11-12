import { describe, expect, it } from "vitest";
import { validateAiFilters, validateAiParsedQuery } from "../ai-schemas";

describe("AI schema validators", () => {
  it("validates structured AI filter fields including excludeKeyword, tags, and dates", () => {
    const result = validateAiFilters({
      keyword: "  typescript  ",
      excludeKeyword: "trailer, promo",
      tags: "nextjs, react",
      minViews: 1000,
      maxViews: -5,
      dateFrom: "2026-01-01",
      dateTo: "bad-date",
      hasThumbnail: true,
    });
    expect(result).toEqual({
      keyword: "typescript",
      excludeKeyword: "trailer, promo",
      tags: "nextjs, react",
      minViews: 1000,
      dateFrom: "2026-01-01",
      hasThumbnail: true,
    });
  });

  it("validates parsed query plans with safe sorts and ISO dates", () => {
    const plan = validateAiParsedQuery(
      {
        searchQuery: "french robotics documentary",
        language: "fr",
        sort: "visited-week",
        longerThan: 15,
        createdAfter: "2026-01-01",
        explanation: "Mapped prompt to API v1 parameters.",
      },
      "fallback",
    );
    expect(plan.searchQuery).toBe("french robotics documentary");
    expect(plan.sort).toBe("visited-week");
    expect(plan.longerThan).toBe(15);
    expect(plan.createdAfter).toBe("2026-01-01");
  });
});
