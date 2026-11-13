# Database Migrations Guide — Dailymotion Discovery (2026)

This document details the database migration lifecycle, migration tracking, safety policies, and status verification workflows for **Dailymotion Discovery**.

---

## 1. Migration History & Canonical Status

All migrations are tracked in the database within `public._prisma_migrations` and located on disk in `prisma/migrations/`.

### Verified Applied Migrations

| Migration Name | Applied Date | Applied Steps | Key Schema Objects Introduced |
|---|---|---|---|
| `20260506_channel_deep_fetch_history_persistence_foundation` | 2026-11-13 | 1 | `video_sources`, `videos`, `manifests`, `manifest_items`, `fetch_jobs`, `fetch_windows`, `fetch_page_attempts`, `source_catalog_snapshots`, `fetch_job_events`, `collections`, `saved_videos`, and all enums (`manifest_type`, `fetch_profile`, etc.) |
| `20261011183739_workspace_cloud_persistence` | 2026-11-13 | 1 | `api_version_token_caches`, `search_histories`, `batch_commits`, `data_migration_runs`, `storage_documents` |
| `20261112000000_r2_generations_and_presets` | 2026-11-13 | 1 | `saved_search_presets`, `research_collections`, `research_collection_items`, `storage_datasets`, `storage_generations`, `storage_manifest_parts`, plus `manifest_storage_path` column on `batch_commits` |

**Verification Status**: All 3 migrations have been applied and verified against the live Supabase Session Pooler (`aws-0-eu-west-2.pooler.supabase.com:5432`). Zero pending migrations remain.

---

## 2. Safety Rules & Non-Destructive Policy

1. **NEVER Run `prisma migrate reset`**:
   `prisma migrate reset` drops the entire database. It is strictly prohibited in production, staging, and shared environments.
2. **Forward-Only SQL DDL**:
   Schema evolution is strictly additive. Columns and tables may be added or broadened; deprecations follow a multi-step soft deprecation path.
3. **Canonical Pooler Connectivity**:
   Migrations must be applied through the Supabase Session Pooler (`:5432`) using `DATABASE_URL`.
4. **Preflight Health Probes**:
   The migration execution runner (`scripts/apply-supabase-migrations.mjs`) executes connectivity preflight checks before running DDL transactions.

---

## 3. Operational CLI Commands

### Inspect Database & Migration Status
```bash
# Validates database configuration and queries migration status:
npm run db:status
```

### Validate Prisma Schema & Database Connectivity
```bash
# Validates schema.prisma syntax and database environment:
npm run db:validate
```

### Deploy Migrations Safely (When New Migrations are Created)
```bash
# Executes migrations with explicit operator confirmation guard:
CONFIRM_DB_APPLY="true" npm run db:apply
```

### Create a New Migration (Development Only)
```bash
# Generates a new migration SQL file without applying it immediately:
npm run db:create-migration -- --name descriptive_migration_name
```

---

## 4. Disaster Recovery & Rollback Protocol

- If a migration statement fails, the transaction runner rolls back the transaction.
- In the event of a required reversal, author an additive corrective migration (e.g., `20261114_revert_...`) rather than altering historical migration records in `_prisma_migrations`.
