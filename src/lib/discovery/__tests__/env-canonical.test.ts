import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Canonical environment contract: every production variable must be
// represented in .env.example with safe (non-secret) values.
const EXAMPLE = readFileSync(resolve(__dirname, "../../../../.env.example"), "utf8");

function hasVar(name: string): boolean {
  return new RegExp(`^#?\\s*${name}=`, "m").test(EXAMPLE);
}

const CANONICAL = [
  "DAILYMOTION_API_BASE_URL_V1",
  "DAILYMOTION_PARTNER_API_BASE_URL_V1",
  "PRIVATE_DAILYMOTION_API_KEY_V1",
  "PRIVATE_DAILYMOTION_API_KEY_SECRET_V1",
  "DAILYMOTION_OAUTH_TOKEN_URL_V1",
  "DAILYMOTION_API_SCOPE_V1",
  "DAILYMOTION_API_BASE_URL_V2",
  "PRIVATE_DAILYMOTION_API_KEY_V2",
  "PRIVATE_DAILYMOTION_API_KEY_SECRET_V2",
  "DAILYMOTION_OAUTH_TOKEN_URL_V2",
  "DAILYMOTION_API_SCOPE_V2",
  "DAILYMOTION_FAMILY_FILTER",
  "DAILYMOTION_LOCALIZATION",
  "TOKEN_CACHE_ENCRYPTION_KEY",
  "TOKEN_CACHE_SAFETY_MARGIN_SECONDS",
  "DATABASE_URL_CONNECTION_STRING",
  "DATABASE_URL",
  "DATABASE_URL_DIRECT",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "GEMINI_API_KEY",
  "ADMIN_DEFAULT_USERNAME",
  "ADMIN_INITIAL_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "ADMIN_SESSION_TTL_SECONDS",
];

describe("canonical environment documentation", () => {
  it("represents every canonical variable in .env.example", () => {
    for (const name of CANONICAL) {
      expect(hasVar(name), name).toBe(true);
    }
  });

  it("pins canonical defaults (public/partner hosts, token URLs, scopes)", () => {
    expect(EXAMPLE).toContain('DAILYMOTION_API_BASE_URL_V1="https://api.dailymotion.com/"');
    expect(EXAMPLE).toContain('DAILYMOTION_PARTNER_API_BASE_URL_V1="https://partner.api.dailymotion.com/rest"');
    expect(EXAMPLE).toContain('DAILYMOTION_OAUTH_TOKEN_URL_V1="https://partner.api.dailymotion.com/oauth/v1/token"');
    expect(EXAMPLE).toContain('DAILYMOTION_API_SCOPE_V1="userinfo"');
    expect(EXAMPLE).toContain('DAILYMOTION_API_BASE_URL_V2="https://api.dailymotion.com/v2"');
    expect(EXAMPLE).toContain('DAILYMOTION_OAUTH_TOKEN_URL_V2="https://oauth2.dailymotion.com/v2/token"');
    expect(EXAMPLE).toContain('DAILYMOTION_API_SCOPE_V2="bundle.public"');
    expect(EXAMPLE).toContain('DAILYMOTION_FAMILY_FILTER="true"');
    expect(EXAMPLE).toContain('DAILYMOTION_LOCALIZATION="detect"');
  });

  it("keeps secrets empty and documents deprecated aliases", () => {
    for (const name of ["PRIVATE_DAILYMOTION_API_KEY_V1", "PRIVATE_DAILYMOTION_API_KEY_SECRET_V1", "PRIVATE_DAILYMOTION_API_KEY_V2", "PRIVATE_DAILYMOTION_API_KEY_SECRET_V2", "TOKEN_CACHE_ENCRYPTION_KEY"]) {
      expect(EXAMPLE).toContain(`${name}=""`);
    }
    expect(EXAMPLE).toMatch(/Deprecated aliases/);
  });
});
