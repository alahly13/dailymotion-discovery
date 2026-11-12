import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDbEnvWarnings, resolveDatabaseUrl } from "../database-url";

afterEach(() => {
  resetDbEnvWarnings();
  vi.unstubAllEnvs();
});

describe("canonical database connection resolution", () => {
  it("uses DATABASE_URL as the primary connection", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://primary:5432/x");
    vi.stubEnv("SUPABASE_DATABASE_URL_CONNECTION_STRING", "postgresql://backup:5432/y");
    expect(resolveDatabaseUrl()).toBe("postgresql://primary:5432/x");
  });

  it("uses the documented backup only when the primary is missing", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SUPABASE_DATABASE_URL_CONNECTION_STRING", "postgresql://backup:5432/y");
    expect(resolveDatabaseUrl()).toBe("postgresql://backup:5432/y");
  });

  it("throws a sanitized actionable error when nothing is set", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("SUPABASE_DATABASE_URL_CONNECTION_STRING", "");
    expect(() => resolveDatabaseUrl()).toThrow(/DATABASE_URL/);
  });
});
