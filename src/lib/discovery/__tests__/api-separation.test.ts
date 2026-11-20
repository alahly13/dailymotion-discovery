import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v1List, v1Get } from "../v1-client";
import { v2List, v2Get } from "../v2-client";
import { resolveLinkExplorerInput } from "@/lib/link-explorer/link-explorer-service";

function mockJsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("Strict API v1 and v2 Separation", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("DAILYMOTION_API_BASE_URL_V1", "https://api.dailymotion.com");
    vi.stubEnv("DAILYMOTION_PARTNER_API_BASE_URL_V1", "https://partner.api.dailymotion.com/rest");
    vi.stubEnv("DAILYMOTION_API_BASE_URL_V2", "https://api.dailymotion.com/v2");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_V1", "test_v1_key");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_SECRET_V1", "test_v1_secret");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_V2", "test_v2_key");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_SECRET_V2", "test_v2_secret");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("API Client Base URL Separation", () => {
    it("V1 client calls ONLY V1 endpoints and never v2", async () => {
      const fetchedUrls: string[] = [];
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        fetchedUrls.push(url);
        return mockJsonResponse({
          page: 1,
          limit: 10,
          total: 1,
          has_more: false,
          list: [{ id: "x123", title: "V1 Video" }],
        });
      });

      await v1List("/videos", { search: "technology" });

      expect(fetchedUrls.length).toBeGreaterThan(0);
      for (const url of fetchedUrls) {
        expect(url).toMatch(/^https:\/\/(api|partner\.api)\.dailymotion\.com/);
        expect(url).not.toContain("/v2/");
      }
    });

    it("V2 client calls ONLY V2 endpoints and never v1 legacy", async () => {
      const fetchedUrls: string[] = [];
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        fetchedUrls.push(url);

        // If it's the token endpoint, return mock token
        if (url.includes("/token")) {
          return mockJsonResponse({
            access_token: "mock_v2_token",
            token_type: "Bearer",
            expires_in: 1800,
            scope: "account.read profile.read video.read",
          });
        }

        return mockJsonResponse({
          data: [{ id: "x456", title: "V2 Video" }],
          pagination: { current_page: 1, total_items: 1, has_more: false },
        });
      });

      await v2List("/profiles/lequipe/videos", {});

      expect(fetchedUrls.length).toBeGreaterThan(0);
      for (const url of fetchedUrls) {
        if (!url.includes("/token")) {
          expect(url).toContain("https://api.dailymotion.com/v2/");
          expect(url).not.toMatch(/^https:\/\/api\.dailymotion\.com\/videos/);
        }
      }
    });
  });

  describe("Link Explorer Version Integrity", () => {
    it("Link Explorer V1 resolves videos using V1 API route", async () => {
      const requestedRoutes: string[] = [];
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        requestedRoutes.push(url);
        return mockJsonResponse({
          ok: true,
          item: { id: "x8n8x8", title: "Video on V1", version: "v1", type: "video" },
        });
      });

      const res = await resolveLinkExplorerInput("https://www.dailymotion.com/video/x8n8x8", "v1");

      expect(res.ok).toBe(true);
      expect(res.version).toBe("v1");
      expect(requestedRoutes.some((r) => r.includes("/api/discovery/v1/videos"))).toBe(true);
      expect(requestedRoutes.every((r) => !r.includes("/api/discovery/v2/"))).toBe(true);
    });

    it("Link Explorer V2 resolves videos using V2 API route and never V1", async () => {
      const requestedRoutes: string[] = [];
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        requestedRoutes.push(url);
        return mockJsonResponse({
          ok: true,
          item: { id: "x8n8x8", title: "Video on V2", version: "v2", type: "video" },
        });
      });

      const res = await resolveLinkExplorerInput("https://www.dailymotion.com/video/x8n8x8", "v2");

      expect(res.ok).toBe(true);
      expect(res.version).toBe("v2");
      expect(requestedRoutes.some((r) => r.includes("/api/discovery/v2/videos"))).toBe(true);
      expect(requestedRoutes.every((r) => !r.includes("/api/discovery/v1/"))).toBe(true);
    });

    it("Link Explorer V2 rejects global search input without falling back to V1", async () => {
      const requestedRoutes: string[] = [];
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        requestedRoutes.push(url);
        return mockJsonResponse({ ok: true, items: [] });
      });

      const res = await resolveLinkExplorerInput("https://www.dailymotion.com/search/documentary", "v2");

      expect(res.ok).toBe(false);
      expect(res.version).toBe("v2");
      expect(res.effectiveKind).toBe("search");
      expect(res.error).toContain("is a keyword search query");
      // Zero calls made to V1 endpoint!
      expect(requestedRoutes.every((r) => !r.includes("/api/discovery/v1/"))).toBe(true);
    });

    it("Link Explorer rejects multi-word search queries and directs to Global Search with zero provider calls", async () => {
      const requestedRoutes: string[] = [];
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        requestedRoutes.push(url);
        return mockJsonResponse({ ok: true, items: [] });
      });

      const res = await resolveLinkExplorerInput("رقص افراح شعبيه مصرى", "v1");

      expect(res.ok).toBe(false);
      expect(res.effectiveKind).toBe("search");
      expect(res.version).toBe("v1");
      expect(res.error).toContain("is a keyword search query");
      expect(requestedRoutes.length).toBe(0);
    });

    it("Link Explorer V2 rejects Arabic multi-word search queries with honest message and zero V1 calls", async () => {
      const requestedRoutes: string[] = [];
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        requestedRoutes.push(url);
        return mockJsonResponse({ ok: true, items: [] });
      });

      const res = await resolveLinkExplorerInput("رقص افراح شعبيه مصرى", "v2");

      expect(res.ok).toBe(false);
      expect(res.effectiveKind).toBe("search");
      expect(res.version).toBe("v2");
      expect(res.error).toContain("is a keyword search query");
      expect(requestedRoutes.length).toBe(0);
    });
  });
});
