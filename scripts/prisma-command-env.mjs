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
  // Canonical first, legacy fallback. Patch whichever var is effective so
  // Prisma CLI children inherit the timeout without rewriting env files.
  const canonical = process.env.DATABASE_URL_CONNECTION_STRING?.trim();
  const legacy = !canonical ? process.env.DATABASE_URL?.trim() : "";
  const sourceVar = canonical ? "DATABASE_URL_CONNECTION_STRING" : "DATABASE_URL";
  const rawDatabaseUrl = canonical || legacy;
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
  process.env[sourceVar] = databaseUrl.toString();

  // This applies only to Prisma CLI child processes launched by db:status/db:apply.
  // It follows Supabase's P1001 troubleshooting guidance without changing the
  // operator's stored values, target host, credentials, or project env files.
  console.log(
    `[INFO] Prisma command connection default applied: connect_timeout=${timeoutSeconds} seconds (process-only; env file unchanged).`
  );
}
