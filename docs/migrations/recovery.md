# Migration Recovery & Troubleshooting (Prisma ORM 7.10.1)

Use only safe diagnostics (`db:validate`, `db:diagnose`, `db:status`, `/admin/migrations`). Never run destructive resets (`migrate reset`, `db push --force-reset`).

## Common Connection & Pooler Issues

### 1. `P1000`: Authentication Failed / `tenant/user ... not found`
- Confirm `DATABASE_URL` in `.env` matches an active Supabase project's **Session Pooler** URI (`postgres.<project-ref>` on `aws-0-<region>.pooler.supabase.com:5432`).
- Check Supabase Dashboard -> Project Settings to verify the project is not paused or deleted and confirm the pooler region host.
- Percent-encode special characters (`#`, `@`, `?`, `/`, `$`) in the database password.

### 2. `P1001`: Host / Port Unreachable
- Prefer the IPv4-capable Session Pooler (`:5432`) over direct `db.<project-ref>.supabase.co` hosts in IPv4-only environments (Windows terminals, GitHub Actions, serverless runtimes).
- `db:status` and `db:apply` inject `connect_timeout=30` (or `PRISMA_CONNECT_TIMEOUT_SECONDS`) in-process automatically.

### 3. Failed Partial Migration (`P3009` / `P3018`)
- Inspect `_prisma_migrations` and Supabase SQL logs to see which statement failed.
- Fix the underlying cause and mark state explicitly with `prisma migrate resolve --rolled-back <migration_name>` or `--applied <migration_name>` after verification, then re-run `CONFIRM_DB_APPLY=true npm run db:apply`.

### 4. Client / Schema Mismatch After Checkout
```bash
npx prisma validate
npm run db:generate
npm run typecheck
```
