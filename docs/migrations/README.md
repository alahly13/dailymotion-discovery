# Migrations — README

Beginner-friendly guide to the two independent migration systems.

## The two systems (never mixed)

1. **PostgreSQL schema migrations** — `prisma/migrations/`, owned by Prisma
   Migrate. Timestamped directories (`{UTC}_description/migration.sql`),
   immutable once applied, tracked in `_prisma_migrations`. The baseline
   `20260506_channel_deep_fetch_history_persistence_foundation` is applied —
   never rename or rewrite it.
2. **Application JSON/data migrations** — `scripts/data-migrations/`
   (`{UTC}_description.ts` + `registry.ts`), tracked in `data_migration_runs`.
   These import/transform data only; they never change schema.

## Which connection string is used

- Runtime + CLI: `DATABASE_URL_CONNECTION_STRING` (legacy `DATABASE_URL`
  fallback with warning). Diagnose with `npm run db:diagnose` (DNS, TCP,
  auth, Prisma, migrate-status layers — read-only, sanitized).
- Operator intent: Free Tier **direct IPv6** (`db.<ref>.supabase.co:5432`)
  locally and for migrations. Requires working IPv6 egress on the machine
  running the command — the diagnose script's `egressControl` layer proves
  this with a control probe, so a failure is attributed correctly.
- If IPv6 egress is unavailable, use the Session Pooler URL **in the same
  variable** (per-environment values, no code change). Pooler usernames
  differ (`postgres.<ref>`); copy the exact host from Dashboard → Connect.
- Production (Vercel): IPv6 egress NOT verified from here. Supabase's
  official serverless guidance prescribes the shared pooler; use the pooler
  URL in Vercel's `DATABASE_URL_CONNECTION_STRING` unless you verify IPv6
  egress on Vercel yourself. Never point any variable at another project.
- Optional `DATABASE_URL_DIRECT` is only for migration/introspection when the
  pooler cannot do the job; the name alone never proves a direct host is
  needed. Never add a second runtime pool without a verified reason.
- Passwords with `# @ ? / $` must be percent-encoded.

## What SUPABASE_SECRET_KEY does

Server-only Supabase SDK access (private Storage bucket). It does not log
you in, does not replace the admin session, and must never enter browser
code. Legacy `SUPABASE_SERVICE_ROLE_KEY` is retired (not a fallback).

## Prisma vs Supabase SDK

- Prisma: relational CRUD, constraints, transactions, schema migrations.
- Supabase SDK: private Storage objects (JSON snapshots/exports).
- The batch orchestrator coordinates both; they share no atomic transaction
  (see recovery.md).

## Verify connectivity

- `npm run db:validate` — config shapes, sanitized host info.
- `npm run db:status` — SELECT 1 preflight + `migrate status` (applied,
  pending, failed).
- `npm run supabase:storage:check` — bucket exists/private + self-cleaning
  probe upload/read/delete. Creates nothing except its own probe object,
  which it deletes.
- `/admin/migrations` (admin sign-in) — schema + data-migration status UI.

## Create a schema migration

1. `npm run db:status` — confirm connectivity + history.
2. Edit `prisma/schema.prisma`.
3. `npx prisma migrate dev --create-only` (or with DB: `migrate dev -n desc`).
4. Review the SQL. Group related changes; never edit applied migrations.
5. `CONFIRM_DB_APPLY=true npm run db:apply` (guarded; production-like hosts
   refuse without confirmation), then `npm run db:status` again.

## Run a data migration

1. Register it in `scripts/data-migrations/registry.ts`.
2. Dry-run first; review planned counts.
3. Run; reruns resume from `lastCheckpoint` and never duplicate.
4. Verify; only then record completion.

## Recovery

See `recovery.md`. Rule of thumb: staged Storage objects without a DB
pointer are orphaned-but-harmless (separate cleanup only); same-key batch
retries replay recorded results; never rewrite applied Prisma history.

## Vercel variables

Set in Project Settings → Environment Variables (never in code):
`DATABASE_URL_CONNECTION_STRING`, `SUPABASE_SECRET_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, Dailymotion keys, `ADMIN_*`. **Redeploy after
changing any variable** — values are read at build/boot.
