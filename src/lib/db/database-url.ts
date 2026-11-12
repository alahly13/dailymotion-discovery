// Canonical database connection resolution.
//
// Primary: DATABASE_URL (Supabase Session Pooler PostgreSQL connection).
// Backup: SUPABASE_DATABASE_URL_CONNECTION_STRING (direct connection,
// reserved for explicit alternate use). The backup never silently replaces
// the primary: it applies only when DATABASE_URL is missing, with a loud
// warning naming both variables. Removal plan for the fallback lives in
// .env.example. Values are never printed. Scope: server + scripts.

let warnedBackup = false;

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

/** Primary connection string. Throws a sanitized actionable error if none. */
export function resolveDatabaseUrl(): string {
  const primary = clean(process.env.DATABASE_URL);
  if (primary) return primary;
  const backup = clean(process.env.SUPABASE_DATABASE_URL_CONNECTION_STRING);
  if (backup) {
    if (!warnedBackup) {
      warnedBackup = true;
      console.warn(
        "[WARN] DATABASE_URL is missing; using backup SUPABASE_DATABASE_URL_CONNECTION_STRING. " +
          "Set DATABASE_URL as the primary connection. See .env.example."
      );
    }
    return backup;
  }
  throw new Error(
    "Missing database connection string. Set DATABASE_URL " +
      "(Supabase Session Pooler). See .env.example."
  );
}

/** Test seam: reset one-time warnings. */
export function resetDbEnvWarnings(): void {
  warnedBackup = false;
}
