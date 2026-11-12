const DEFAULT_CONNECT_TIMEOUT_SECONDS = "30";

function isPostgresProtocol(protocol = "") {
  return protocol === "postgres:" || protocol === "postgresql:";
}

function readConnectTimeoutSeconds() {
  const configured = process.env.PRISMA_CONNECT_TIMEOUT_SECONDS?.trim();
  if (configured && /^\d+$/.test(configured) && Number(configured) > 0) {
    return configured;
  }

  return DEFAULT_CONNECT_TIMEOUT_SECONDS;
}

export function applyPrismaCommandConnectionDefaults() {
  // Patch the effective primary var only. The documented backup is mirrored
  // into DATABASE_URL for CLI children with a loud warning when the primary
  // is missing (transparent, never silent).
  let sourceVar = "DATABASE_URL";
  let rawDatabaseUrl = process.env.DATABASE_URL?.trim();
  if (!rawDatabaseUrl) {
    const backup = process.env.SUPABASE_DATABASE_URL_CONNECTION_STRING?.trim();
    if (backup) {
      console.warn("[WARN] Mirroring backup SUPABASE_DATABASE_URL_CONNECTION_STRING into DATABASE_URL for this Prisma CLI invocation only (env file unchanged). Set DATABASE_URL as primary.");
      process.env.DATABASE_URL = backup;
      rawDatabaseUrl = backup;
      sourceVar = "DATABASE_URL (mirrored backup)";
    }
  }
  if (!rawDatabaseUrl) return;

  let databaseUrl;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    return;
  }

  if (!isPostgresProtocol(databaseUrl.protocol) || databaseUrl.searchParams.has("connect_timeout")) {
    return;
  }

  const timeoutSeconds = readConnectTimeoutSeconds();
  databaseUrl.searchParams.set("connect_timeout", timeoutSeconds);
  process.env.DATABASE_URL = databaseUrl.toString();

  // This applies only to Prisma CLI child processes launched by db:status/db:apply.
  console.log(
    `[INFO] Prisma command connection default applied to ${sourceVar}: connect_timeout=${timeoutSeconds} seconds (process-only; env file unchanged).`
  );
}
