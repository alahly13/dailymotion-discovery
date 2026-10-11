import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

async function loadAdmin() {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  vi.stubEnv("ADMIN_DEFAULT_USERNAME", "admin");
  vi.stubEnv("ADMIN_INITIAL_PASSWORD", "correct-horse");
  vi.stubEnv("ADMIN_SESSION_SECRET", "test-secret-at-least-32-chars-long!!");
  vi.stubEnv("ADMIN_SESSION_TTL_SECONDS", "604800");
  return import("../../admin/session");
}

describe("admin session", () => {
  it("round-trips sign and verify within TTL", async () => {
    const mod = await loadAdmin();
    const token = mod.createAdminSession("admin");
    expect(token).toMatch(/.+\..+/);
    const session = mod.verifyAdminSession(token);
    expect(session?.username).toBe("admin");
    expect(session!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("accepts valid credentials and rejects wrong ones", async () => {
    const mod = await loadAdmin();
    expect(mod.verifyAdminCredentials("admin", "correct-horse")).toBe(true);
    expect(mod.verifyAdminCredentials("admin", "wrong")).toBe(false);
    expect(mod.verifyAdminCredentials("root", "correct-horse")).toBe(false);
  });

  it("rejects tampered tokens", async () => {
    const mod = await loadAdmin();
    const token = mod.createAdminSession("admin")!;
    const [payload] = token.split(".");
    expect(mod.verifyAdminSession(`${payload}.tamperedsignature`)).toBeNull();
    expect(mod.verifyAdminSession("garbage")).toBeNull();
    expect(mod.verifyAdminSession(null)).toBeNull();
  });

  it("reports unconfigured state when secrets are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    vi.stubEnv("ADMIN_INITIAL_PASSWORD", "");
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    const mod = await import("../../admin/session");
    expect(mod.isAdminConfigured()).toBe(false);
    expect(mod.verifyAdminCredentials("admin", "x")).toBe(false);
    expect(mod.createAdminSession("admin")).toBeNull();
  });
});
