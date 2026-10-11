# Dailymotion Discovery — Dual-API Platform

Next.js App Router application for version-separated public Dailymotion video metadata discovery and research across Legacy API v1 and API v2.

This platform is not a downloader. It does not download, rehost, scrape private streams, or bypass platform restrictions.

## Dual-API discovery workspaces

Every discovery page is version-explicit (own route, endpoint, params, normalizer, pagination, history):

- General: `/general-v1`, `/general-v2`
- Videos: `/videos-v1`, `/videos-v2`
- Channels: `/channels-v1`, `/channels-v2`
- Playlists: `/playlists-v1`, `/playlists-v2`
- Users: `/users-v1`, `/users-v2`
- Live: `/live-v1`, `/live-v2`
- `/compare` (deliberate side-by-side, never merged), `/capabilities` (v1-vs-v2 source of truth),
  `/workspace` (history/saved + Sync to Supabase), `/settings` (config status), `/docs` (doc gateway)

API routes live under `/api/discovery/v1/[resource]`, `/api/discovery/v2/[resource]`,
`/api/discovery/compare`, and `/api/discovery/auth-status`. Shared UI renders the
version-neutral model in `src/lib/discovery/` (clients, services, normalizers,
capability registry). Capability evidence lives in `docs/api-v1-capability-inventory.md`
and `docs/api-v2-capability-inventory.md`. Tests: `npm test` (vitest).

## Cloud persistence (Supabase Postgres + Storage)

- Prisma owns relational state (`src/lib/db/prisma.ts` singleton); the
  Supabase SDK owns private Storage JSON (`src/lib/supabase/storage-server.ts`
  with `SUPABASE_SECRET_KEY`, server-only). Orchestration in
  `src/lib/persistence/` (repositories, storage-documents, batch-save).
- One-click Save: `/workspace` → Sync to Supabase (admin sign-in required) →
  `POST /api/cloud/batch-commit` (idempotent by key). Local drafts stay
  browser-local until the server confirms.
- Bucket `application-data` (private). Verify: `npm run supabase:storage:check`;
  create: `npm run supabase:storage:setup` (idempotent, never alters existing).
- Migrations: schema via Prisma (`prisma/migrations/`, guarded `db:apply`);
  data migrations via `scripts/data-migrations/registry.ts`. Docs:
  `docs/migrations/{README,registry,recovery}.md`. Diagnostics:
  `/admin/migrations` (admin only).

## Setup

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run dev
```

Use a root `.env.local` for local and online terminals. The scripts load env files with `dotenv` in this priority: `.env.local`, `.env`, `.env.development`, `.env.production`. Real `process.env` values from Vercel, GitHub Actions, Codespaces, or Codex take priority over file values.

## Required Env

Public/browser-safe:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Server-only:

- `DATABASE_URL`: required. Use the Supabase Session Pooler connection string.
- `GEMINI_API_KEY`: required for AI routes.
- `GEMINI_MODEL`: optional server-only Gemini model override. Leave unset to use the app default (`gemini-1.5-flash`).

Never expose `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, or service role keys as `NEXT_PUBLIC_*`. Do not create `NEXT_PUBLIC_DATABASE_URL`.

## Supabase Connection Strategy

For this free-plan, IPv4-limited workflow, use Supabase Session Pooler for `DATABASE_URL`:

```env
DATABASE_URL="postgresql://postgres.<project-ref>:<percent-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

Use one database variable only: `DATABASE_URL`. Copy the Supabase Session Pooler URI from the Supabase dashboard Connect panel. This project does not use `DIRECT_URL`; do not configure it as a migration override, fallback, or duplicate URL.

Supabase direct database hosts like `db.<project-ref>.supabase.co` can require IPv6 or a paid IPv4 add-on. In IPv4-limited Windows terminals, online agents, GitHub Actions, Codespaces, and many deployment environments, a direct host can fail with Prisma `P1001`. The Session Pooler host shape is:

```text
aws-0-<region>.pooler.supabase.com
```

If your Supabase password contains reserved URL characters such as `#`, `@`, `?`, `/`, or `$`, percent-encode those characters before pasting the connection string.

`db:status` and `db:apply` add `connect_timeout=30` to Prisma CLI child processes when `DATABASE_URL` has no explicit `connect_timeout`. This is a process-only Supabase P1001 hardening default; it does not rewrite your `.env` file or change the target database. Override it with `PRISMA_CONNECT_TIMEOUT_SECONDS` only if you have a specific reason.

Windows PowerShell and online terminals should use a root `.env.local`:

```powershell
Copy-Item .env.example .env.local
npm run db:validate
npm run db:status
```

## Prisma And Migrations

Prisma 7 reads connection settings from `prisma.config.ts`; `prisma/schema.prisma` keeps only `provider = "postgresql"`. Runtime route handlers use Prisma Client through `@prisma/adapter-pg` and `pg`, with a small server-side pool created from `DATABASE_URL`.

Connection resolution:

- Runtime server DB access uses `DATABASE_URL`.
- Prisma CLI, `db:status`, `db:apply`, migration deploys, client generation, and Prisma Studio use `DATABASE_URL`.
- The Direct Connection URI from Supabase is intentionally not part of this project's active workflow.

Commands:

- `npm run db:validate`: loads dotenv, requires only `DATABASE_URL`, and prints sanitized host metadata only.
- `npm run db:status`: runs a sanitized status wrapper that validates env, checks `SELECT 1` connectivity, then runs `prisma migrate status`.
- `npm run db:apply`: runs validation, pre-status, `prisma migrate deploy`, `prisma generate`, and post-status.
- `npm run db:migrate:deploy`: direct Prisma deploy command.
- `npm run db:create-migration`: developer-only migration creation command.
- `npm run db:generate`: generates Prisma Client.
- `npm run db:studio`: opens Prisma Studio.

`npm run db:apply` refuses Supabase, pooler, production-like, and Vercel production targets unless `CONFIRM_DB_APPLY=true` is set.

### Migration Status Diagnostics

`npm run db:status` is intentionally wrapped by `scripts/db-status.mjs` instead of calling Prisma directly. Prisma 7 can return a bare `Schema engine error:` from `prisma migrate status`; the wrapper first runs a non-mutating `SELECT 1` through Prisma so authentication, reachability, and URL-format failures are reported with concrete Prisma error codes such as `P1000` or `P1001`.

For the Supabase Session Pooler URL on port `5432`, this repo keeps the copied Session Pooler URL as the `DATABASE_URL` value and applies the timeout hardening in the scripts. Do not add `pgbouncer=true` to the Session Pooler URL unless official troubleshooting for your exact pooler mode calls for it.

### Migration History And Apply Status

The reviewed Prisma migration history now exists under `prisma/migrations`, and `20260506_channel_deep_fetch_history_persistence_foundation` has been applied to the configured Supabase target used in this workspace. Future databases or restored environments must still be checked with `npm run db:status` before applying migrations.

Safe future apply path:

1. Confirm `DATABASE_URL` points to the intended Supabase Session Pooler target.
2. Run `npm run db:validate` and `npm run db:status`.
3. Review any pending migration names and SQL before applying.
4. Apply only with explicit confirmation: `CONFIRM_DB_APPLY=true npm run db:apply`.

Production safety:

- Do not run `prisma migrate reset`.
- Do not drop tables through helper scripts.
- Do not use `prisma db push` as the production apply path.
- Do not print raw database URLs or passwords.

## Vercel

Configure required variables in Project Settings -> Environment Variables. After changing env values, create a new deployment so the updated values are available to build and runtime.

Required Vercel database variable:

- `DATABASE_URL`: Supabase Session Pooler URI.

`npm run build` runs the application env preflight through `scripts/app-validate-env.mjs`, then runs `prisma generate`, then `next build`. Vercel should provide real env values; placeholder build stubs in code are only a build-time guard and are not used for runtime DB access.

## GitHub Actions

The manual workflow is `.github/workflows/db-migrate.yml`.

Required secret:

- `DATABASE_URL`

Manual migration flow:

1. Open Actions -> Apply database migrations.
2. Select `run_apply=true` to apply, or `false` for status-only mode.
3. Use `confirm=APPLY` or `confirm=true` for apply mode.
4. The workflow runs validation, status, guarded apply, post-status, and client generation.

No secrets are printed by the workflow or database scripts.

## Local Checks

```bash
npm run env:validate
npm run db:validate
npm run typecheck
npm run build
```

`npm run db:status` requires real database access. `npm run db:apply` should only be run against the intended target with `CONFIRM_DB_APPLY=true`.

## Optional Integrations

- `DAILYMOTION_API_KEY` is optional. Public metadata routes run without it where Dailymotion endpoints allow anonymous access.
- `SUPABASE_SERVICE_ROLE_KEY` is optional and server-only for privileged flows.
- `GEMINI_MODEL` can select the server-side Gemini model used by AI routes. If it is missing or blank, the code falls back to `gemini-1.5-flash`. The Gemini API key and model setting are never sent to the browser.
- AI route failures return controlled unavailable payloads when Gemini is not configured or temporarily unavailable.

## Channel Explorer Deep Fetch

`/channel-explorer` separates fetch settings from result filters:

- Fetch settings control how public metadata is collected from Dailymotion.
- Result filters only filter and sort videos already collected in the current manifest.
- Filter changes never trigger Dailymotion API requests.
- Fetch settings only start API work when the user explicitly starts or resumes a fetch.
- Dailymotion list requests default to `limit=100`, and server-side validation clamps submitted page size to the provider maximum of 100.

Fetch profiles:

- `quick-preview`: one API page for source verification.
- `standard-fetch`: one result window, bounded by `MAX_CHANNEL_FETCH_PAGES` for legacy compatibility.
- `deep-balanced`: yearly windows that split capped years into months.
- `deep-aggressive`: recursive year/month/week/day splitting within hard caps.
- `recent-sync`: recent date-range collection.
- `historical-backfill`: older date-range collection.
- `custom-expert`: manual caps, window units, delay, and split behavior.

Dailymotion can cap a single result window around 1000 videos. Deep fetch uses public `created_after` and `created_before` filters with bounded `limit`/`page` pagination, deduplicates by Dailymotion video ID, and never claims full coverage unless every planned window finishes without caps, failures, stops, or max-limit interruptions.

Channel metadata requests use public profile metadata when available, including `videos_total`. The UI labels this as "Reported total from Dailymotion"; it is not a guaranteed collectable total because private, deleted, unavailable, or geo-restricted videos may affect comparison.

Parallel window fetching:

- Deep profiles can process independent date windows concurrently through the chunked `/api/dailymotion/channel/jobs/next` loop.
- Pages inside the same window remain sequential, so resume cursors stay auditable and "Continue Fetch" does not start from zero.
- `CHANNEL_FETCH_CONCURRENCY` sets the default requested worker count, and `CHANNEL_FETCH_MAX_CONCURRENCY` is the server hard cap. The current maximum cap is 5.
- Preview, standard, and single-window modes fall back to sequential execution and show the reason in progress feedback.
- Progress now tracks active windows, queued windows, completed windows, failed/capped windows, current worker count, total API requests, unique videos added, and duplicates skipped.

Channel Explorer live search:

- `/channel-explorer` includes a dedicated "Search Current Results" section.
- Search runs over the currently loaded live attempt, the loaded combined saved manifest, or the selected/current attempt scope.
- The search pipeline is search first, then Result Filters, then the selected sort/render mode.
- Search and filters never call Dailymotion. They only operate on collected/live manifest items or saved manifest items already loaded from the database.
- FlexSearch powers the local multilingual index with title, owner/channel, description/tags, language, year/date, duration, views, attempt number, fetch profile, page, collected date, and window range fields.
- For very large saved catalogs, use `/channels/[sourceId]` server pagination/search; `/channel-explorer` indexes the loaded/live manifest state intentionally.

Saved manifests and result viewing:

- `/channels` lists persisted Dailymotion sources that have fetch attempts, including reported total, collected unique videos, estimated remaining count, coverage status/confidence, attempt count, latest fetch time, and state-aware fetch actions.
- `/channels/[sourceId]` opens the source-level combined channel catalog plus attempt history. It supports server pagination/search and export of the currently displayed combined manifest page as JSON or NDJSON.
- `/channels/[sourceId]/attempts/[attemptId]` opens one attempt with settings, status, resume state, pages, windows, checkpoint, duplicate count, and attempt-scoped videos.
- Each Dailymotion source has one combined source catalog manifest containing all unique videos collected for that source across numbered attempts.
- Each fetch attempt still keeps its own attempt manifest/result group, so Attempt #1, Attempt #2, Attempt #3, and later runs remain auditable.
- "Continue Fetch" / "Fetch Remaining" starts the next numbered attempt from the latest saved checkpoint and merges new unique videos into the same source catalog instead of starting from zero.
- "Start New Fetch" is separate from continuing. It can collect from the beginning again without deleting the saved combined channel manifest.
- Result views include "Combined Results", "By Fetch Attempt", and "Current Attempt". Search/filter controls operate only on the selected saved result view and never call Dailymotion.
- Result cards show compact fetch provenance when available: source, attempt number, fetch profile/status, date window, API page, collected time, duplicate/new status, and manifest relationship.
- Export controls can download the combined channel manifest or selected attempt as JSON or NDJSON snapshots. Exports include public source/coverage/attempt/video metadata only and must not include secrets or server-only environment values.
- The Channel Explorer timeline shows persisted window feedback cards with queued/running/completed/capped/split/failed/stopped states, page counts, videos returned, unique additions, duplicates skipped, and execution order when parallel chunks were used.

Saved-results search:

- `POST /api/dailymotion/channel/search-saved` searches persisted manifest rows and canonical video metadata. It does not call Dailymotion.
- The channel manifest page also builds a FlexSearch index over the currently loaded result page for fast local multilingual search. FlexSearch was chosen over MiniSearch/Fuse for fast browser/Node full-text indexing, multi-field weighting through separate indexes, Unicode/Arabic-friendly normalization, suggestions, and room to move to larger/persistent indexes later.
- Server search is authoritative for saved database results and supports pagination. Loaded-index search is intentionally scoped to videos already loaded in the browser so large manifests are not blindly shipped to the client.
- Current search fields include title, description, owner/channel, tags, language, year, duration, views, attempt number, fetch profile, and window range. Exact phrase mode is supported; typo-tolerant suggestions apply to the loaded FlexSearch index.

Current persistence status:

- When `ENABLE_MANIFEST_PERSISTENCE=true`, Channel Explorer writes source metadata, catalog snapshots, fetch jobs, windows, page attempts, attempt manifests, durable combined source catalog manifests, manifest items, and canonical videos through Prisma/Supabase.
- Fetch history, coverage, and resumable checkpoints are read from the database and survive browser refreshes, server restarts, and deployment runtime replacement.
- When DB persistence is disabled or unavailable, the routes fall back to runtime memory and the UI shows "Persistence unavailable: history may reset after restart/deploy."
- Temporary attempt manifests and fetch jobs have TTL fields; canonical videos, video sources, durable source catalog manifests, saved videos, and collections are durable and must not be cleaned up by temporary-history retention.

New server hard caps:

- `MAX_CHANNEL_FETCH_TOTAL_PAGES`: total API pages across all windows.
- `MAX_CHANNEL_FETCH_WINDOWS`: total date windows a job may plan/process.
- `MAX_CHANNEL_FETCH_WINDOW_DEPTH`: maximum recursive split depth.
- `MAX_CHANNEL_FETCH_PAGE_SIZE`: maximum Dailymotion page size, capped at 100.
- `CHANNEL_FETCH_MIN_DELAY_MS`: minimum delay the browser cannot bypass.
- `CHANNEL_FETCH_CONCURRENCY`: default independent-window workers for deep fetches.
- `CHANNEL_FETCH_MAX_CONCURRENCY`: server hard cap for independent-window workers, capped by code at 5.
- `CHANNEL_FETCH_DEFAULT_PROFILE`: default fetch profile.
- `CHANNEL_FETCH_JOB_TTL_HOURS` and `TEMP_MANIFEST_TTL_HOURS`: temporary operational retention.

The migration foundation is expected under:

```text
prisma/migrations/20260506_channel_deep_fetch_history_persistence_foundation/migration.sql
```

Run `npm run db:status` before future applies and confirm the target database before setting `CONFIRM_DB_APPLY=true`.
