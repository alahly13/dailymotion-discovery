// Application JSON/data migration registry (NOT Prisma schema migrations).
//
// Each data migration: unique UTC-timestamped file
//   scripts/data-migrations/{YYYYMMDDHHMMSS}_descriptive_name.ts
// exporting a DataMigration definition below, registered in REGISTRY.
// State lives in the data_migration_runs table (resumable, rerunnable).
// Schema changes NEVER live here — see prisma/migrations/.

export type DataMigrationStatus = "pending" | "running" | "completed" | "failed";

export interface DataMigrationCounters {
  source: number;
  imported: number;
  merged: number;
  skipped: number;
  failed: number;
  verified: number;
}

export interface DataMigration {
  /** Unique stable id = filename without extension. */
  migrationKey: string;
  purpose: string;
  sourceDomain: string;
  targetVersion: string;
  /** Dry-run first: report planned changes without writing. */
  dryRun: () => Promise<DataMigrationCounters & { notes: string[] }>;
  /** Execute (idempotent, resumable via lastCheckpoint). */
  run: (checkpoint?: string | null) => Promise<DataMigrationCounters & { checkpoint: string | null }>;
  /** Post-run verification (counts, integrity). */
  verify: () => Promise<{ ok: boolean; notes: string[] }>;
}

// No data migrations registered yet. Add entries here when a real JSON/data
// conversion is needed; never pile duplicate scripts for one conversion.
export const REGISTRY: DataMigration[] = [];

export function getRegisteredMigrationKeys(): string[] {
  return REGISTRY.map((m) => m.migrationKey);
}
