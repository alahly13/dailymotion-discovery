// Administrator Authentication & Sign Out Security Test Suite (2026)
//
// Verifies:
// 1. Valid admin session verification.
// 2. Missing session fails closed.
// 3. Expired session rejection.
// 4. Invalid or tampered session token rejection.
// 5. Non-admin credentials rejection.
// 6. Sign-out route returns maxAge: 0, clears dm_admin_session, and sets Cache-Control: no-store.

import { afterEach, describe, expect, it, vi } from "vitest";

const cookieStoreMock = {
  get: vi.fn(),
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: async () => cookieStoreMock,
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  cookieStoreMock.get.mockReset();
  cookieStoreMock.set.mockReset();
});

async function loadAdminModule() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  vi.stubEnv("ADMIN_DEFAULT_USERNAME", "asdy");
  vi.stubEnv("ADMIN_INITIAL_PASSWORD", "secretPassword123");
  vi.stubEnv("ADMIN_SESSION_SECRET", "super-secret-key-at-least-32-chars-long!!");
  vi.stubEnv("ADMIN_SESSION_TTL_SECONDS", "604800");
  return import("../session");
}

describe("Admin Session & Logout Security", () => {
  it("creates and verifies valid 7-day admin session", async () => {
    const mod = await loadAdminModule();
    const token = mod.createAdminSession("asdy");
    expect(token).not.toBeNull();

    const verified = mod.verifyAdminSession(token);
    expect(verified).not.toBeNull();
    expect(verified!.username).toBe("asdy");
    expect(verified!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("fails closed when session token is missing", async () => {
    const mod = await loadAdminModule();
    expect(mod.verifyAdminSession(undefined)).toBeNull();
    expect(mod.verifyAdminSession(null)).toBeNull();
    expect(mod.verifyAdminSession("")).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const mod = await loadAdminModule();
    // Simulate expired payload
    const expiredPayload = { u: "asdy", exp: Math.floor(Date.now() / 1000) - 10 };
    const encoded = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    // Sign with valid secret
    const crypto = await import("node:crypto");
    const sig = crypto.createHmac("sha256", "super-secret-key-at-least-32-chars-long!!").update(encoded).digest("base64url");
    const expiredToken = `${encoded}.${sig}`;

    const verified = mod.verifyAdminSession(expiredToken);
    expect(verified).toBeNull();
  });

  it("rejects tampered or forged tokens", async () => {
    const mod = await loadAdminModule();
    const validToken = mod.createAdminSession("asdy")!;
    const [payload] = validToken.split(".");

    expect(mod.verifyAdminSession(`${payload}.forgedSignature123`)).toBeNull();
    expect(mod.verifyAdminSession("gibberish.token.shape")).toBeNull();
  });

  it("rejects non-admin credentials", async () => {
    const mod = await loadAdminModule();
    expect(mod.verifyAdminCredentials("asdy", "secretPassword123")).toBe(true);
    expect(mod.verifyAdminCredentials("attacker", "secretPassword123")).toBe(false);
    expect(mod.verifyAdminCredentials("asdy", "wrongPassword")).toBe(false);
  });

  it("handles sign-out route response with cookie clearance and no-store headers", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const logoutRoute = await import("@/app/api/admin/logout/route");
    const response = await logoutRoute.POST();

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);

    // Verify Cache-Control: no-store
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Pragma")).toBe("no-cache");

    // Verify Set-Cookie clears dm_admin_session with maxAge: 0
    const cookieHeader = response.headers.get("set-cookie");
    expect(cookieHeader).toContain("dm_admin_session=");
    expect(cookieHeader).toContain("Max-Age=0");
  });
});
