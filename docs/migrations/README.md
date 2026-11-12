# Database & Data Migrations (Prisma ORM 7.10.1)

PostgreSQL persistence runs on **Prisma ORM `7.10.1`** (`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`) configured via `prisma.config.ts` and `prisma/schema.prisma`.

---

## Canonical Layout

- **Schema**: `prisma/schema.prisma` (16 models across discovery, channel deep-fetch, cloud saved titles/collections, search history, token cache, and migration ledgers)
- **Prisma Config**: `prisma.config.ts` (reads `.env`, resolves `DATABASE_URL` primary or `SUPABASE_DATABASE_URL_CONNECTION_STRING` backup)
- **Runtime Singleton**: `src/lib/prisma/client.ts` (re-exported from `src/lib/db/prisma.ts`)
- **Schema Migrations**: `prisma/migrations/<timestamp>_<name>/migration.sql` (applied via `prisma migrate deploy`, tracked in `_prisma_migrations`)
- **Application Data Migrations**: `scripts/data-migrations/registry.ts` (tracked in Postgres table `DataMigrationRun` via `commits.ts`)

---

## Standard Operator Workflow

1. Validate env & connection before running Prisma commands:
   ```bash
   npm run db:validate
   npm run db:diagnose
   npm run db:status
   ```
2. Author a migration locally after editing `prisma/schema.prisma`:
   ```bash
   npx prisma migrate dev --name describe_change
   ```
   Or offline/create-only:
   ```bash
   npm run db:create-migration -- --name describe_change
   ```
3. Apply pending migrations safely to target Supabase Postgres:
   ```bash
   CONFIRM_DB_APPLY=true npm run db:apply
   ```
4. Regenerate client types:
   ```bash
   npm run db:generate
   ```

## Hard Guardrails

- Never run `prisma migrate reset` or `prisma db push` against shared or production databases.
- Never edit an already-applied `migration.sql` file; create a new additive/altering migration instead.
- Never bypass `requireAdmin()` on `/api/admin/migrations/status` or `/api/cloud/*`.
- Never commit `.env` or create `.env.local` in this repository.
