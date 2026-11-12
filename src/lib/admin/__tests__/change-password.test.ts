import { describe, expect, it, vi, beforeEach } from "vitest";

function stubAdminEnv() {
  vi.stubEnv("ADMIN_DEFAULT_USERNAME", "asdy");
  vi.stubEnv("ADMIN_INITIAL_PASSWORD", "pw-for-tests");
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-at-least-32-chars-long!!");
  vi.stubEnv("ADMIN_SESSION_TTL_SECONDS", "604800");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: vi.fn(),
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ __json: body, status: init?.status ?? 200 }),
  },
}));

beforeEach(() => {
  vi.resetModules();
  stubAdminEnv();
});

describe("administrator identity resolution", () => {
  it("resolves asdy and canonical email to asdy@dailymotion.discov.com", async () => {
    stubAdminEnv();
    const { resolveAdminEmail, CANONICAL_ADMIN_USERNAME, CANONICAL_ADMIN_EMAIL } = await import("../session");
    expect(CANONICAL_ADMIN_USERNAME).toBe("asdy");
    expect(CANONICAL_ADMIN_EMAIL).toBe("asdy@dailymotion.discov.com");

    expect(resolveAdminEmail("asdy")).toBe("asdy@dailymotion.discov.com");
    expect(resolveAdminEmail("ASDY")).toBe("asdy@dailymotion.discov.com");
    expect(resolveAdminEmail("asdy@dailymotion.discov.com")).toBe("asdy@dailymotion.discov.com");
    expect(resolveAdminEmail("admin")).toBe("asdy@dailymotion.discov.com");
    expect(resolveAdminEmail("unknown-user")).toBeNull();
    expect(resolveAdminEmail("hacker@evil.com")).toBeNull();
  });
});

describe("POST /api/admin/change-password contract", () => {
  it("fails closed when unauthenticated", async () => {
    stubAdminEnv();
    const { POST } = await import("@/app/api/admin/change-password/route");
    const req = new Request("http://localhost:3000/api/admin/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "old-password-123",
        newPassword: "new-secure-password-456",
        confirmPassword: "new-secure-password-456",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
