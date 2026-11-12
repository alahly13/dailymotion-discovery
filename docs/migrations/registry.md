# Migration Registry (Prisma ORM 7.10.1)

## Schema Migrations (`prisma/migrations/`)

| Directory | Purpose | Status |
|---|---|---|
| `20260506_channel_deep_fetch_history_persistence_foundation` | Initial 11-table schema for `VideoSource`, `Video`, `Manifest`, `ManifestItem`, `FetchJob`, `FetchWindow`, `FetchPageAttempt`, `SourceCatalogSnapshot`, and `FetchJobEvent` | Committed |
| `20261011183739_workspace_cloud_persistence` | Added `Collection`, `SavedVideo`, `SearchHistory`, `BatchCommit`, `DataMigrationRun`, `StorageDocument`, and `ApiVersionTokenCache` + RLS | Committed (apply via `CONFIRM_DB_APPLY=true npm run db:apply` once target DB pooler tenant is reachable) |

## Application Data Migrations (`scripts/data-migrations/registry.ts`)

| Key | Purpose | Status |
|---|---|---|
| *(none registered)* | Tracked in `DataMigrationRun` | Ready for future backfills |

## Naming Rules

- Schema migrations: `{YYYYMMDDHHMMSS}_snake_case_description` under `prisma/migrations/`
- Data migrations: `{UTC_timestamp}_snake_case_description.ts`
- Never rename or rewrite already-applied migration directories
