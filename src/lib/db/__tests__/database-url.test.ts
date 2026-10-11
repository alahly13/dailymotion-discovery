import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDbEnvWarnings, resolveDatabaseUrl, resolveDirectDatabaseUrl } from "../database-url";

afterEach(() => {
  resetDbEnvWarnings();
  vi.unstubAllEnvs();
});

describe("canonical database connection resolution", () => {
  it("prefers DATABASE_URL_CONNECTION_STRING when both are set", () => {
    vi.stubEnv("DATABASE_URL_CONNECTION_STRING", "postgresql://a:5432/x");
    vi.stubEnv("DATABASE_URL", "postgresql://b:5432/y");
    expect(resolveDatabaseUrl()).toBe("postgresql://a:5432/x");
  });

  it("falls back to legacy DATABASE_URL (never breaks deploys)", () => {
    vi.stubEnv("DATABASE_URL_CONNECTION_STRING", "");
    vi.stubEnv("DATABASE_URL", "postgresql://legacy:5432/db");
    expect(resolveDatabaseUrl()).toBe("postgresql://legacy:5432/db");
  });

  it("throws a sanitized actionable error when nothing is set", () => {
    vi.stubEnv("DATABASE_URL_CONNECTION_STRING", "");
    vi.stubEnv("DATABASE_URL", "");
    expect(() => resolveDatabaseUrl()).toThrow(/DATABASE_URL_CONNECTION_STRING/);
  });

  it("treats DATABASE_URL_DIRECT as optional", () => {
    vi.stubEnv("DATABASE_URL_DIRECT", "");
    expect(resolveDirectDatabaseUrl()).toBeNull();
    vi.stubEnv("DATABASE_URL_DIRECT", "postgresql://direct:5432/db");
    expect(resolveDirectDatabaseUrl()).toBe("postgresql://direct:5432/db");
  });
});
