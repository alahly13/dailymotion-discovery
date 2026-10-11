import { afterEach, describe, expect, it, vi } from "vitest";
import { getV1Env, getV2Env } from "../version-config";
import { v1Get, v1List } from "../v1-client";
import { v2List } from "../v2-client";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("version base-URL isolation", () => {
  it("keeps v1 public/partner and v2 unified base URLs distinct", () => {
    vi.stubEnv("DAILYMOTION_API_BASE_URL_V1", "https://api.dailymotion.com/");
    vi.stubEnv("DAILYMOTION_PARTNER_API_BASE_URL_V1", "https://partner.api.dailymotion.com/rest");
    vi.stubEnv("DAILYMOTION_API_BASE_URL_V2", "https://api.dailymotion.com/v2");
    const v1 = getV1Env();
    const v2 = getV2Env();
    expect(v1.baseUrl).toBe("https://api.dailymotion.com");
    expect(v1.partnerBaseUrl).toBe("https://partner.api.dailymotion.com/rest");
    expect(v1.baseUrl).not.toBe(v1.partnerBaseUrl);
    expect(v2.baseUrl).toBe("https://api.dailymotion.com/v2");
  });

  it("defaults v1 to the public host and partner var to the partner host", () => {
    vi.stubEnv("DAILYMOTION_API_BASE_URL_V1", "");
    vi.stubEnv("DAILYMOTION_PARTNER_API_BASE_URL_V1", "");
    vi.stubEnv("DAILYMOTION_API_BASE_URL", "https://api.dailymotion.com");
    vi.stubEnv("DAILYMOTION_API_BASE_URL_V2", "");
    // Canonical split: V1 var = public host; bare legacy var never feeds it.
    expect(getV1Env().baseUrl).toBe("https://api.dailymotion.com");
    expect(getV2Env().baseUrl).toBe("https://api.dailymotion.com/v2");
  });

  it("honors an explicit partner value in the v1 var (deprecated alias)", () => {
    vi.stubEnv("DAILYMOTION_API_BASE_URL_V1", "https://partner.api.dailymotion.com/rest");
    vi.stubEnv("DAILYMOTION_PARTNER_API_BASE_URL_V1", "");
    expect(getV1Env().partnerBaseUrl).toBe("https://partner.api.dailymotion.com/rest");
    vi.stubEnv("DAILYMOTION_PARTNER_API_BASE_URL_V1", "https://partner.example.com/rest");
    expect(getV1Env().partnerBaseUrl).toBe("https://partner.example.com/rest");
  });

  it("reports missing credentials without claiming access", () => {
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_V1", "");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_SECRET_V1", "");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_V2", "");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_SECRET_V2", "");
    expect(getV1Env().hasCredentials).toBe(false);
    expect(getV2Env().hasCredentials).toBe(false);
  });
});

describe("v1 client", () => {
  it("parses list envelopes with has_more pagination", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { page: 1, limit: 2, total: 1000, has_more: true, list: [{ id: "x1", title: "a" }] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await v1List<{ id: string }>("/videos", { search: "news", limit: "2", page: "1" });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.has_more).toBe(true);
      expect(outcome.data.total).toBe(1000);
    }
    const firstCall = fetchMock.mock.calls[0] as unknown[];
    expect(String(firstCall[0])).toContain("https://api.dailymotion.com/videos");
    expect(String(firstCall[0])).not.toContain("/v2");
    // No v1 creds in test env → same-version public host, never partner-without-token.
    expect(String(firstCall[0])).not.toContain("partner.api.dailymotion.com");
  });

  it("uses the partner host with Bearer when a v1 token exists", async () => {
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_V1", "k1");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_SECRET_V1", "s1");
    vi.stubEnv("DAILYMOTION_PARTNER_API_BASE_URL_V1", "");
    vi.stubEnv("DAILYMOTION_API_BASE_URL_V1", "");
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        const target = String(url);
        if (target.includes("/token")) {
          return new Response(JSON.stringify({ access_token: "tok", expires_in: 36000, scope: "userinfo" }), { status: 200 });
        }
        calls.push({ url: target, auth: new Headers(init?.headers).get("authorization") });
        return new Response(JSON.stringify({ page: 1, limit: 1, total: 1, has_more: false, list: [{ id: "x1" }] }), { status: 200 });
      })
    );
    const outcome = await v1List<{ id: string }>("/videos", { limit: "1" });
    expect(outcome.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("partner.api.dailymotion.com/rest/videos");
    expect(calls[0].auth).toBe("Bearer tok");
  });

  it("maps anonymous 403 to auth_missing (not empty results)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(403, { error: { code: 403, message: "Only authenticated users can use this filter." } })));
    const outcome = await v1List("/playlists", { search: "news" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failure.reason).toBe("auth_missing");
  });

  it("retries rate limits then surfaces rate_limited", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, { error: { code: 429, message: "slow down" } }));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await v1Get("/video/x1", {}, { retries: 1 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.reason).toBe("rate_limited");
      expect(outcome.failure.retryable).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("v2 client without credentials", () => {
  it("returns auth_missing WITHOUT any HTTP request", async () => {
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_V2", "");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_SECRET_V2", "");
    const fetchMock = vi.fn(async () => {
      throw new Error("fetch must not be called without v2 credentials");
    });
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await v2List("/profiles/xiy/videos", { page: "1" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.reason).toBe("auth_missing");
      expect(outcome.failure.status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
