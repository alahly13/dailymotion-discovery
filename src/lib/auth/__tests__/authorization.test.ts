import { describe, expect, it } from "vitest";
import {
  CANONICAL_ADMIN_EMAIL,
  CANONICAL_ADMIN_USERNAME,
  isUserAdmin,
  resolveAuthoritativeOwnerId,
  resolveUserIdentifier,
} from "../authorization";

describe("Server-Side Authorization & Administrator Security", () => {
  it("resolves canonical administrator aliases to the authoritative Supabase email", () => {
    expect(resolveUserIdentifier("asdy")).toBe(CANONICAL_ADMIN_EMAIL);
    expect(resolveUserIdentifier("asdy@dailymotion.discov.com")).toBe(CANONICAL_ADMIN_EMAIL);
    expect(resolveUserIdentifier("admin")).toBe(CANONICAL_ADMIN_EMAIL);
    expect(resolveUserIdentifier("ASDY")).toBe(CANONICAL_ADMIN_EMAIL);
    expect(resolveUserIdentifier("  asdy  ")).toBe(CANONICAL_ADMIN_EMAIL);
  });

  it("normalizes arbitrary user emails without granting administrator mapping", () => {
    expect(resolveUserIdentifier("researcher@university.edu")).toBe("researcher@university.edu");
    expect(resolveUserIdentifier("user123@gmail.com")).toBe("user123@gmail.com");
  });

  it("authoritatively verifies administrator identity by email (never trusting client flags)", () => {
    expect(isUserAdmin({ id: "user-1", email: CANONICAL_ADMIN_EMAIL })).toBe(true);
    expect(isUserAdmin({ id: "user-2", email: "ASDY@DAILYMOTION.DISCOV.COM" })).toBe(true);

    // Regular authenticated users must never gain admin permissions
    expect(isUserAdmin({ id: "user-3", email: "other@example.com" })).toBe(false);
    expect(isUserAdmin({ id: "user-4", email: null })).toBe(false);
    expect(isUserAdmin(null)).toBe(false);
    expect(isUserAdmin(undefined)).toBe(false);
  });

  it("resolves immutable Supabase user UUID as authoritative owner ID", () => {
    const validUuid = "d1b7a2e0-84c1-4b72-91a5-83f17d21b452";
    expect(resolveAuthoritativeOwnerId({ id: validUuid, email: "user@example.com" })).toBe(validUuid);

    // Safe segment normalization
    expect(resolveAuthoritativeOwnerId({ id: "User_123.ABC-99", email: "user@example.com" })).toBe(
      "user_123.abc-99"
    );
  });

  it("fails closed on missing, unauthenticated, or traversal owner identifiers", () => {
    expect(() => resolveAuthoritativeOwnerId(null)).toThrow(/not authenticated/);
    expect(() => resolveAuthoritativeOwnerId({ id: "", email: "test@example.com" })).toThrow(
      /not authenticated/
    );
  });
});
