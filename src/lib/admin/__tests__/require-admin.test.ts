import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieGet = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ __json: body, status: init?.status ?? 200 }),
  },
}));

function stubAdminEnv() {
  vi.stubEnv("ADMIN_DEFAULT_USERNAME", "admin");
  vi.stubEnv("ADMIN_INITIAL_PASSWORD", "pw-for-tests");
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-at-least-32-chars-long!!");
  vi.stubEnv("ADMIN_SESSION_TTL_SECONDS", "604800");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
}

async function loadGate() {
  // Fresh modules per test so stubbed env is parsed at import time.
  const session = await import("../session");
  const gate = await import("../require-admin");
  return { ...session, ...gate };
}

beforeEach(() => {
  vi.resetModules();
  cookieGet.mockReset();
});

describe("admin route gating", () => {
  it("returns 401 without a session and identity with a valid cookie", async () => {
    stubAdminEnv();
    const { createAdminSession, requireAdmin, getAdminIdentity } = await loadGate();
    cookieGet.mockReturnValue(undefined);
    const denied = await requireAdmin();
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(401);

    const token = createAdminSession("admin");
    cookieGet.mockReturnValue({ value: token });
    const allowed = await requireAdmin();
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.admin.username).toBe("admin");
    expect(await getAdminIdentity()).not.toBeNull();
  });

  it("rejects forged cookies", async () => {
    stubAdminEnv();
    const { requireAdmin, getAdminIdentity } = await loadGate();
    cookieGet.mockReturnValue({ value: "forged.payload" });
    expect((await requireAdmin()).ok).toBe(false);
    expect(await getAdminIdentity()).toBeNull();
  });
});
