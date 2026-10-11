import { afterEach, describe, expect, it, vi } from "vitest";
import { clearVersionTokenCache } from "../auth";
import { resetConnectionTestCooldown, testVersionConnection } from "../connection-test";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  clearVersionTokenCache();
  resetConnectionTestCooldown();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubCreds(version: "V1" | "V2", present: boolean) {
  vi.stubEnv(`PRIVATE_DAILYMOTION_API_KEY_${version}`, present ? `key-${version}` : "");
  vi.stubEnv(`PRIVATE_DAILYMOTION_API_KEY_SECRET_${version}`, present ? `secret-${version}` : "");
}

/** Route fetch by URL: token endpoint vs API probe. */
function routeFetch(handlers: { token: () => Response; api: (url: string, token: string | null) => Response }) {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const target = String(url);
    if (target.includes("/token")) return handlers.token();
    const headers = new Headers(init?.headers);
    return handlers.api(target, headers.get("authorization"));
  });
}

describe("v1 connection test (mocked)", () => {
  it("passes token acquisition + partner probe and leaks no secrets", async () => {
    stubCreds("V1", true);
    stubCreds("V2", false);
    vi.stubGlobal(
      "fetch",
      routeFetch({
        token: () => json(200, { access_token: "SECRET-V1-TOKEN", expires_in: 36000, scope: "userinfo" }),
        api: (url, auth) => {
          expect(url).toContain("partner.api.dailymotion.com/rest/videos");
          expect(auth).toBe("Bearer SECRET-V1-TOKEN");
          return json(200, { page: 1, limit: 1, total: 1, has_more: false, list: [{ id: "x1" }] });
        },
      })
    );
    const result = await testVersionConnection("v1");
    expect(result.ok).toBe(true);
    expect(result.token.acquired).toBe(true);
    expect(result.api?.status).toBe(200);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/SECRET-V1-TOKEN/);
    expect(serialized).not.toMatch(/key-V1|secret-V1/);
  });

  it("distinguishes token-ok-but-API-forbidden (403)", async () => {
    stubCreds("V1", true);
    vi.stubGlobal(
      "fetch",
      routeFetch({
        token: () => json(200, { access_token: "t", expires_in: 36000 }),
        api: () => json(403, { error: { code: 403, message: "forbidden" } }),
      })
    );
    const result = await testVersionConnection("v1");
    expect(result.ok).toBe(false);
    expect(result.token.acquired).toBe(true);
    expect(result.api?.outcome).toBe("forbidden");
  });

  it("reports missing v1 credentials without touching v2", async () => {
    stubCreds("V1", false);
    stubCreds("V2", true);
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const result = await testVersionConnection("v1");
    expect(result.ok).toBe(false);
    expect(result.remedy).toMatch(/PRIVATE_DAILYMOTION_API_KEY_V1/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("v2 connection test (mocked)", () => {
  it("passes on 200 and treats authenticated-404 as token-accepted", async () => {
    stubCreds("V2", true);
    vi.stubGlobal(
      "fetch",
      routeFetch({
        token: () => json(200, { access_token: "SECRET-V2-TOKEN", expires_in: 1800, scope: "bundle.public" }),
        api: (url, auth) => {
          expect(url).toContain("api.dailymotion.com/v2/videos/");
          expect(auth).toBe("Bearer SECRET-V2-TOKEN");
          return json(200, { video_id: "x5auisp", title: "t" });
        },
      })
    );
    const okResult = await testVersionConnection("v2");
    expect(okResult.ok).toBe(true);
    expect(JSON.stringify(okResult)).not.toMatch(/SECRET-V2-TOKEN/);

    clearVersionTokenCache("v2");
    resetConnectionTestCooldown();
    vi.stubGlobal(
      "fetch",
      routeFetch({
        token: () => json(200, { access_token: "t2", expires_in: 1800 }),
        api: () => json(404, { error: { code: "RESOURCE_NOT_FOUND", message: "not found", documentation_url: "x" } }),
      })
    );
    // Authenticated 404 proves token acceptance (a rejected token yields 401).
    const visible = await testVersionConnection("v2");
    expect(visible.ok).toBe(true);
    expect(visible.api?.outcome).toBe("authenticated-not-visible");
  });

  it("cools down duplicate clicks without new token requests", async () => {
    stubCreds("V2", true);
    const fetchMock = routeFetch({
      token: () => json(200, { access_token: "t3", expires_in: 1800 }),
      api: () => json(200, { video_id: "x", title: "t" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await testVersionConnection("v2")).ok).toBe(true);
    const throttled = await testVersionConnection("v2");
    expect(throttled.ok).toBe(false);
    expect(throttled.remedy).toMatch(/seconds ago/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one token + one probe, then stopped
  });

  it("fails closed on invalid client at the token step", async () => {
    stubCreds("V2", true);
    vi.stubGlobal(
      "fetch",
      routeFetch({
        token: () => json(401, { error: "invalid_client" }),
        api: () => json(200, {}),
      })
    );
    const result = await testVersionConnection("v2");
    expect(result.ok).toBe(false);
    expect(result.token.acquired).toBe(false);
    expect(result.api).toBeNull();
  });
});
