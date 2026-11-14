/**
 * Centralized Server-Side Authorization & Owner Identity Service (2026)
 *
 * What this controls:
 * 1. Single authoritative administrator identity mapping for `asdy` -> `asdy@dailymotion.discov.com`.
 * 2. Immutable Supabase User UUID resolution for owner scoping across IndexedDB, PostgreSQL, and Cloudflare R2.
 * 3. Prevention of client-side role forgery (never trust `isAdmin`, `ownerId`, or `storagePath` from browser).
 *
 * Scope: Server-side and shared authorization logic.
 */

export const CANONICAL_ADMIN_USERNAME = "asdy";
export const CANONICAL_ADMIN_EMAIL = "asdy@dailymotion.discov.com";

const SAFE_OWNER_ID_REGEX = /^[a-z0-9][a-z0-9._-]{0,127}$/;

/**
 * Returns the configured administrator email from environment or canonical fallback.
 */
export function getConfiguredAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || CANONICAL_ADMIN_EMAIL).trim().toLowerCase();
}

/**
 * Returns the configured administrator username from environment or canonical fallback.
 */
export function getConfiguredAdminUsername(): string {
  return (process.env.ADMIN_DEFAULT_USERNAME || CANONICAL_ADMIN_USERNAME).trim().toLowerCase();
}

/**
 * Resolves a login identifier (username or email) into the authoritative Supabase Auth email.
 * Accepts "asdy", "asdy@dailymotion.discov.com", or legacy "admin" (test environments).
 */
export function resolveUserIdentifier(input: string): string {
  const normalized = (input || "").trim().toLowerCase();
  const canonicalEmail = getConfiguredAdminEmail();
  const canonicalUsername = getConfiguredAdminUsername();

  const validAdminAliases = [
    canonicalUsername,
    canonicalEmail,
    CANONICAL_ADMIN_USERNAME.toLowerCase(),
    CANONICAL_ADMIN_EMAIL.toLowerCase(),
    "admin",
  ];

  if (validAdminAliases.includes(normalized)) {
    return canonicalEmail;
  }

  return normalized;
}

/**
 * Server-verified administrator check.
 * Strictly checks the verified Supabase Auth user email against the canonical admin identity.
 * Never trusts a client-supplied `isAdmin` boolean or username.
 */
export function isUserAdmin(user: { id?: string; email?: string | null } | null | undefined): boolean {
  if (!user || !user.email) return false;
  const userEmail = user.email.trim().toLowerCase();
  const canonicalEmail = getConfiguredAdminEmail();
  return userEmail === canonicalEmail;
}

/**
 * Resolves the immutable Supabase User UUID as the authoritative owner identifier.
 * Ensures the identifier is safe for path interpolation and owner partitioning.
 */
export function resolveAuthoritativeOwnerId(
  user: { id: string; email?: string | null } | null | undefined,
  fallbackId?: string
): string {
  const rawId = (user?.id || fallbackId || "").trim().toLowerCase();
  if (!rawId) {
    throw new Error("Unable to resolve authoritative owner identifier: user is not authenticated.");
  }

  const clean = rawId.replace(/[^a-z0-9._-]/g, "-");
  if (!SAFE_OWNER_ID_REGEX.test(clean)) {
    throw new Error(`Authoritative owner identifier "${rawId}" does not conform to safe storage segment rules.`);
  }

  return clean;
}
