// Canonical database connection resolution.
//
// What this controls: which connection string Prisma (runtime + CLI) uses.
// Canonical: DATABASE_URL_CONNECTION_STRING (Session Pooler, port 5432).
// Migration/introspection: DATABASE_URL_DIRECT (optional; may be the same
// pooler URL — the name does not prove a literal direct host is required).
// Backward compat: legacy DATABASE_URL is honored with a one-time sanitized
// warning; canonical wins when both are set. Removal plan in .env.example.
// Values are never printed. Scope: server + scripts.

let warnedLegacyDbUrl = false;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function warnOnce(message: string): void {
  if (!warnedLegacyDbUrl) {
    warnedLegacyDbUrl = true;
    console.warn(message);
  }
}

/** Runtime connection string. Throws a sanitized actionable error if none. */
export function resolveDatabaseUrl(): string {
  const canonical = clean(process.env.DATABASE_URL_CONNECTION_STRING);
  if (canonical) return canonical;
  const legacy = clean(process.env.DATABASE_URL);
  if (legacy) {
    warnOnce(
      "[WARN] DATABASE_URL is deprecated; use DATABASE_URL_CONNECTION_STRING. " +
        "Canonical wins when both are set. Removal planned — see .env.example."
    );
    return legacy;
  }
  throw new Error(
    "Missing database connection string. Set DATABASE_URL_CONNECTION_STRING " +
      "(Supabase Session Pooler, port 5432). See .env.example."
  );
}

/** Optional separate migration/introspection connection (may be unset). */
export function resolveDirectDatabaseUrl(): string | null {
  const direct = clean(process.env.DATABASE_URL_DIRECT);
  return direct || null;
}

/** Test seam: reset one-time warnings. */
export function resetDbEnvWarnings(): void {
  warnedLegacyDbUrl = false;
}
