import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieGet = vi.fn();
const cookieGetAll = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: cookieGet,
    getAll: cookieGetAll,
  }),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      __json: body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
      cookies: {
        set: vi.fn(),
      },
    }),
  },
}));

describe("Unified Session Synchronization", () => {
  beforeEach(() => {
    vi.resetModules();
    cookieGet.mockReset();
    cookieGetAll.mockReset();
    cookieGetAll.mockReturnValue([]);
  });

  it("authorizes admin via HMAC cookie when present", async () => {
    vi.stubEnv("ADMIN_DEFAULT_USERNAME", "admin");
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-at-least-32-chars-long!!");
    vi.stubEnv("ADMIN_SESSION_TTL_SECONDS", "604800");

    const sessionMod = await import("../../admin/session");
    const gateMod = await import("../../admin/require-admin");

    const token = sessionMod.createAdminSession("admin")!;
    cookieGet.mockReturnValue({ value: token });

    const admin = await gateMod.getAdminIdentity();
    expect(admin).not.toBeNull();
    expect(admin?.username).toBe("admin");
    expect(admin?.authSource).toBe("admin_hmac");

    const gate = await gateMod.requireAdmin();
    expect(gate.ok).toBe(true);
  });

  it("fails closed when neither HMAC cookie nor Supabase session exists", async () => {
    vi.stubEnv("ADMIN_DEFAULT_USERNAME", "admin");
    vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-at-least-32-chars-long!!");

    const gateMod = await import("../../admin/require-admin");
    cookieGet.mockReturnValue(undefined);
    cookieGetAll.mockReturnValue([]);

    const admin = await gateMod.getAdminIdentity();
    expect(admin).toBeNull();

    const gate = await gateMod.requireAdmin();
    expect(gate.ok).toBe(false);
  });
});
