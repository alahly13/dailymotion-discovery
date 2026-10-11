# Migration registry

## Schema migrations (Prisma — immutable once applied)

| Directory | Purpose | Status |
|---|---|---|
| `20260506_channel_deep_fetch_history_persistence_foundation` | Channel deep-fetch persistence foundation (sources, videos, manifests, jobs, windows, attempts, snapshots, events) | Applied (per project ledger; verify with `npm run db:status` when reachable) |
| `20261011183739_workspace_cloud_persistence` | Token cache, search history, batch commits, data-migration ledger, storage registry; saved-video provenance/ordering; video resource types | Pending — review SQL, then guarded apply |

## Data migrations (application — registry `scripts/data-migrations/registry.ts`)

| Key | Purpose | Status |
|---|---|---|
| *(none registered)* | — | No JSON/data conversions required yet |

## Naming rules

- Schema: `{Prisma UTC timestamp}_snake_case_description` (CLI-generated;
  hand-authored only when the DB is unreachable, with real UTC time).
- Data: `{UTC timestamp}_snake_case_description.ts`, unique key = filename.
- Never `migration_new`, `final_migration`, or rewrites of applied history.
