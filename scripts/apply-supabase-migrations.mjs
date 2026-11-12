import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Client } from "pg";
import { loadProjectEnv } from "./load-project-env.mjs";

loadProjectEnv();

const migrationsDir = path.join(process.cwd(), "prisma", "migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    console.error("[ERROR] Missing DATABASE_URL.");
    process.exit(1);
  }

  console.log("[INFO] Connecting to Supabase PostgreSQL Session Pooler...");
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    console.log("[OK] Connected to Supabase PostgreSQL successfully!");

    // 1. Ensure _prisma_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log("[OK] Verified _prisma_migrations tracking table.");

    // 2. Fetch already-applied migrations
    const appliedRes = await client.query(`
      SELECT migration_name, checksum, finished_at 
      FROM "_prisma_migrations" 
      WHERE finished_at IS NOT NULL;
    `);
    const appliedMap = new Map(appliedRes.rows.map((r) => [r.migration_name, r]));

    // 3. Scan local migrations in order
    const migrationFolders = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(migrationsDir, d.name, "migration.sql")))
      .map((d) => d.name)
      .sort();

    console.log(`[INFO] Found ${migrationFolders.length} migration(s) in repository:`, migrationFolders);

    let appliedCount = 0;

    for (const folder of migrationFolders) {
      if (appliedMap.has(folder)) {
        console.log(`[SKIP] Already applied: ${folder}`);
        continue;
      }

      console.log(`[APPLYING] Applying migration: ${folder}...`);
      const sqlPath = path.join(migrationsDir, folder, "migration.sql");
      const sqlContent = fs.readFileSync(sqlPath, "utf8");
      const checksum = crypto.createHash("sha256").update(sqlContent).digest("hex");
      const migrationId = crypto.randomUUID();

      await client.query("BEGIN;");
      try {
        await client.query(
          `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "started_at") 
           VALUES ($1, $2, $3, now());`,
          [migrationId, checksum, folder]
        );

        // Execute migration SQL
        await client.query(sqlContent);

        await client.query(
          `UPDATE "_prisma_migrations" 
           SET "finished_at" = now(), "applied_steps_count" = 1 
           WHERE "id" = $1;`,
          [migrationId]
        );

        await client.query("COMMIT;");
        console.log(`[SUCCESS] Migration ${folder} applied successfully!`);
        appliedCount += 1;
      } catch (err) {
        await client.query("ROLLBACK;");
        console.error(`[FAILED] Migration ${folder} failed:`, err.message);
        throw err;
      }
    }

    console.log(`\n================================================================`);
    console.log(`[COMPLETE] Applied ${appliedCount} pending migration(s) successfully.`);

    // 4. Inspect final public tables in database
    const finalTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log("[CANONICAL TABLES] Tables now active in Supabase public schema:");
    for (const row of finalTables.rows) {
      console.log(`  - ${row.table_name}`);
    }
    console.log(`================================================================\n`);

    await client.end();
  } catch (err) {
    console.error("[FATAL ERROR] Migration deployment aborted:", err.message);
    try {
      await client.end();
    } catch {}
    process.exit(1);
  }
}

main();
