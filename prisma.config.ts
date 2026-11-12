import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

// Load canonical project env files (.env primary; .env.local is intentionally not
// created in this workspace). Process environment variables set by CI/hosting win.
const envFiles = [".env", ".env.development", ".env.production"]
  .map((name) => path.join(process.cwd(), name))
  .filter((candidate) => existsSync(candidate));

if (envFiles.length > 0) {
  loadDotenv({ path: envFiles, override: false, quiet: true });
}

/**
 * Resolves the canonical Postgres URL for Prisma ORM 7 CLI & migrations.
 * Primary: DATABASE_URL. Backup: SUPABASE_DATABASE_URL_CONNECTION_STRING.
 * Never logs or exposes credentials.
 */
function resolvePrismaCliDatabaseUrl(): string {
  const primary = process.env.DATABASE_URL?.trim();
  if (primary) {
    return primary;
  }

  const backup = process.env.SUPABASE_DATABASE_URL_CONNECTION_STRING?.trim();
  if (backup) {
    console.warn(
      "[prisma.config] Using SUPABASE_DATABASE_URL_CONNECTION_STRING backup because DATABASE_URL is unset.",
    );
    return backup;
  }

  return "";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: resolvePrismaCliDatabaseUrl(),
  },
});
