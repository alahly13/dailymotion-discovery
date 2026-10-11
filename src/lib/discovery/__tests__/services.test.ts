import { afterEach, describe, expect, it, vi } from "vitest";
import { v1GetVideo, v1SearchVideos } from "../v1-search-service";
import { v2GetVideo, v2ProfileVideos } from "../v2-search-service";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("v1 search service", () => {
  it("rejects blank queries as user_input_error", async () => {
    const outcome = await v1SearchVideos({ query: "   " }, "general");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("user_input_error");
      expect(outcome.status).toBe(400);
    }
  });

  it("normalizes search results and flags window caps", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { page: 10, limit: 100, total: 5000, has_more: true, list: [{ id: "x1", title: "a" }] }))
    );
    const outcome = await v1SearchVideos({ query: "news", limit: 100, page: 10 }, "general");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.items[0].apiVersion).toBe("v1");
      expect(outcome.result.hasMore).toBe(true);
      expect(outcome.result.capped).toBe(true);
      expect(outcome.result.endpoint).toBe("GET /videos");
    }
  });

  it("detects end of results via has_more=false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { page: 1, limit: 2, total: 2, has_more: false, list: [{ id: "x1" }] }))
    );
    const outcome = await v1SearchVideos({ query: "rare", limit: 2, page: 1 }, "videos");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.hasMore).toBe(false);
      expect(outcome.result.capped).toBe(false);
    }
  });

  it("wraps lookups as single-item results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { id: "x5auisp", title: "t" })));
    const outcome = await v1GetVideo("x5auisp");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result.total).toBe(1);
  });
});

describe("v2 search service without credentials", () => {
  it("explains missing credentials with a remedy (never empty results)", async () => {
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_V2", "");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_SECRET_V2", "");
    const browse = await v2ProfileVideos("xiy", {}, "videos");
    expect(browse.ok).toBe(false);
    if (!browse.ok) {
      expect(browse.reason).toBe("auth_missing");
      expect(browse.remedy).toMatch(/PRIVATE_DAILYMOTION_API_KEY_V2/);
    }
    const lookup = await v2GetVideo("x1");
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.reason).toBe("auth_missing");
  });

  it("requires a profile id for profile-scoped browsing", async () => {
    const outcome = await v2ProfileVideos("   ", {}, "general");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("user_input_error");
      expect(outcome.error).toMatch(/no global search/i);
    }
  });
});
