import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearVersionTokenCache,
  credentialHint,
  getTokenStatus,
  getVersionTokenResult,
} from "../auth";

function tokenResponse(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubCreds(version: "V1" | "V2", present: boolean) {
  vi.stubEnv(`PRIVATE_DAILYMOTION_API_KEY_${version}`, present ? `key-${version}` : "");
  vi.stubEnv(`PRIVATE_DAILYMOTION_API_KEY_SECRET_${version}`, present ? `secret-${version}` : "");
}

afterEach(() => {
  clearVersionTokenCache();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("v1 token acquisition (mocked)", () => {
  it("sends client_credentials + scope to the v1 partner token endpoint", async () => {
    stubCreds("V1", true);
    vi.stubEnv("DAILYMOTION_API_SCOPE_V1", "userinfo");
    const fetchMock = vi.fn(async () => tokenResponse({ access_token: "v1-token", expires_in: 36000, scope: "userinfo" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getVersionTokenResult("v1", { forceRefresh: true });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://partner.api.dailymotion.com/oauth/v1/token");
    const body = new URLSearchParams((init?.body as string) ?? "");
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("key-V1");
    expect(body.get("scope")).toBe("userinfo");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/x-www-form-urlencoded" });
  });

  it("classifies missing v1 scope (422) as invalid_scope, not invalid_client", async () => {
    stubCreds("V1", true);
    vi.stubGlobal("fetch", vi.fn(async () => tokenResponse({ reason: "x", error_message: "scope field required" }, 422)));
    const result = await getVersionTokenResult("v1", { forceRefresh: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.reason).toBe("invalid_scope");
      expect(result.value.remedy).toMatch(/DAILYMOTION_API_SCOPE_V1/);
    }
  });

  it("reports missing v1 credentials without any HTTP request", async () => {
    stubCreds("V1", false);
    const fetchMock = vi.fn(async () => tokenResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getVersionTokenResult("v1", { forceRefresh: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.reason).toBe("missing_credentials");
      expect(result.value.remedy).toMatch(/PRIVATE_DAILYMOTION_API_KEY_V1/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("v2 token acquisition (mocked)", () => {
  it("sends bundle.public to the v2 token endpoint and honors expires_in", async () => {
    stubCreds("V2", true);
    vi.stubEnv("DAILYMOTION_API_SCOPE_V2", "bundle.public");
    const fetchMock = vi.fn(async () => tokenResponse({ access_token: "v2-token", expires_in: 1800, scope: "bundle.public" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await getVersionTokenResult("v2", { forceRefresh: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.expiresIn).toBe(1800);
      expect(result.value.scope).toBe("bundle.public");
    }
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.dailymotion.com/v2/token");
    expect(new URLSearchParams((init?.body as string) ?? "").get("scope")).toBe("bundle.public");
  });

  it("classifies 401 as invalid_client with a key-focused remedy", async () => {
    stubCreds("V2", true);
    vi.stubGlobal("fetch", vi.fn(async () => tokenResponse({ error: "invalid_client" }, 401)));
    const result = await getVersionTokenResult("v2", { forceRefresh: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.value.reason).toBe("invalid_client");
  });

  it("rejects malformed JSON and empty access_token", async () => {
    stubCreds("V2", true);
    vi.stubGlobal("fetch", vi.fn(async () => tokenResponse("not-json{{{", 200)));
    const bad = await getVersionTokenResult("v2", { forceRefresh: true });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.value.reason).toBe("malformed_token_response");
    vi.stubGlobal("fetch", vi.fn(async () => tokenResponse({ expires_in: 1800 }, 200)));
    const empty = await getVersionTokenResult("v2", { forceRefresh: true });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.value.reason).toBe("malformed_token_response");
  });
});

describe("token cache isolation", () => {
  it("reuses valid tokens and never shares across versions", async () => {
    stubCreds("V1", true);
    stubCreds("V2", true);
    const fetchMock = vi.fn(async (url: unknown) =>
      tokenResponse({ access_token: `tok-for-${String(url)}`, expires_in: 3600 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = await getVersionTokenResult("v1");
    const second = await getVersionTokenResult("v1");
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.fromCache).toBe(true);
      expect(second.value.token).toBe(first.value.token);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // v2 has its own namespace: a separate acquisition happens.
    await getVersionTokenResult("v2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const v1Status = getTokenStatus("v1");
    expect(v1Status.cached).toBe(true);
    // Sanitized: status never contains token material.
    expect(JSON.stringify(v1Status)).not.toMatch(/tok-for/);
  });

  it("v1 success coexists with v2 failure and vice versa", async () => {
    stubCreds("V1", true);
    stubCreds("V2", false);
    vi.stubGlobal("fetch", vi.fn(async () => tokenResponse({ access_token: "v1-tok", expires_in: 3600 })));
    expect((await getVersionTokenResult("v1", { forceRefresh: true })).ok).toBe(true);
    const v2 = await getVersionTokenResult("v2", { forceRefresh: true });
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.value.reason).toBe("missing_credentials");
    expect(credentialHint("v2")).toMatch(/PRIVATE_DAILYMOTION_API_KEY_V2/);
  });

  it("scope change invalidates the cached token", async () => {
    stubCreds("V2", true);
    vi.stubEnv("DAILYMOTION_API_SCOPE_V2", "bundle.public");
    const fetchMock = vi.fn(async () => tokenResponse({ access_token: "t1", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);
    await getVersionTokenResult("v2");
    vi.stubEnv("DAILYMOTION_API_SCOPE_V2", "video.read");
    await getVersionTokenResult("v2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
