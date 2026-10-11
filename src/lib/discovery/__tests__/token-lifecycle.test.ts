import { afterEach, describe, expect, it, vi } from "vitest";
import { clearVersionTokenCache, getVersionTokenResult } from "../auth";
import { isTokenEncryptionConfigured, sealToken, unsealToken } from "../token-crypto";
import { tokenSafetyMarginSeconds } from "../version-config";
import { v2List } from "../v2-client";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  clearVersionTokenCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("token encryption", () => {
  it("round-trips with a configured key and fails closed without/tampered", () => {
    vi.stubEnv("TOKEN_CACHE_ENCRYPTION_KEY", "test-key-for-unit-tests-only-1234");
    expect(isTokenEncryptionConfigured()).toBe(true);
    const sealed = sealToken("super-secret-token");
    expect(sealed).not.toBeNull();
    expect(unsealToken(sealed!)).toBe("super-secret-token");
    expect(JSON.stringify(sealed)).not.toMatch(/super-secret-token/);
    // Wrong key → miss, never throw.
    vi.stubEnv("TOKEN_CACHE_ENCRYPTION_KEY", "different-key");
    expect(unsealToken(sealed!)).toBeNull();
    vi.stubEnv("TOKEN_CACHE_ENCRYPTION_KEY", "");
    expect(isTokenEncryptionConfigured()).toBe(false);
    expect(sealToken("x")).toBeNull();
  });

  it("uses the actual expires_in with a configurable safety margin", () => {
    vi.stubEnv("TOKEN_CACHE_SAFETY_MARGIN_SECONDS", "");
    expect(tokenSafetyMarginSeconds()).toBe(60);
    vi.stubEnv("TOKEN_CACHE_SAFETY_MARGIN_SECONDS", "120");
    expect(tokenSafetyMarginSeconds()).toBe(120);
    vi.stubEnv("TOKEN_CACHE_SAFETY_MARGIN_SECONDS", "garbage");
    expect(tokenSafetyMarginSeconds()).toBe(60);
  });
});

describe("token reuse and single-flight", () => {
  it("concurrent searches share one acquisition (no storm)", async () => {
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_V2", "k");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_SECRET_V2", "s");
    const fetchMock = vi.fn(async () => json(200, { access_token: "shared", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);
    const results = await Promise.all([
      getVersionTokenResult("v2"),
      getVersionTokenResult("v2"),
      getVersionTokenResult("v2"),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Reuse afterwards without new HTTP.
    await getVersionTokenResult("v2");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("genuine-401 refresh (retry at most once)", () => {
  function stubV2Creds() {
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_V2", "k");
    vi.stubEnv("PRIVATE_DAILYMOTION_API_KEY_SECRET_V2", "s");
  }

  it("invalidates, reacquires once, and retries the request", async () => {
    stubV2Creds();
    let tokenCalls = 0;
    let apiCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const target = String(url);
        if (target.includes("/token")) {
          tokenCalls += 1;
          return json(200, { access_token: `tok-${tokenCalls}`, expires_in: 3600 });
        }
        apiCalls += 1;
        if (apiCalls === 1) return json(401, { error: { code: "AUTHORIZATION_EXPIRED", message: "expired", documentation_url: "x" } });
        return json(200, { data: [], pagination: { page: 1, page_size: 10, total: 0, next: null, previous: null } });
      })
    );
    const outcome = await v2List("/profiles/xiy/videos", { page: "1" });
    expect(outcome.ok).toBe(true);
    expect(tokenCalls).toBe(2);
    expect(apiCalls).toBe(2);
  });

  it("never treats 403 as token expiry (no reacquire)", async () => {
    stubV2Creds();
    let tokenCalls = 0;
    let apiCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const target = String(url);
        if (target.includes("/token")) {
          tokenCalls += 1;
          return json(200, { access_token: "tok", expires_in: 3600 });
        }
        apiCalls += 1;
        return json(403, { error: { code: "MISSING_PERMISSIONS", message: "forbidden", documentation_url: "x" } });
      })
    );
    const outcome = await v2List("/profiles/xiy/videos", { page: "1" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failure.reason).toBe("forbidden");
    expect(tokenCalls).toBe(1);
    expect(apiCalls).toBe(1);
  });
});
