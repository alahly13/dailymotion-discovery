import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { defineConfig } from "prisma/config";

const envFiles = [".env.local", ".env", ".env.development", ".env.production"]
  .map((name) => path.join(process.cwd(), name))
  .filter((candidate) => existsSync(candidate));

if (envFiles.length > 0) {
  loadDotenv({ path: envFiles, override: false, quiet: true });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Canonical runtime/CLI connection: DATABASE_URL_CONNECTION_STRING
    // (Supabase Session Pooler, port 5432). Legacy DATABASE_URL is honored
    // as a fallback during migration; canonical wins when both are set.
    // Supabase direct hosts can fail in IPv4-limited environments.
    url: process.env.DATABASE_URL_CONNECTION_STRING?.trim() || process.env.DATABASE_URL?.trim() || "",
  },
});
