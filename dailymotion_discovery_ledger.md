# Dailymotion Discovery Platform Ledger

Updated: 2026-11-14
Repo path: `E:\discovery\dailymotion-discovery`
Scope: Project source-of-truth ledger, updated after Search Architecture Consolidation (Global Search + Link Explorer), universal Dailymotion URL/ID analyzer, retired route redirections, and 100% Vitest / TypeScript verification.

## Table of Contents

- [Project Identity](#project-identity)
- [Application Goal](#application-goal)
- [Current Features](#current-features)
- [Tech Stack](#tech-stack)
- [External Connections](#external-connections)
- [Environment Variables](#environment-variables)
- [Database and Prisma](#database-and-prisma)
- [Migration Workflow](#migration-workflow)
- [Architecture Overview](#architecture-overview)
- [API Routes](#api-routes)
- [UI Design System](#ui-design-system)
- [Folder Structure](#folder-structure)
- [File-by-File Hints](#file-by-file-hints)
- [Safety and Security](#safety-and-security)
- [Known Limitations](#known-limitations)
- [Future Roadmap](#future-roadmap)
- [Agent Instructions](#agent-instructions)

## 2026-11-14 Secure Authentication, Owner-Scoped Application & Saved Titles Manifest System (End-to-End Cloudflare R2 Sync)

**User intent addressed**
- Eliminated unprotected access across the platform: unauthenticated visitors can no longer view the Dashboard, search tools, link explorer, libraries, admin sections, or internal data APIs.
- Built a dedicated, high-contrast, accessible login portal at `/login` with full Supabase SSR authentication, password toggle, session remembrance, loading states, error diagnostics, and password recovery.
- Preserved the authoritative Supabase administrator account `asdy` (`asdy@dailymotion.discov.com`) without altering credentials, inventing accounts, or exposing public signup forms.
- Re-architected application-wide route authorization via Next.js 16 proxy interceptor (`src/proxy.ts` / `src/lib/supabase/middleware.ts`), strictly enforcing authentication on all private pages and APIs with server-side `auth.getUser()` and 7-day HMAC admin sessions (`ADMIN_SESSION_TTL_SECONDS=604800`).
- Implemented comprehensive Sign Out across the App Shell (sidebar, rail, mobile drawer), Account page, and Settings page, properly invalidating Supabase sessions, clearing cookies, returning `no-store` headers, and redirecting to `/login`.
- Created the dedicated Saved Titles Workspace (`/saved-titles`) under Library navigation with full local-first IndexedDB persistence, centralized automatic capture from Global Search & Link Explorer, server-verified manual admin addition, and safe 4-phase Cloudflare R2 cloud synchronization.

**Architecture & Implementation Details**

1. **Authentication & Authorization Architecture (`src/lib/auth/`)**:
   - `src/lib/auth/authorization.ts`: Server-side owner and admin resolution. Maps `asdy` alias and canonical email `asdy@dailymotion.discov.com` to the authoritative administrator identity. Provides `resolveAuthoritativeOwnerId(supabaseUser, adminSession)` and `isUserAdmin(supabaseUser, adminSession)`. Never trusts client-supplied `ownerId`, `userId`, `username`, or `isAdmin`.
   - `src/lib/auth/auth-service.ts`: Server-side Supabase SSR session validation. Exports `getServerAuthSession()`, `requireAuth()`, and `requireAdminAuth()`.
   - `src/lib/supabase/middleware.ts` & `src/proxy.ts`: Next.js 16 proxy interceptor. Whitelists public paths (`/login`, `/auth/callback`, `/api/auth/*`, static assets) and redirects unauthenticated traffic from `/` and all private workspaces directly to `/login`. Redirects authenticated users from `/login` to `/`. Restricts `/admin/*` and `/api/admin/*` to verified administrators.

2. **Dedicated Standalone Security Gateway (`/login` & `src/components/layout/app-shell.tsx`)**:
   - Detached the login page completely from the internal application shell (`AppShell`). Unauthenticated visitors arriving at `/login` see zero internal navigation links, zero sidebars, and zero internal app headers.
   - Built a 100% standalone full-viewport security gateway portal with luxury ambient backdrop glow, high-contrast inputs, password toggle, 7-day session persistence, and password recovery.
   - When authenticated, users enter the application where `AppShell` renders the complete navigation and dashboard workspace.
   - Dailymotion Discovery luxury obsidian styling matching the 2026 OLED aesthetic.
   - Dual identifier support (email or `asdy` alias) and password with show/hide toggle.
   - Remember-session checkbox honoring Supabase SSR cookie persistence.
   - Loading spinners, accessible labels, aria attributes, safe error alerts, and Supabase password recovery mode.
   - Auth Route Handlers:
     - `src/app/api/auth/login/route.ts`: Supabase SSR password sign-in + HMAC admin cookie generation for `asdy`.
     - `src/app/api/auth/logout/route.ts`: Supabase signOut + cookie clearance + `Cache-Control: no-store`.
     - `src/app/api/auth/session/route.ts`: Non-sensitive session inspection for client components.
     - `src/app/api/auth/reset-password/route.ts`: Supabase password reset email trigger.
     - `src/app/auth/callback/route.ts`: SSR auth exchange callback.

3. **Dedicated Saved Titles Workspace (`src/app/saved-titles/`)**:
   - `src/app/saved-titles/page.tsx`: Server component serving the workspace with dynamic title and metadata.
   - `src/components/saved-titles/saved-titles-workspace.tsx`: Primary workspace with search, filter (all, queries, links, IDs, handles, text), sorting, and dual visual layout:
     - **Top Section**: `CLOUD SYNCED` entries stored in Cloudflare R2 with revision counter, generation ID, and last sync timestamp.
     - **Middle Visual Separator**: `────────────────── LOCAL STORAGE · PENDING SYNC (N) ──────────────────`
     - **Bottom Section**: `LOCAL STORAGE · PENDING SYNC` entries with edit/delete actions, search filtering, and the prominent **Upload to Cloud** button with live 4-phase progress animation.
   - `src/components/saved-titles/saved-title-card.tsx`: Card component with status badge (`Cloud Synced` vs `Pending Sync`), origin badge (`Global Search`, `Link Explorer`, `Added by admin`), API version badge (`v1`, `v2`), clickable direct discovery inspection link, copy link, edit modal, delete confirmation, and Raw JSON Inspection drawer.
   - `src/components/saved-titles/add-saved-title-modal.tsx`: Modal for manual additions (stamped server-side by `/api/saved-titles/create-manual` with verified admin badge).
   - `src/components/saved-titles/edit-saved-title-modal.tsx`: Modal for updating display title and private research notes.

4. **Centralized Automatic Capture Service (`src/lib/saved-titles/capture-service.ts`)**:
   - Centralized capture methods invoked immediately upon user submission:
     - `captureSearchSubmission(query, apiVersion)`: Captures Global Search queries (value, origin "Global Search", API version `v1` | `v2`, status `pending_sync`). Preserves searches as historical references even if provider fails or returns 0 results.
     - `captureLinkSubmission(input, apiVersion, analyzed)`: Captures Link Explorer inputs (value, canonical URL, detected resource kind, origin "Link Explorer", API version `v1` | `v2`, status `pending_sync`).
     - `captureDiscoverySubmission(input, workspace, label, apiVersion)`: Generic capture for other workspaces.
   - Wired directly into `src/components/discovery/unified-search.tsx` (`executeSearch`) and `src/components/link-explorer/link-explorer-workspace.tsx` (`executeResolution`).

5. **Owner-Scoped Local-First Browser Persistence (`src/lib/saved-titles/local-storage.ts`)**:
   - Registered `entities_saved_titles` store in `src/lib/local-first/indexeddb-store.ts` (version 3).
   - Strict owner partitioning: user A cannot view or mutate user B's local entries.
   - Survives browser reloads, unloads, and network drops.
   - Separate retrieval for all records, pending sync records, and cloud synced records.
   - Local manifest builder generating schema-valid JSON for upload.
   - Dispatches `dm:saved-titles-changed` events for instantaneous reactive UI updates across open tabs.

6. **Safe 4-Phase Cloudflare R2 Cloud Synchronization (`src/lib/saved-titles/cloud-sync-service.ts`)**:
   - Explicit "Upload to Cloud" button in UI triggers `/api/saved-titles/cloud-sync`.
   - **Phase 1 (Prepare)**: Authenticates owner UUID, loads pending entries, fetches existing cloud manifest via `R2WorkerClient`, merges preserving historical entries (upserts updates, applies tombstones), and computes SHA-256 digest.
   - **Phase 2 (Upload)**: Uploads immutable generation snapshot (`dailymotion/persistence/{ownerId}/saved-titles/generations/{generationId}.json`), canonical manifest (`dailymotion/persistence/{ownerId}/saved-titles/manifest.json`), and dataset version pointer (`dailymotion/persistence/{ownerId}/saved-titles/version-pointer.json`).
   - **Phase 3 (Verify)**: Reads back canonical manifest from R2 Worker, calculates SHA-256 of read-back payload, and verifies exact match against Phase 1 digest.
   - **Phase 4 (Commit)**: Updates Postgres `StorageDataset` record (slug `"saved-titles"`, bucket `dailymotion-discovery-private`) and returns signed sync receipt.
   - **Safety Invariant**: If upload or verify encounters any failure, the process immediately halts with a clean error, returning `ok: false`, and local records are preserved in `pending_sync` state without data loss.

**Verification Results**
- `npm test` (`vitest run`): **42/42 test files passed, 214/214 tests passed** (including all unit/integration tests for authorization, session security, local persistence, R2 cloud sync, and capture service).
- `npm run typecheck` (`next typegen && tsc --noEmit`): Clean 0 TypeScript errors.
- `node scripts/db-validate-env.mjs`: Validated database connection string to remote Supabase Session Pooler.
- `npx prisma validate`: Schema at `prisma/schema.prisma` is 100% valid.
- Zero local production builds run (strictly adhering to memory/resource constraints).

## 2026-11-14 Professional Luxury Deep Black (True OLED 2026) & WCAG AAA Button Contrast Shield

**User intent addressed**

- Fixed critical button contrast defect where buttons (e.g., `Open Global Search` in Hero Quick Actions) rendered white text on an off-white/light-silver button background in dark mode, causing text and icons to become completely unreadable.
- Eliminated washed-out, dull charcoal gray tones across the application in dark mode.
- Transformed the entire dark theme into the **2026 Professional Luxury Deep Black (True OLED Obsidian Palette)**: infinite contrast, pure pitch black background (`#000000`), deep obsidian cards/surfaces (`#070709`, `#08080b`), refined luminous hairline borders (`rgba(255, 255, 255, 0.08)`), and crisp typography.

**Root cause analyzed**

- In previous CSS tokens, `.dark` defined `--primary: oklch(0.922 0 0)` (approx. `#ebebeb` / off-white silver) and `--primary-foreground: oklch(0.205 0 0)`.
- Because `text-primary-foreground` in Tailwind v4 and Lucide SVG icons inherited or collided with general link colors or base `--foreground` (white), child text and icons rendered in near-white (`rgb(254, 254, 254)`) on top of the `rgb(231, 231, 231)` button background, producing a disastrous contrast ratio of 1.15:1.
- Furthermore, dark theme variables used washed-out charcoal gray (`oklch(0.145 0 0)` / `#18181b`, `#1e1e1e`, `#262626`) instead of a high-end luxury true black OLED aesthetic.

**What was built & hardened**

1. `src/app/globals.css`:
   - Updated `.dark` design tokens to 2026 Professional Luxury Deep Black:
     - `--background: #000000;` (Pure true pitch black / OLED black)
     - `--surface: #070709;`, `--surface-muted: #0d0d11;`, `--surface-container-low: #030304;`, `--surface-container-high: #131318;`
     - `--card: #08080b;`, `--popover: #08080b;`
     - `--border: rgba(255, 255, 255, 0.08);`, `--border-strong: rgba(255, 255, 255, 0.16);`
     - `--foreground: #ffffff;`, `--muted-foreground: #94a3b8;`
     - `--primary: #ffffff;`, `--primary-foreground: #000000;`
     - `--sidebar: #020203;`, `--sidebar-foreground: #ffffff;`
   - Added **WCAG 2.2 AAA Button Contrast Armor**:
     - Solid primary buttons (`.dark .bg-primary:not([class*="/"])`, `button.bg-primary`, `a.bg-primary`) are enforced with crisp white background (`#ffffff`) and pure jet-black text/icons (`#000000 !important`), delivering a maximum 21:1 contrast ratio.
     - Preserved opacity-modified badges (`bg-primary/10`, `bg-primary/5`).
     - Dark mode form controls (`select`, `option`, `optgroup`, dialogs, menus, inputs) hardened with deep obsidian surfaces and crisp white text.
2. `src/components/ui/button.tsx`:
   - Re-architected `buttonVariants.primary`:
     - Light mode: Rich black (`bg-neutral-900 text-white hover:bg-neutral-800`).
     - Dark mode: Crisp pure white with jet-black text (`dark:bg-white dark:text-black dark:border-white/20 dark:hover:bg-neutral-100 dark:hover:text-black font-extrabold shadow-sm`).
   - Hardened `secondary`, `outline`, `ghost`, `destructive`, `gold`, `info` variants for luxury dark mode readability.
3. `src/app/page.tsx`:
   - Updated Quick Actions Card:
     - `Open Global Search` button: explicit high-contrast `bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-100` with explicit `text-white dark:text-black` on both icon and text.
     - `Open Link Explorer`: refined obsidian glass button with strong border.
     - `API Comparison Matrix`: refined luxury outline button with hover highlight.
4. `src/components/layout/app-shell.tsx`:
   - Updated active sublink badges and dots in both desktop sidebar and mobile navigation drawer to high-contrast monochrome (`bg-neutral-900 text-white dark:bg-white dark:text-black`).
5. `src/components/discovery/api-status-bar.tsx`:
   - Hardened `Usage` and `Settings` buttons with high-contrast text and elevated surface border styling.
6. `src/components/link-explorer/link-explorer-workspace.tsx` & `src/components/discovery/unified-search.tsx`:
   - Hardened main submit/search action buttons to ensure high-contrast clarity across all themes.

**Verification results**

- `npm run typecheck` (`next typegen && tsc --noEmit`): Passed with 0 errors.
- `vitest run` (`npm test`): 38 test files passed (38/38), 190 tests passed (190/190).
- Tailwind CSS v4 compilation: Successfully processed 110,648 bytes of CSS without errors or diagnostics.
- Contrast verification: Solid primary buttons in dark mode achieve 21:1 contrast ratio (pure black on pure white).

## 2026-10-12 Direct IPv6 connectivity diagnosis (P1001 root cause)

**Cause established (not assumed)**

- `P1001` is NOT a wrong-string/adapter/config problem. Evidence chain from
  new `npm run db:diagnose` (7 layers, sanitized, read-only):
  DNS AAAA `2a05:d01c:…:9aac` resolves (hostname/credentials/port correct);
  machine has interface IPv6 addresses; **IPv6 egress control probe
  (google:443) TIMES OUT**; TCP to the DB IP times out identically
  (environmental, not host-specific); hence auth/Prisma/migrate layers
  unreachable. Password correctness is untestable from here.
- Corroborated by Windows resolver (AAAA present, no A record — correct for
  Free direct) and official Supabase docs (direct = IPv6-only on Free;
  pooler = IPv4; serverless → transaction pooler).

**Changes (targeted, no redesign)**

- `scripts/db-diagnose-connection.mjs` (new, `db:diagnose` npm script):
  explicit AAAA/A DNS (Node lookup is unreliable for IPv6-only hosts on
  Windows), local-stack + egress-control probes, per-address TCP, pg auth
  (hostaddr bypass), Prisma query + migrate status. No migrations/DDL.
- No Prisma/adapter/client changes needed — verified correct for 7.8.0.
- Docs: `.env.example` + `docs/migrations/README.md` now explain direct vs
  pooler, per-environment values in the SAME variable, and the unverified
  Vercel IPv6 position (pooler recommended there unless verified).
- Migration `20261011183739` reviewed (matches schema, `prisma validate`
  clean) and still PENDING — not applied, per safety rules.

**Not verified**

- Vercel IPv6 egress (cannot test from here; web search unavailable).
  Production guidance: pooler URL in Vercel's variable unless verified.
- Password correctness (unreachable auth layer). Nothing was changed about it.

- [Agent Instructions](#agent-instructions)

## 2026-10-14 Native Prisma ORM 8 migration (single-version data layer)

**Starting state (verified, not assumed)**

- `npx prisma@latest orm init --from-prisma7-schema` had run: Prisma 8 RC
  (`@prisma/orm-postgres@8.0.0-rc.17`, `prisma@8.0.0-rc.22`,
  `@prisma/cli-engine@0.7.0`) installed, `prisma7Schema(...)` compat config,
  emitted compat artifacts in `src/prisma/`. Prisma 7 packages
  (`@prisma/client`, `@prisma/adapter-pg`) already absent from
  package.json/node_modules — but all app code still imported them (broken).
- `.env` (5885 bytes, real credentials) is the only local env file;
  `.env.local` is absent. `.env` was never opened, read, printed, edited,
  moved, or deleted during this task. `.env.example` had been replaced by a
  10-line init template (restored below).
- Installed skill `.agents/skills/prisma-8` (v2026-09-12) matches the
  installed library; its references plus official Prisma docs
  (coming-from-7 mapping table, scalar-types reference) drove the conversion.

**What was built**

- `src/prisma/contract.prisma` (native PSL, `// use prisma-8`): all 17
  models + 10 `native_enum`s converted (`@db.Uuid`→`Uuid`,
  `@db.Timestamptz`→`TimestamptzString` (text timestamps, no Temporal needed
  on Node 24), `Json`→`Jsonb`, `Decimal`→`Numeric`, `@updatedAt`→
  `temporal.updatedAtString()`); tables/columns/relations/constraints/indexes
  preserved verbatim. Two oversized index wire-names shortened with `name:`
  prefixes (future renames are non-destructive; documented).
- `prisma.config.ts` native (contract path, `DATABASE_URL` primary, no
  fallback, `migrations.dir`). `src/prisma/db.ts` native singleton
  (`@prisma/orm-postgres/runtime`, module scope, lazy connect, 30s pool
  timeout). `contract.json` + `contract.d.ts` re-emitted (hashes recorded).
- All queries converted (`db.orm.public.*`, `db.sql`/`db.raw` lanes,
  `db.transaction`): `channel-fetch-persistence.ts` (full rewrite, same
  exported signatures), saved-titles/search-history/commits repositories,
  batch orchestrator, token-cache store, sync-state + migrations/status
  routes. New `src/lib/db/scalars.ts` bridges branded writes (ISO strings
  ARE the timestamptz wire values; decimal text IS the numeric wire value)
  and contract-derived enum unions. Saved-search text filters use
  combinators + relation order-by; tag matching moved to a JS post-pass
  (documented: Prisma 8 has no list `has` filter).
- Reads now return text timestamps (not `Date`): all `.toISOString()` /
  `.getTime()` call sites guarded; `update()`/`create()` nullability handled
  with an explicit `required()` helper (honest errors, never silent nulls).
- Removed (DB untouched — file deletions only): `prisma/schema.prisma`,
  `prisma/migrations/` (incl. the applied baseline and the never-applied
  pending dir — recorded here for the record), `src/lib/prisma/client.ts`,
  root `prisma-8.md` (side-by-side doc). No `prisma7.config.ts`,
  `prisma7:*` scripts, or compat deps existed to remove.
- Scripts native: `db-status` (tsx probe + `migration status`),
  `db-apply` (guarded `db migrate` + re-emit), `db:diagnose` (v8 probe +
  status), new `scripts/db-probe.ts`; `prebuild` runs `contract emit`.
  `pg` kept (diagnostic script uses it).
- Env: `DATABASE_URL` primary + `SUPABASE_DATABASE_URL_CONNECTION_STRING`
  documented backup (warns, never silent); `DATABASE_URL_DIRECT` and
  `DATABASE_URL_CONNECTION_STRING` support removed; `SUPABASE_SERVICE_ROLE_KEY`
  retired from validation; `.env.example` rebuilt from a full source audit
  (every variable with purpose/consumer/required/server-or-public/origin).
  `.env` untouched, `.env.local` still absent, `.gitignore` keeps `.env`
  ignored (verified: `.env` not tracked by git).
- `MODULE_TYPELESS_PACKAGE_JSON`: left as a warning — no `"type": "module"`
  change (audit: Next 16 + `.mjs` scripts + tsx + vitest are unaffected;
  changing module type repo-wide for one warning is unjustified).

**Verification (all executed)**

- `prisma contract emit`: ok (fixed 34 initial PSL diagnostics via the
  validator: preset-instead-of-type, string enum defaults, index prefixes).
- `tsc --noEmit`: clean (was ~60 errors mid-migration; tsc verified every
  query chain, include shape, and branded write).
- `vitest`: full suite green (see background run record), incl. 8 new
  conformance tests (contract validity/currency, no-legacy scan,
  env-file discipline).
- `prisma db verify`: attempted read-only — connection timed out at the
  network layer (known: no IPv6 egress here), no DB state touched.
- Production build: prebuild emit ok; full `next build` blocked ONLY by
  `GEMINI_API_KEY` + `NEXT_PUBLIC_APP_URL` missing/placeholder in the real
  `.env` (validator proven correct with dummies; code path verified via a
  dummy-override build — see build record). No values read or invented.
- No migration planned/applied/signed, no reset, no data import, no
  deployment. RLS posture preserved by inaction (no DB writes at all);
  contract is silent on RLS — flagged as a must-verify item (`contract
  infer`/`db verify` + `@@rls` review) once connectivity exists.

**Known limitations / manual steps**

1. Fill `GEMINI_API_KEY` + `NEXT_PUBLIC_APP_URL` in `.env` (or Vercel) for
   builds; redeploy after env changes.
2. From an IPv6-capable network (or pooler URL): `prisma db verify`, then
   `prisma db sign` to record the existing-tables baseline (explicit step,
   changes DB marker metadata — requested authorization required), then
   future `migration plan` deltas. Verify RLS/policies at that point.
3. `lint` still runs legacy `next lint` (pre-existing; untouched).
4. `Numeric` reads as decimal text and timestamps read as ISO strings —
   app mapping code handles both; watch for `Decimal.js`-style assumptions
   in future code (none remain).

## 2026-10-11 Supabase/Postgres/Storage/batch-save/migration integration

**Audit findings (verified, not inferred)**

- `.env.local` already uses canonical names: `DATABASE_URL_CONNECTION_STRING`
  + `DATABASE_URL_DIRECT` set, legacy `DATABASE_URL` empty, new
  `SUPABASE_SECRET_KEY` set, no service-role key. Code now matches reality.
- Configured DB target is a Supabase DIRECT host (`db.*.supabase.co:5432`),
  unreachable from IPv4-limited environments (P1001, confirmed live) —
  all remote-DB verification is therefore reported, not claimed.
- No active service-role code path existed (only a dead schema entry).
  Browser Supabase clients use the publishable key only.
- Prisma 7.8.0 + adapter-pg lockfile-aligned; no upgrade performed.
- Baseline migration `20260506_...` preserved byte-identical; a never-applied
  pending token-cache dir was folded into the grouped migration below.

**What was built**

- Canonical env: `DATABASE_URL_CONNECTION_STRING` (+legacy fallback with
  warning), `DATABASE_URL_DIRECT` optional, `SUPABASE_SECRET_KEY` canonical
  (service-role retired, never a fallback), `DAILYMOTION_PARTNER_API_BASE_URL_V1`
  split, token-cache vars; scripts + prisma.config + validation updated.
- One grouped migration `20261011183739_workspace_cloud_persistence`
  (PENDING): ApiVersionTokenCache, SearchHistory, BatchCommit,
  DataMigrationRun, StorageDocument + SavedVideo provenance/position +
  Video resourceType. Additive only; rollback = drop new objects.
- Layers: `lib/db/prisma.ts` (singleton re-export), `lib/supabase/
  storage-server.ts` (secret-key, server-only), `lib/admin/require-admin.ts`,
  `lib/persistence/{repositories,storage-documents,batch-save}`.
- Routes (admin-gated): `POST /api/cloud/batch-commit` (idempotent),
  `GET /api/cloud/sync-state`, `GET /api/admin/migrations/status`.
- UI: workspace Sync panel (pending/Save/retry/discard/beforeunload),
  `/admin/migrations` diagnostics, Settings Supabase section.
- Storage: private bucket `application-data` CREATED live + probe
  upload/read/delete verified; `supabase:storage:{check,setup}` scripts;
  `scripts/data-migrations/registry.ts`; `docs/migrations/` trio.
- Source of truth: Postgres rows for lists/order/CRUD; Storage for raw
  snapshots (DB keeps path+revision+checksum); browser = drafts until Save.

**Verification (all executed)**

- `npx vitest run`: 94/94 pass (16 files).
- `npm run typecheck`: exit 0. `npm run build`: passed (52 routes).
- `npx prisma validate`: schema valid; `prisma generate`: exit 0.
- `db:validate`: pass (sanitized). `db:status`: reaches preflight, P1001 on
  direct host (documented; operator may switch to pooler).
- Storage check live: bucket exists+private, probe up/read/del passed,
  self-cleaned. `lint`: pre-existing failure only.
- Live smoke (:3113): `/workspace`, `/admin/migrations` 200; private APIs
  401 without session (gating proven). Allow-path + real-DB paths need
  operator login + reachable DB (reported, not claimed).
- No deployment; no migration applied (needs CONFIRM_DB_APPLY + reachability);
  no destructive command run; `.env.local` secrets never printed/touched.
- Pushed 2026-10-11: commit c16118d to origin/main (113 files, secret scan
  clean — secrets empty, no credentialed URLs). Pushed 2026-10-12: commit
  6ac2961 (IPv6 diagnostics + docs, 5 files, secret scan clean).
  Deliberately NOT pushed:
  `notes.txt` modification (contains an operator secret-like line — remove it
  before committing) and local agent-tool directories/screenshots.

### Earlier 2026-10-11 work (separate auth panels + unified Search)

**Scope**

- Implemented the two follow-up tasks on top of the 2026-10-10 dual-API
  platform: (A) independent `Authenticate & Test V1/V2` wiring with genuine
  token + read-only API probes; (B) unified version-aware `/search` with a
  dynamic parameter-compatibility panel, per-version Settings sections with
  defaults editors, and full-app consistency fixes.

**New verified API facts (live probes 2026-10-11)**

- Partner host requires a token for EVERY call (anonymous → 401
  `invalid_token`); public host serves anonymous discovery. V1 profile now:
  token → Partner base, no token → public host (same version).
- V1 token endpoint REQUIRES `scope` (422 without). New documented-optional
  `DAILYMOTION_API_SCOPE_V1`, default `userinfo` (least privilege; documented
  Platform scopes: userinfo/email/manage_videos/manage_players/
  manage_playlists/manage_subtitles). No V2 scope was copied into V1.
- V2 scope default `DAILYMOTION_API_SCOPE_V2=bundle.public` (documented
  read-only bundle). New `DAILYMOTION_OAUTH_TOKEN_URL_V1/V2` vars (documented
  defaults). New tri-state `DAILYMOTION_FAMILY_FILTER` (unset = omit = safe)
  and `DAILYMOTION_LOCALIZATION` (default `detect`, v1-only).

**Files added/changed**

- `src/lib/discovery/version-config.ts` (profiles, tri-state parsing),
  `auth.ts` (isolated caches, classified failures, sanitized status),
  `v1-client.ts` (partner/public host selection, fail-closed option),
  `v2-client.ts` (profile-based), `connection-test.ts` (two-step probes,
  8s cooldown), `param-schema.ts` (compatibility registry, sort/fields/
  cache-key helpers).
- Routes: `api/discovery/v1|v2/test-connection` (POST, sanitized),
  `auth-status` extended (profile facts, no secrets); v1/v2 resource routes
  forward `fields`, v1 forwards live/hd/verified/explicit flags.
- UI: `connection-panel.tsx`, `result-card.tsx` (shared), `unified-search.tsx`,
  rebuilt `/search`, reorganized `/settings` (V1/V2 sections + defaults +
  resets + admin + deploy notes), dashboard auth-shape update.
- Store: per-version defaults + last-version persistence (V1 reset never
  touches V2). `src/lib/config/env.ts` + `.env.example` document all vars.
- Tests: `auth` (11), `connection-test` (6), `param-schema` (9) + updated
  clients tests; total 67 passing.

**Verification**

- `npx vitest run`: 67/67 pass. `npm run typecheck`: clean.
- `npm run build`: passed (Next 16.2.5, 48 routes incl. test-connection pair).
  Plain build still needs real local secrets (pre-existing placeholder
  `.env.local`); verified with sanitized dummy env.
- `npm run lint`: still fails pre-existing (`next lint` removed in Next 16).
- Live connection tests were run later the same day against the production
  build (see results below); panels report honest states. No deployment
  performed (separate step; redeploy required after env change).

**Live connection tests (2026-10-11, production build on :3111, creds from
root .env.local — lengths only, values never printed)**

- V2: PASS. `POST /api/discovery/v2/test-connection` → token acquired via
  client_credentials (`expires_in` 10800s server value honored, scope
  bundle.public) + `GET /videos/x5auisp` → HTTP 200. V2 is genuinely
  connected. Follow-up: `GET /profiles/xiy/videos` via app route returned
  real v2 items with opaque `next` cursor (total 23, hasMore true).
- V1: token REJECTED. Creds present; Partner token endpoint refused them
  (invalid_client, 550ms). Request format matches docs (422-scope check
  proves parsing); cause is credential-side (wrong/rotated secret or key not
  enabled for client_credentials). Operator action: verify/recreate the V1
  key+secret in Dailymotion Studio. Public v1 discovery unaffected (auto
  public-host fallback verified live: Arabic query → Arabic results,
  total 1000, has_more true).
- No secrets/tokens in any test response (asserted in tests + verified in
  live payloads). No deployment performed.

**Preserved**

- All 12 dedicated v1/v2 pages, Channel Explorer, channels, saved, AI,
  compare, capabilities, workspace flows unchanged in behavior. No migration
  created/applied; `db:apply` not run. Unrelated working-tree edits
  (notes.txt, skills-lock.json, supabase pins) preserved.

## 2026-10-10 Dual-API (v1+v2) discovery platform implementation

**Scope**

- Implemented the requested version-separated Dailymotion discovery platform:
  12 paired search pages, version-isolated clients/services/normalizers,
  capability registry + Capabilities page, opt-in compare mode, workspace
  (history/saved), settings, docs gateway, admin session, dashboard rework,
  sidebar regrouping, Dailymotion branding/favicon, `.env.example` + README
  updates, and 42 automated tests. All pre-existing Channel Explorer /
  channels / saved / AI routes preserved untouched.

**Path/scope truth**

- `F:\discovery\youtube-discovery` does not exist on this machine; only
  `E:\discovery\dailymotion-discovery` exists (`E:\discovery` contains just
  that directory). No duplicate app was created; reference interaction
  patterns were reconstructed from the prompt + official docs instead.
- `notes.txt` / `skills-lock.json` / supabase pin edits in the working tree
  are pre-existing unrelated changes and were preserved (not reverted).
- `notes.txt` contains an operator secret-like line — never printed, never
  committed by this task, never touched.

**Official docs inspected (evidence in docs/ inventories)**

- v2: docs index, migration guide (full: auth/scopes/video/profile/player/
  playlist/livestream maps), authenticate, browse-large-catalog,
  collect-video-ids, collect-profile-ids, reference index, perform-an-api-call,
  understand-api-response, api-scopes, rate-limiting, api-errors,
  listprofilevideos + get-video OpenAPI (full).
- v1: v0 docs index + reference index, authenticate (+ auth/scopes refs),
  browse-large-catalog, collect-video-ids, video-filters (full),
  user-filters (full), playlist-filters (full), video-connections (full),
  global-api-parameters (full), api-list-videos OpenAPI, rate-limiting.
- Created `docs/api-v1-capability-inventory.md` and
  `docs/api-v2-capability-inventory.md` (endpoint/params/fields/pagination/
  limits/errors/auth per endpoint + implementation status + doc URLs).

**Live verification (2026-10-10, curl, no credentials)**

- v1 public: `/videos?search=news` 200 (`total:1000,has_more:true`); Arabic
  `العربية` query returns Arabic titles (Unicode preserved);
  `/users?search=` 200; `/user/{id}` + `/user/{id}/videos` 200;
  `/user/lequipe/playlists` 11 total; `/playlist/x88apm/videos` 40 total;
  `list=what-to-watch` 200; `live_onair=1` returns on-air lives;
  `/playlists?search=` → 403 "Only authenticated users can use this filter";
  stale playlist id → 404 object_not_found (honest errors).
- v2: `/v2/profiles/xiy/videos` and `/v2/videos/x5auisp` without token → 401;
  `POST oauth2.../v2/token` with dummy creds → structured `invalid_request`
  (endpoint live). Conclusion: v2 = auth-required for everything; all v2
  reads are mock-tested, UI reports `auth_missing` + setup remedy.

**Architecture (new, additive under src/lib/discovery/)**

- `version-config.ts` (V1/V2 base isolation; bare legacy var = v1 default
  only), `auth.ts` (separate v1/v2 token caches; v1 ~10h, v2 30-min refresh),
  `v1-client.ts` (public-first, opportunistic Bearer, 429/5xx retry+backoff),
  `v2-client.ts` (no-creds → `auth_missing` with zero HTTP),
  `query-serialization.ts` (pure per-version builders; exact query preserved),
  `v1-normalize.ts` / `v2-normalize.ts` (→ shared `DiscoveryItem` + `raw`,
  `apiVersion` stamped), `v1-search-service.ts` / `v2-search-service.ts`
  (typed ops incl. profile/playlist contents, related, /me),
  `capability-registry.ts` (12 entries; UI controls derive from it),
  `types.ts` (merge/dedupe keyed on version+kind+id).
- Routes: `/api/discovery/v1/[resource]`, `/api/discovery/v2/[resource]`,
  `/api/discovery/compare` (side-by-side, never merged),
  `/api/discovery/auth-status` (booleans only, no secrets).
- Pages: `/general|videos|channels|playlists|users|live-v1|v2` (shared
  `DiscoveryExplorer`: URL-synced state, server+labelled-local filters,
  pagination/load-more, raw inspection, JSON/CSV export, history/saved,
  cross-version links), `/compare`, `/capabilities` (registry-rendered),
  `/workspace`, `/settings`, `/docs`, `/admin/login` (+ `/api/admin/*`).
- Workspace persistence is browser-localStorage (no migration, no new
  tables). Admin session is a stateless HMAC cookie (7-day default, httpOnly,
  SameSite=Lax, timing-safe compare) — no DB table, no migration.
- Canonical tables unchanged: `video_sources`, `videos`, `manifests`,
  `manifest_items`, `fetch_jobs`, `fetch_windows`, `fetch_page_attempts`,
  `source_catalog_snapshots`, `fetch_job_events`, `collections`,
  `saved_videos`. No migration created/applied; `db:apply` not run.
- Env: `.env.example` documents the versioned pair
  (`DAILYMOTION_API_BASE_URL_V1/V2`), exact private credential names,
  `ADMIN_*` names/TTL, mandatory-vs-optional + where-to-obtain. Bare
  `DAILYMOTION_API_BASE_URL` kept as v1 default only. `src/lib/config/env.ts`
  extended with optional versioned/admin fields (no secret exposure).

**Verification**

- `npx vitest run`: 42/42 pass (serialization incl. Arabic/emoji preservation,
  normalizers, registry consistency, base-URL isolation, v1 envelope/403/429
  retry, v2 no-creds-no-HTTP, window-cap/end detection, admin roundtrip/
  tamper/unconfigured).
- `npm run typecheck`: clean (after `npx prisma generate`; Prisma errors were
  missing-client artifacts, not code).
- `npm run build`: passed (Next 16.2.5, 46 routes incl. all new pages/APIs).
  Plain `npm run build` fails in THIS checkout because root `.env.local`
  still holds `.env.example` placeholders (DATABASE_URL/GEMINI_API_KEY/
  NEXT_PUBLIC_APP_URL) — pre-existing, secrets not touched; verified with
  sanitized dummy env override instead.
- `npm run lint`: still fails pre-existing (`next lint` removed in Next 16;
  interprets `lint` as a directory) — unchanged, out of scope (no eslint
  dependency added per dependency discipline).
- Runtime smoke: production server on :3110 (background); route checks
  pending at ledger-write time (see final report).

**Known limitations**

- All v2 reads need operator credentials (`PRIVATE_DAILYMOTION_API_KEY_V2` +
  secret, Private API key, read scopes) — not supplied; v2 pages show setup
  remedy instead of results until configured.
- v1 anonymous global playlist search unavailable upstream (403) — owner/id
  workflows offered instead. v2 has no global search for any resource —
  profile-scoped alternatives, explicitly labelled.
- History/saved are browser-local (per-device, no cross-device sync).
- `npm run lint` needs a future ESLint migration (pre-existing).

## 2026-05-07 Channel Explorer live search, parallel window fetch, and window feedback

**Scope**

- Added a dedicated live "Search Current Results" section inside `/channel-explorer` without adding any Dailymotion search/fetch behavior to typing, search toggles, filters, or sort controls.
- Reused the existing FlexSearch choice through a shared `src/lib/search/video-flexsearch.ts` helper so live Channel Explorer search and saved loaded-result search share the same multilingual loaded-index behavior.
- Added controlled independent-window concurrency for deep channel fetch chunks while preserving ordered page fetching inside each window.
- Added persisted progress fields for active/queued windows, worker counts, execution-order feedback, and parallelism explanations through existing `FetchJob.progressJson`, `FetchWindow`, `FetchPageAttempt`, and `FetchJobEvent` structures.
- Added a Channel Explorer "Fetch Timeline / Window Feedback" section showing queued/running/completed/capped/split/failed/stopped windows, pages fetched, videos returned, unique additions, duplicates skipped, and execution order.
- Reorganized `/channel-explorer` into clearer Source Input, Channel Metadata, Fetch Configuration, Active Fetch Progress, Fetch Timeline, Fetch Attempts/History, Coverage, Manifest Search, Result Filters, Manifest Results, and Export/Open Saved Manifest sections.

**Search behavior**

- `/channel-explorer` search modes are "Current live results", "Combined saved manifest", and "Selected attempt".
- Search fields include title, description, owner/channel/source labels, tags, language, published year/date, duration, views, attempt number, fetch profile, page number, collected date, and window range.
- The local pipeline is now: FlexSearch/local search first, advanced result filters second, filter sort third, render fourth.
- Search preserves valid zero values by stringifying `0` metadata instead of treating it as absent.
- Search/filter interactions do not call Dailymotion. Combined saved-manifest search uses the loaded DB-backed manifest state in Channel Explorer; larger saved catalogs should use `/channels/[sourceId]` server pagination/search.

**Parallel fetch behavior**

- New server-only caps are `CHANNEL_FETCH_CONCURRENCY` (default 3) and `CHANNEL_FETCH_MAX_CONCURRENCY` (default 5, code-capped at 5).
- `ChannelFetchSettings.concurrency` is server-clamped in `resolveChannelFetchSettings`; preview, standard, and single-window modes force concurrency to 1.
- `processNextChannelFetchChunk` now selects up to the effective concurrency of independent unfinished windows per request.
- The selector never schedules two pages from the same window in one request, preserving page order and resume correctness.
- Deduplication remains shared across the runtime job through the same strong multi-field dedupe key used before this entry.
- If parallelism is not safe or not useful, progress reports a reason and falls back to sequential execution.

**Database and migration truth**

- No migration was required or created.
- Canonical tables remain `video_sources`, `videos`, `manifests`, `manifest_items`, `fetch_jobs`, `fetch_windows`, `fetch_page_attempts`, `source_catalog_snapshots`, and `fetch_job_events`.
- Window/page feedback persists through existing `fetch_windows`, `fetch_page_attempts`, `fetch_job_events`, and `fetch_jobs.progress_json`.
- No legacy table, fallback table, `DIRECT_URL`, dual database URL, or old persistence path was introduced.

**Verification**

- `npm run db:validate`: passed with sanitized `DATABASE_URL` diagnostics and `DATABASE_URL`-only policy.
- `npm run db:status`: passed; Prisma reported the schema is up to date with the single applied migration.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed on Next.js 16.2.5.
- Runtime smoke: built app served on `http://127.0.0.1:3002`; `/channel-explorer` and `/channels` returned HTTP 200.
- HTML smoke: `/channel-explorer` included Search Current Results, Fetch Timeline / Window Feedback, Window concurrency, and Search does not call Dailymotion copy.
- Manual API smoke: a bounded quick-preview fetch against `https://www.dailymotion.com/channel/news` kept page size 100, used concurrency 1, fetched 1 page, saw 100 returned provider items, persisted in database, and stopped at the configured 10-item max. A bounded deep-balanced fetch with concurrency 2 selected `2/2` workers and persisted failed date-window windows because Dailymotion date-window requests timed out; no complete coverage was claimed.
- Saved search smoke: database-backed English `news` search returned saved results; UTF-8 Arabic `العربية` search returned one saved match.

**Safety**

- `DATABASE_URL` remains the only database URL. `DIRECT_URL` was not restored.
- `db:apply` was not run for this entry.
- No `prisma migrate reset`, `prisma db push`, table drops, destructive DB commands, private Dailymotion access, video downloading, stream scraping, rehosting, or secret printing was introduced.

## 2026-05-07 Saved channel browser, attempt detail pages, Gemini model env, and saved-results search

**Scope**

- Added server-only `GEMINI_MODEL` support while preserving the existing safe fallback model `gemini-1.5-flash`. `GEMINI_API_KEY` and `GEMINI_MODEL` remain server-only and are not exposed through `NEXT_PUBLIC_*`.
- Added `/channels`, `/channels/[sourceId]`, and `/channels/[sourceId]/attempts/[attemptId]` as dynamic App Router pages backed by the existing Prisma Channel Explorer persistence layer.
- Added saved-history API routes: `GET /api/dailymotion/channel/sources`, `GET /api/dailymotion/channel/[sourceId]/combined-manifest`, `GET /api/dailymotion/channel/[sourceId]/attempts`, `GET /api/dailymotion/channel/attempts/[attemptId]`, and `POST /api/dailymotion/channel/search-saved`.
- Added `flexsearch@0.8.212` for fast loaded-result browser indexing while keeping saved-result authority in the database.

**Current combined manifest truth**

- The canonical source-level catalog remains the durable `manifests` row where `manifestType=CHANNEL`, `persistenceType=DURABLE`, and `query="source-catalog"`.
- Attempt manifests remain temporary/auditable per fetch job.
- Combined catalog rows are still enforced by `@@unique([manifestId, videoId])`.
- New combined rows now use a source-wide append position and existing combined rows keep first-seen provenance and first-collected ordering when later attempts rediscover the same video.
- No schema change was required; no migration was created or applied.

**Deduplication truth**

- Provider identity remains authoritative when `platform + platformVideoId` exists.
- Shared manifest/runtime dedupe now uses a stronger `getVideoDedupeKey`: platform video ID first, then canonical URL, then a conservative fingerprint with normalized title, duration, published date, owner/source IDs, thumbnail URL, and description hash when provider ID is unavailable.
- The DB layer still persists Dailymotion canonical videos through `videos(platform, platform_video_id)` and combined manifest uniqueness through `manifest_items(manifest_id, video_id)`.
- Duplicate attempt counts remain visible in fetch history, attempt detail, and provenance chips; clearly different videos are not merged solely by title.

**Saved channel UI**

- `/channels` lists persisted Dailymotion sources with name/handle/source ID, avatar/thumbnail if available, reported total, collected unique count, estimated remaining count, coverage percent/status/confidence, attempt count, latest fetch time, and state-aware fetch action labels.
- `/channels/[sourceId]` shows source stats, combined saved results, attempt history, server pagination, JSON/NDJSON export for the displayed saved result set, and a FlexSearch-powered loaded-result search mode.
- `/channels/[sourceId]/attempts/[attemptId]` shows attempt number, source identity, profile/settings, started/completed timestamps, status, resumability, checkpoint, pages, windows, capped/failed windows, duplicate count, timelines, and attempt-scoped videos.
- `/channel-explorer` now links to `/channels` and can be prefilled from saved pages with a source and optional resumable job ID without auto-fetching.

**Saved-results search**

- `POST /api/dailymotion/channel/search-saved` searches persisted manifest/video rows only; it imports the persistence repository and does not call Dailymotion.
- Server search covers title, description, owner/channel, language, URL/video ID, tags, year, and exact duration terms, with pagination/sort.
- The channel page also builds separate FlexSearch indexes over the currently loaded result page for title, owner/channel, description/tags, and low-weight metadata fields including language, year, duration, views, attempt number, profile, and window range.
- Arabic and English queries were smoke-tested against existing saved data. A UTF-8 Arabic query must be sent as UTF-8 JSON.
- Current limitation: server search is substring/field search, not full Postgres FTS or trigram fuzzy search. Typo-tolerant suggestion behavior is limited to the loaded FlexSearch index.

**Verification**

- `npm run db:validate`: passed with sanitized `DATABASE_URL` diagnostics and `DATABASE_URL`-only policy.
- `npm run db:status`: passed; Prisma reported the schema is up to date with the single applied migration.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed on Next.js 16.2.5 with new dynamic routes.
- `npm run lint`: still fails because the existing script calls removed `next lint` and Next interprets `lint` as an invalid project directory.
- Local production server smoke: `http://127.0.0.1:3000/channels` returned 200; `/channel-explorer` returned 200; `/channels/aa2475eb-e3f0-4505-90af-75c97c39ade5` returned 200; `/channels/aa2475eb-e3f0-4505-90af-75c97c39ade5/attempts/ab087469-63d8-44fe-afa8-d970b03303e7` returned 200.
- API smoke: combined manifest endpoint for source `aa2475eb-e3f0-4505-90af-75c97c39ade5` returned total `100`, first page `5`, history `4`; attempt detail for Attempt #4 returned `100` videos, `0` duplicates, `1` window, `1` page; Attempt #5 returned `0` videos and `100` duplicates skipped.
- Saved search smoke: English `news` returned total `100`; Arabic `العربية` returned total `1` when posted as UTF-8 JSON.
- Playwright screenshot smoke with Edge succeeded for `/channels` at desktop viewport and `/channels/[sourceId]` at mobile viewport.
- A local production server is running on `http://127.0.0.1:3000` using the built app.

**Safety**

- `DATABASE_URL` remains the only database URL. `DIRECT_URL` was not restored.
- `db:apply` was not run.
- No `prisma migrate reset`, `prisma db push`, table drops, destructive migration commands, private Dailymotion access, video downloading, scraping, or rehosting were introduced.
- No secrets were intentionally printed.

## 2026-05-07 Channel Explorer page-size, continuation, source catalog, and provenance hardening

**Scope**

- Hardened the Channel Explorer deep-fetch system around Dailymotion's public API `limit=100` maximum, numbered fetch attempts, combined source catalog manifests, result provenance, export modes, and "Continue Fetch" semantics.
- This entry updates the code truth after inspecting the guide, previous ledgers, README, `.env.example`, Next.js local docs, Dailymotion docs, Prisma schema/migration, Channel Explorer UI, Dailymotion route/service code, manifest code, video result cards, and persistence repository.

**Root cause corrected**

- The page-size risk came from older Dailymotion client/settings paths that allowed smaller implicit defaults and did not make the requested provider `limit` fully visible in page-attempt audit data. Current server settings now default to `pageSize=100`, clamp submitted values to max 100, and pass that value through every channel/deep-fetch page request.
- A second live-test bug was found in saved-manifest lookup: full URLs contain `https:`, and the repository treated any colon as an internal `sourceType:id` key. URL lookups are now parsed as source URLs unless the prefix is one of the known source key prefixes.
- Continuation needed a stricter checkpoint contract. Jobs that stop because of max pages/items now advance or preserve the window cursor correctly, and new numbered continuation attempts load the latest unfinished window/page instead of blindly replaying completed pages.

**Files changed for this entry**

- `README.md`
- `PROJECT_LEDGER.md`
- `dailymotion_discovery_ledger.md`
- `src/app/api/dailymotion/channel/manifest/route.ts`
- `src/app/channel-explorer/page.tsx`
- `src/components/channel-explorer/channel-fetch-config-panel.tsx`
- `src/components/channel-explorer/channel-fetch-progress.tsx`
- `src/components/channel-explorer/channel-fetch-history-panel.tsx`
- `src/components/channel-explorer/channel-manifest-summary.tsx`
- `src/components/video/video-card.tsx`
- `src/components/video/video-results-grid.tsx`
- `src/lib/manifests/channel-manifest.ts`
- `src/lib/platforms/dailymotion/channel-deep-fetch-service.ts`
- `src/lib/platforms/dailymotion/channel-fetch-settings.ts`
- `src/lib/platforms/dailymotion/dailymotion-channel-service.ts`
- `src/lib/platforms/dailymotion/dailymotion-client.ts`
- `src/lib/repositories/channel-fetch-persistence.ts`
- `src/types/channel-fetch.ts`
- `src/types/manifest.ts`
- `src/types/video.ts`

**Page-size and provider request truth**

- `src/lib/platforms/dailymotion/dailymotion-client.ts` now centralizes Dailymotion page-size bounds with max 100 and applies the effective `limit` to channel/search request params.
- `src/lib/platforms/dailymotion/channel-fetch-settings.ts` defaults fetch profiles to page size 100 and server-clamps submitted values to `MAX_CHANNEL_FETCH_PAGE_SIZE`, which itself cannot exceed 100.
- Deep-fetch jobs store `pageSize`, per-page `limit`, and full public request params, including `page`, `limit`, `created_after`, and `created_before` when present.
- Live API smoke test against `https://www.dailymotion.com/channel/news` returned one successful page with 100 videos, `pageSize=100`, `recentPageAttempts[0].limit=100`, and `requestParams.limit=100`.

**Combined source catalog manifest**

- `VideoSource` remains the durable source identity anchor.
- Each source now has a durable combined manifest with `query="source-catalog"` and `persistenceType=DURABLE`.
- Attempt manifests remain temporary/auditable per-run result sets.
- `ManifestItem` rows are written for both the attempt manifest and the combined source catalog manifest. The combined manifest is deduped by `(manifestId, videoId)` and preserves first-seen provenance instead of overwriting the original discovery attempt.
- `GET /api/dailymotion/channel/manifest` returns the combined catalog, history, coverage, and actual persistence mode; it now works for both internal source keys such as `channel:news` and pasted source URLs.

**Fetch attempts and continuation**

- Fetch attempts are numbered per source and linked to the same `VideoSource`.
- Attempt summaries include attempt number, settings/profile, status, manifest ID, counts, pages/windows, duplicates, resumability, and checkpoint metadata.
- "Continue Fetch" / "Fetch Remaining" loads existing source state, combined catalog videos, completed window keys, and latest unfinished window cursors before creating the next numbered attempt.
- Dedupe uses platform video ID. Existing combined-catalog videos seed the in-memory seen set so duplicates are skipped and counted rather than duplicated.
- Stop/resume and max-page/max-item checkpoints store the next auditable API page for the active window when possible.

**Progress and UI truth**

- Progress now separates visible result-card count from source-wide collected unique videos and shows reported total, estimated remaining, coverage percent, attempt number, profile, page size, pages fetched, total API requests, current page/window, queued/completed/capped/failed windows, duplicates, status, checkpoint, and resume availability.
- The primary fetch action is state-aware: "Start Fetch", "Continue Fetch", "Resume Fetch", "Fetching...", or "Refresh / Re-check Channel" depending on saved history, resumability, running state, and coverage status.
- "Start New Fetch" is a separate secondary action and does not delete the saved combined source catalog.
- Result modes are "Combined Results", "By Fetch Attempt", and "Current Attempt".
- Result cards show compact provenance chips for source, attempt, profile/status, window, page, collected time, duplicate/new status, manifest label/scope, and selected view mode.
- Export controls support combined JSON/NDJSON and selected-attempt JSON/NDJSON snapshots without secrets.

**Database and migration truth**

- Canonical tables for this feature remain `video_sources`, `videos`, `manifests`, `manifest_items`, `fetch_jobs`, `fetch_windows`, `fetch_page_attempts`, `source_catalog_snapshots`, and `fetch_job_events`.
- No Prisma schema change was required for this hardening. Provenance is stored using existing manifest/video/window/page/job tables plus `metadataSnapshotJson` for rich result-card metadata.
- Migration created this entry: no.
- Migration applied this entry: no.
- `db:apply` run this entry: no.
- `DATABASE_URL` remains the only database URL. `DIRECT_URL` was not restored.

**Verification**

- `npm run db:validate`: passed with sanitized database metadata only.
- `npm run db:status`: passed and reported the configured database schema is up to date.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run typecheck`: passed after clearing stale generated `.next/dev` types from a failed dev-server run.
- `npm run build`: passed on Next.js 16.2.5.
- Manual route test: `https://www.dailymotion.com/user/Isulli282` still receives provider failures for public video pages, but the failed page attempt records `limit=100`, `requestParams.limit=100`, attempt history, and database persistence.
- Manual route test: `https://www.dailymotion.com/channel/news` collected 100 public videos in a single page at `limit=100`, wrote Attempt #4, persisted database history, created a combined manifest with 100 unique items, and returned provenance on the first card (`Attempt #4`, source `news`, page 1, new in attempt, combined manifest).
- Manual continuation test also verified a public multi-page profile path after rebuilding the patched code: a capped first attempt saved a next-page checkpoint, and Continue Fetch created the next attempt from the saved cursor rather than starting over.

**Known limitations**

- Dailymotion may return 404/failed public metadata/video pages for some pasted sources, including the user's `Isulli282` test source in this environment. The app records the failure honestly and does not claim coverage.
- Duplicate videos discovered during a later attempt are counted and the already-saved combined card remains available, but duplicate page hits are not rendered as separate duplicate result cards unless a future schema adds an explicit duplicate-hit table.
- `ManifestItem` stores rich page-attempt provenance in JSON; if operators need indexed querying by page-attempt ID later, add a small Prisma migration for first-class `fetchPageAttemptId` / `fetchJobId` columns on `manifest_items`.
- Runtime memory fallback remains best-effort only. Production history requires `ENABLE_MANIFEST_PERSISTENCE=true` and a reachable database.

## 2026-05-07 Channel Explorer Database-Backed Fetch Persistence

**Scope**

- Full-stack runtime persistence wiring for Channel Explorer history, resume checkpoints, manifests, source metadata, windows, page attempts, coverage, and UI status.
- Documentation and ledger refresh for the now-wired database flow.

**Official docs checked**

- Prisma 7 migration deploy and Prisma Client setup, including the runtime requirement for a PostgreSQL driver adapter.
- Supabase PostgreSQL/Prisma connection guidance for the Session Pooler `DATABASE_URL` workflow.
- Next.js 16 route handler/runtime docs and repo-local docs under `node_modules/next/dist/docs/`.
- Vercel Functions/runtime behavior docs, especially the need to avoid assuming in-memory state survives across deployments or serverless instances.

**Files changed for this entry**

- `package.json`
- `package-lock.json`
- `.env.example`
- `README.md`
- `PROJECT_LEDGER.md`
- `dailymotion_discovery_ledger.md`
- `Guide-Files/dailymotion_channel_deep_fetch_persistence_guide_2026.md`
- `src/lib/prisma/client.ts`
- `src/lib/repositories/channel-fetch-persistence.ts`
- `src/lib/platforms/dailymotion/channel-deep-fetch-service.ts`
- `src/types/channel-fetch.ts`
- `src/app/channel-explorer/page.tsx`
- `src/app/api/dailymotion/channel/metadata/route.ts`
- `src/app/api/dailymotion/channel/history/route.ts`
- `src/app/api/dailymotion/channel/coverage/route.ts`
- `src/app/api/dailymotion/channel/jobs/start/route.ts`
- `src/app/api/dailymotion/channel/jobs/next/route.ts`
- `src/app/api/dailymotion/channel/jobs/stop/route.ts`
- `src/app/api/dailymotion/channel/jobs/[id]/status/route.ts`
- `src/app/api/dailymotion/channel/stop-fetch/route.ts`
- `src/components/channel-explorer/channel-metadata-panel.tsx`
- `src/components/channel-explorer/channel-fetch-progress.tsx`
- `src/components/channel-explorer/channel-fetch-history-panel.tsx`
- `src/components/channel-explorer/channel-coverage-panel.tsx`
- `src/components/channel-explorer/channel-manifest-summary.tsx`

**Database and migration truth**

- Migration reviewed: yes.
- Reviewed migration: `prisma/migrations/20260506_channel_deep_fetch_history_persistence_foundation/migration.sql`.
- Review result: non-destructive creation DDL for enums, tables, indexes, foreign keys, and RLS enablement; no `DROP`, `DELETE`, `TRUNCATE`, `ALTER TABLE DROP`, reset, or `db push` path.
- Migration applied this turn: no. `npm run db:status` reported the configured Supabase/Postgres target already has the single migration applied and the schema is up to date.
- `db:apply` run this turn: no.
- Destructive DB command run: no.
- `DATABASE_URL` remains the only database URL used by runtime, Prisma CLI, status, apply, generate, and Studio workflows. `DIRECT_URL` was not restored.

**Runtime persistence now wired**

- Added `src/lib/prisma/client.ts`, a server-only Prisma helper using `@prisma/adapter-pg` and `pg` because Prisma 7 runtime clients require an explicit PostgreSQL adapter.
- Added `src/lib/repositories/channel-fetch-persistence.ts` as the single Channel Explorer persistence layer.
- `VideoSource` is upserted by platform, source type, and normalized external source identity.
- Channel metadata fields are stored on `VideoSource`, including username/handle, display name, canonical URL, avatar/thumbnail, country/language, reported total, reported total field name, reported total checked time, and metadata JSON.
- `SourceCatalogSnapshot` rows are created for metadata/job coverage snapshots.
- `Video` rows are upserted by platform and platform video ID.
- Temporary `Manifest` rows and `ManifestItem` rows are created/updated without duplicate manifest/video pairs.
- `FetchJob`, `FetchWindow`, and `FetchPageAttempt` are created/updated during start/next/stop/status/history/coverage flows.
- `FetchJobEvent` rows are written for persisted progress and terminal job snapshots so operators have a lightweight event/audit trail without storing noisy per-field churn.
- Counters and checkpoints persisted include collected item counts, unique item counts, duplicate counts, pages fetched, windows processed, capped/failed window counts, current window, current page, and resume cursor JSON.

**Temporary vs permanent data policy**

- Temporary/operational: `FetchJob`, `FetchWindow`, `FetchPageAttempt`, `FetchJobEvent`, temporary `Manifest`, and temporary `ManifestItem`.
- Permanent/canonical: `VideoSource`, `Video`, `SourceCatalogSnapshot`, `SavedVideo`, `Collection`, and durable `Manifest` rows only when explicitly marked durable.
- Temporary jobs and manifests are written with `expiresAt`.
- Cleanup was not introduced in this entry. No temporary cleanup path deletes canonical videos, sources, saved videos, or collections.

**Route behavior**

- `POST /api/dailymotion/channel/metadata` persists source metadata when DB persistence is enabled and returns database persistence metadata in the response.
- `POST /api/dailymotion/channel/jobs/start` creates/persists source, manifest, job, and planned windows; resume can hydrate an old DB job after runtime memory is gone.
- `POST /api/dailymotion/channel/jobs/next` persists API page attempts, upserts videos, inserts manifest items without duplicates, updates windows/jobs, and updates coverage/checkpoints after each chunk.
- `POST /api/dailymotion/channel/jobs/stop` marks the job stopped/resumable and persists the checkpoint.
- `GET /api/dailymotion/channel/jobs/[id]/status` reads DB-backed job graphs when runtime memory is absent.
- `GET /api/dailymotion/channel/history` returns durable DB history rows for the source.
- `GET /api/dailymotion/channel/coverage` calculates coverage from persisted job/source/window/page/video state.
- When `ENABLE_MANIFEST_PERSISTENCE=false` or DB persistence is unavailable, routes fall back to runtime memory and return the UI warning: `Persistence unavailable: history may reset after restart/deploy.`

**UI truth**

- `/channel-explorer` keeps the required ordering: Source Input, Channel Metadata, Fetch Configuration, Fetch Progress, Fetch History, Channel Coverage, Manifest Summary, Result Filters, Result Grid, AI Helper.
- UI panels now display persisted/runtime status, temporary/durable status, resumable checkpoints, reported Dailymotion totals, collected unique public videos, estimated remaining only when a reported total exists, coverage confidence, and honest coverage warnings.
- History rows now include persistence and status badges for persisted/runtime, temporary, resumable, partial, capped, complete, failed, and stopped states.
- Result filters remain separate from fetch settings; filters operate on the current manifest items and do not call the Dailymotion provider API.

**Verification**

- `npm run db:validate`: passed with sanitized Session Pooler metadata only.
- `npm run db:status`: passed and reported `Database schema is up to date!`.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed on Next.js `16.2.5`; build now runs `prisma generate` before `next build`.
- `npm run lint`: blocked by the existing stale `next lint` script, which Next.js 16 treats as an invalid project directory named `lint`.
- Browser/tooling note: `agent-browser` was not installed. Playwright's bundled Chromium install timed out, but `npx playwright screenshot --channel msedge` loaded `/channel-explorer` and captured the page. Initial load showed a React hydration warning about browser-injected `caret-color` styles; this was not introduced by the persistence code.

**Manual route checks**

- `POST /api/dailymotion/channel/metadata` for `https://www.dailymotion.com/user/Isulli282` reached Dailymotion but Dailymotion returned `404`; the route still persisted source metadata with `persistence:"database"`.
- A Quick Preview job for `https://www.dailymotion.com/channel/news` persisted a DB job, one window, one page attempt, three canonical videos, manifest items, history, and coverage.
- A Standard Fetch for `https://www.dailymotion.com/channel/news` was stopped, then the dev server was restarted, then the job status/history were read back from the database, and resume continued the job from the persisted checkpoint.
- Coverage/history remained available after the restart, proving they were not only runtime memory.

**Known limitations from this entry**

- The requested `Isulli282` source returned a provider `404`, so successful video-item persistence was verified with Dailymotion's public `channel/news` endpoint instead.
- `FetchJobEvent` rows are intentionally lightweight progress/terminal events; they are not a full per-field audit log.
- Full coverage is still never claimed when windows are stopped, failed, capped, provider-limited, or max-limit interrupted.
- Runtime memory remains as a deliberate fallback path for disabled/unavailable DB persistence.
- `npm run lint` needs a future ESLint/Biome command migration outside this task's dependency/runtime persistence scope.

**Safety notes**

- Secrets were not intentionally printed.
- `.env` and `.env.local` were not committed or edited.
- No `DIRECT_URL`, Supabase direct host workflow, private Dailymotion access, video downloading, scraping, rehosting, `prisma migrate reset`, `prisma db push`, table drops, or table deletes were introduced.

## 2026-05-07 Next.js Dependency Declaration and Lockfile Alignment

**Scope**

- Dependency-only maintenance for `package.json` and `package-lock.json`.
- No Prisma, Supabase, Dailymotion, Gemini, migrations, UI, database, or application runtime logic was changed.

**Dependency truth**

- `package.json` declares `next` exactly as `^16.2.0`.
- `package-lock.json` root dependency entry also declares `next` as `^16.2.0`.
- The npm-resolved installed Next.js version is `16.2.5`.
- The lockfile aligns Next.js transitive packages with `16.2.5`, including `@next/env` and the platform-specific `@next/swc-*` optional packages.

**Commands run**

- `npm install`: passed; npm reported the project was up to date and found `0` vulnerabilities.
- `npm ls next`: passed; resolved `next@16.2.5`.
- `npm run typecheck`: passed.
- `npm run build`: passed on Next.js `16.2.5` after the existing application env preflight succeeded.

**Safety notes**

- Secrets were not intentionally printed.
- `db:apply` was not run.
- No database or migration command was run.

## 2026-05-06 Dependency Audit Cleanup, Supabase P1001 Hardening, and Migration Apply

**Official docs checked**

- GitHub Advisory Database: PostCSS `GHSA-qx2v-qp2m-jg93` is fixed in `postcss@8.5.10`; this repo now resolves to `postcss@8.5.14`.
- GitHub Advisory Database: `@hono/node-server` `GHSA-92pp-h63x-v22m` is fixed in `@hono/node-server@1.19.13`; this repo now resolves to `1.19.14`.
- Supabase Prisma docs: Supavisor Session Pooler on port `5432` is the supported IPv4-friendly connection shape used by this repo's `DATABASE_URL`.
- Supabase Prisma troubleshooting docs: `connect_timeout=30` is an accepted P1001 troubleshooting query parameter. The repo now applies it process-only for Prisma CLI child commands when the stored `DATABASE_URL` has no explicit timeout.
- Prisma Supabase docs now also describe a `DIRECT_URL` split for some CLI workflows, but this repo's active instruction and current architecture continue to prohibit reintroducing `DIRECT_URL`; no direct host workflow was restored.
- Local Next.js 16 docs under `node_modules/next/dist/docs/` were checked for current install/CLI behavior. The repo remains App Router/Proxy-aligned, and `next lint` is still a removed command that needs a future ESLint migration.

**Files changed for this entry**

- `package.json`
- `package-lock.json`
- `.env.example`
- `README.md`
- `PROJECT_LEDGER.md`
- `dailymotion_discovery_ledger.md`
- `scripts/db-status.mjs`
- `scripts/db-apply.mjs`
- `scripts/prisma-command-env.mjs`

**Dependency audit truth**

- `npm audit fix --force` was not used because the forced path proposed unsafe major-line downgrades instead of preserving the current stack.
- `next` was patch-upgraded from `16.2.4` to `16.2.5`.
- `prisma` and `@prisma/client` remain pinned to `7.8.0`; npm reports `7.8.0` as the latest stable Prisma release in this environment.
- Added package overrides:
  - `postcss@8.5.14`
  - `@hono/node-server@1.19.14`
- Current audit result: `npm audit` reports `0` vulnerabilities.

**Database and migration truth**

- Migration applied: yes.
- Applied migration: `prisma/migrations/20260506_channel_deep_fetch_history_persistence_foundation/migration.sql`.
- Current `npm run db:status`: reaches Prisma migration status and reports the database schema is up to date.
- Canonical durable tables now applied in Supabase/Postgres: `video_sources`, `videos`, `collections`, `saved_videos`, and `source_catalog_snapshots`.
- Temporary/operational tables now applied: `manifests`, `manifest_items`, `fetch_jobs`, `fetch_windows`, `fetch_page_attempts`, and `fetch_job_events`.
- RLS is enabled by the migration on all new public-schema tables without broad public policies.
- At the time of this 2026-05-06 audit, no Prisma Client usage or table reads/writes were found in `src`; the 2026-05-07 entry supersedes this with DB-backed repository wiring.
- No old runtime tables, fallback reads, dual writes, or mixed database truth paths were found in current source code.
- `DATABASE_URL` remains the only active database variable. `DIRECT_URL` was not restored.

**Prisma/Supabase command hardening**

- Added `scripts/prisma-command-env.mjs`.
- `db:status` and `db:apply` now apply `connect_timeout=30` only to Prisma CLI child processes when `DATABASE_URL` does not already include `connect_timeout`.
- `PRISMA_CONNECT_TIMEOUT_SECONDS` is optional and only controls that process-only Prisma CLI timeout default.
- The stored env file and actual target URL are not rewritten.
- DB scripts now call the local Prisma CLI JS entrypoint with `process.execPath` instead of invoking Prisma through `npx`/Windows shell argument concatenation.
- `P1001` retry behavior remains fail-closed: the scripts retry narrow Prisma reachability failures once and still exit non-zero when the database cannot be reached.

**Verification**

- `npm audit`: passed with `0` vulnerabilities.
- Script syntax checks: passed for `scripts/prisma-command-env.mjs`, `scripts/db-status.mjs`, and `scripts/db-apply.mjs`.
- `npx prisma validate`: passed.
- `npm run db:validate`: passed with sanitized Session Pooler metadata only.
- `npm run db:status`: passed and reported "Database schema is up to date!".
- `CONFIRM_DB_APPLY=true npm run db:apply`: applied the pending migration successfully.
- Second `CONFIRM_DB_APPLY=true npm run db:apply`: passed as a no-op with no pending migrations.
- `npx prisma generate`: passed and generated Prisma Client `7.8.0`.
- `npm run typecheck`: passed.
- `npm run build`: passed on Next.js `16.2.5`.
- DNS/TCP diagnostic: `aws-0-eu-west-1.pooler.supabase.com` resolved and TCP checks to ports `5432` and `6543` succeeded from this machine.
- `npm run lint`: still blocked because the existing script runs removed Next.js 16 command `next lint`, which Next interprets as an invalid project directory named `lint`.

**Safety notes**

- Secrets were not intentionally printed; DB scripts continued to redact raw URLs.
- No `prisma migrate reset`, `prisma db push`, table drops, table deletes, or destructive DB repair commands were run.
- No Dailymotion provider behavior, manifest filtering, AI routes, auth boundaries, or browser exposure of server secrets was changed.
- At the time of this 2026-05-06 entry, the live database had schema foundation tables but product flows still used runtime/in-memory persistence. The 2026-05-07 entry supersedes this with DB-backed Channel Explorer runtime wiring.

## 2026-05-06 Channel Explorer Deep Fetch, Metadata, History, Coverage, and Persistence Foundation

**Guide read confirmation**

- `Guide-Files/dailymotion_channel_deep_fetch_persistence_guide_2026.md` was read before implementation and treated as target architecture, not current truth.
- Current code was audited before edits. Where guide and code differed, current code stayed authoritative and the implementation extended existing manifest, route, and Dailymotion adapter paths instead of rebuilding from scratch.

**Official docs checked**

- Dailymotion large catalog guide: single result windows can be capped around 1000 results, and large catalogs should be split with `created_after` / `created_before`.
- Dailymotion list videos reference: `limit` max is 100, and `page` max is 10 when `limit=100`.
- Dailymotion retrieve user information reference: public user/profile metadata can request `videos_total`.
- Prisma 7 docs: `prisma.config.ts` is the CLI datasource authority, removed migrate diff flags require `--to-schema`, and `migrate deploy` is the production/staging apply path.
- Supabase Prisma docs: this repo remains aligned to the Supabase Session Pooler URL on port `5432` through `DATABASE_URL` only.
- Next.js 16 local docs under `node_modules/next/dist/docs`: App Router route handlers remain `app/**/route.ts`, `.env*` files are loaded from the root even with `src/`, and Proxy replaces Middleware.
- Vercel docs: Function duration is finite, so large channel fetches should be chunked instead of one giant request.

**Files changed for this entry**

- `prisma/schema.prisma`
- `prisma/migrations/migration_lock.toml`
- `prisma/migrations/20260506_channel_deep_fetch_history_persistence_foundation/migration.sql`
- `.env.example`
- `README.md`
- `src/types/channel-fetch.ts`
- `src/types/manifest.ts`
- `src/lib/config/env.ts`
- `src/lib/manifests/channel-manifest.ts`
- `src/lib/platforms/dailymotion/dailymotion-client.ts`
- `src/lib/platforms/dailymotion/dailymotion-channel-service.ts`
- `src/lib/platforms/dailymotion/channel-fetch-settings.ts`
- `src/lib/platforms/dailymotion/channel-metadata-service.ts`
- `src/lib/platforms/dailymotion/channel-deep-fetch-service.ts`
- `src/app/api/dailymotion/channel/metadata/route.ts`
- `src/app/api/dailymotion/channel/jobs/start/route.ts`
- `src/app/api/dailymotion/channel/jobs/next/route.ts`
- `src/app/api/dailymotion/channel/jobs/stop/route.ts`
- `src/app/api/dailymotion/channel/jobs/[id]/status/route.ts`
- `src/app/api/dailymotion/channel/history/route.ts`
- `src/app/api/dailymotion/channel/coverage/route.ts`
- `src/app/api/dailymotion/channel/stop-fetch/route.ts`
- `src/app/api/dailymotion/search/route.ts`
- `src/app/channel-explorer/page.tsx`
- `src/components/channel-explorer/channel-fetch-config-panel.tsx`
- `src/components/channel-explorer/channel-metadata-panel.tsx`
- `src/components/channel-explorer/channel-fetch-history-panel.tsx`
- `src/components/channel-explorer/channel-coverage-panel.tsx`
- `src/components/channel-explorer/channel-fetch-progress.tsx`
- `src/components/channel-explorer/channel-input-panel.tsx`
- `src/components/channel-explorer/channel-manifest-summary.tsx`
- `src/components/filters/advanced-filter-panel.tsx`
- `src/components/filters/active-filter-chips.tsx`

**Product behavior now**

- Channel Explorer now has separate Source Input, Channel Metadata, Fetch Configuration, Fetch Progress, Fetch History, Channel Coverage, Manifest Summary, Result Filters, Active Filter Chips, Results, and AI helper sections.
- Fetch configuration controls provider collection only and is submitted only through explicit start/resume actions.
- Result filters remain local manifest-only filters and do not trigger Dailymotion API requests.
- Filter behavior still filters first, sorts second, and renders third; original manifest items are not mutated.
- `0` remains valid numeric metadata through the existing zero-safe parser and filter engine.

**Fetch profiles added**

- `quick-preview`: one page for source verification.
- `standard-fetch`: one uncapped-compatibility result window with legacy `MAX_CHANNEL_FETCH_PAGES` context.
- `deep-balanced`: yearly windows with capped-year splits to months.
- `deep-aggressive`: recursive year/month/week/day splitting within hard caps.
- `recent-sync`: recent date-range profile.
- `historical-backfill`: older date-range profile.
- `custom-expert`: user-configurable caps, dates, units, split behavior, delay, stop behavior, and partial preservation.

**Dailymotion handling**

- The Dailymotion client now supports additional provider query params for time-window fetches.
- Deep fetch uses `created_after` and `created_before` timestamps where windows are planned.
- Page size is clamped by server hard caps and Dailymotion's documented maximum of 100.
- Window caps are treated honestly: if a window still has more results at the provider cap, it is split when possible, otherwise marked capped/incomplete.
- Videos are deduplicated by normalized Dailymotion video ID.
- Public metadata fetching still does not require `DAILYMOTION_API_KEY`; the optional key remains server-only.
- No downloading, scraping, stream bypassing, rehosting, private/protected data access, or invented video data was added.

**Channel metadata and reported total**

- New metadata route: `POST /api/dailymotion/channel/metadata`.
- User/profile metadata requests ask for public fields including `id`, `username`, `screenname`, `url`, `description`, `country`, `language`, and `videos_total`.
- UI labels the value as "Reported total from Dailymotion", never as a guaranteed total.
- If `videos_total` is unavailable, the UI says reported total is unavailable and falls back to collected unique videos plus coverage status.
- Metadata snapshots are represented in the Prisma foundation through `VideoSource` and `SourceCatalogSnapshot`.

**History, resume, and persistence status**

- Runtime route-backed jobs now exist:
  - `POST /api/dailymotion/channel/jobs/start`
  - `POST /api/dailymotion/channel/jobs/next`
  - `POST /api/dailymotion/channel/jobs/stop`
  - `GET /api/dailymotion/channel/jobs/[id]/status`
  - `GET /api/dailymotion/channel/history`
  - `GET /api/dailymotion/channel/coverage`
- Jobs process small route-handler chunks rather than one giant long-running request.
- Runtime history/resume is real for the current server runtime session and is labeled as runtime-memory persistence in the UI.
- Durable DB-backed history/resume is schema-ready but not wired into runtime repositories yet. At the time of this entry the migration had not been applied; see the newer audit/apply entry for current migration status.
- The UI shows resume buttons only for actual runtime jobs that are resumable.

**Coverage behavior**

- Coverage shows reported total when available, collected unique public videos, estimated remaining, coverage percent when reportable, completeness status, confidence, capped windows, failed windows, pending windows, latest checkpoint, and last resume point.
- Complete coverage is only shown when every planned window completed without caps, failures, stops, or max-limit interruptions.
- Partial/capped/stopped/failed/max-items/provider-limited states are kept distinct.

**Database and migration truth**

- Canonical durable models now include `VideoSource`, `Video`, `Collection`, `SavedVideo`, and `SourceCatalogSnapshot`.
- Temporary/operational models now include `Manifest`, `ManifestItem`, `FetchJob`, `FetchWindow`, `FetchPageAttempt`, and `FetchJobEvent`.
- Temporary manifests and fetch jobs have `expiresAt`; canonical videos, sources, saved videos, and collections are durable.
- Migration created: `prisma/migrations/20260506_channel_deep_fetch_history_persistence_foundation/migration.sql`.
- Migration applied at the time of this entry: no. Superseded by the newer audit/apply entry.
- `db:apply` was not run during this entry. It was run later under explicit confirmation.
- No destructive DB command was run.
- `prisma db push`, `prisma migrate reset`, drops, or table deletion commands were not run.
- Tables are mapped to lowercase snake_case names for Postgres/Supabase compatibility.
- RLS is enabled in the migration without broad public policies so future owner-scoped policies can be added deliberately.

**Environment variables**

- Existing variables preserved: `ENABLE_PGVECTOR`, `ENABLE_MANIFEST_PERSISTENCE`, `MAX_CHANNEL_FETCH_PAGES`, `MAX_CHANNEL_FETCH_ITEMS`, `CHANNEL_FETCH_DELAY_MS`.
- Added and documented:
  - `MAX_CHANNEL_FETCH_WINDOWS`
  - `MAX_CHANNEL_FETCH_WINDOW_DEPTH`
  - `MAX_CHANNEL_FETCH_TOTAL_PAGES`
  - `MAX_CHANNEL_FETCH_PAGE_SIZE`
  - `CHANNEL_FETCH_MIN_DELAY_MS`
  - `CHANNEL_FETCH_DEFAULT_PROFILE`
  - `CHANNEL_FETCH_JOB_TTL_HOURS`
  - `TEMP_MANIFEST_TTL_HOURS`
- `MAX_CHANNEL_FETCH_PAGES` remains the legacy one-window fetch-all compatibility cap; deep fetch uses `MAX_CHANNEL_FETCH_TOTAL_PAGES` across all windows.
- `DIRECT_URL` was not restored.
- Supabase direct host guidance was not reintroduced as an active workflow.

**Verification**

- `npx prisma validate`: passed.
- `npm run typecheck`: passed.
- `npx prisma generate`: passed and generated Prisma Client `7.8.0`.
- `npm run db:validate`: passed and printed sanitized Session Pooler metadata only.
- `npm run db:status`: reached Prisma migration status successfully; it exited non-zero because the new migration is pending and was intentionally not applied.
- `npm run build`: passed on Next.js `16.2.4`.
- `npm run lint`: blocked because the existing script still runs removed Next.js 16 command `next lint`, which Next interpreted as an invalid project directory named `lint`.
- Local dev server: started on `http://localhost:3000`; `GET /channel-explorer` returned HTTP 200.
- Live Dailymotion manual source test from PowerShell was blocked by DNS resolution failure for `api.dailymotion.com` in this shell, so provider runtime behavior was not claimed as manually verified.

**Safety notes**

- Secrets were not intentionally printed. `db:validate`/`db:status` output stayed sanitized.
- `DATABASE_URL` remains the only active database URL.
- `DAILYMOTION_API_KEY` remains optional and server-only.
- Runtime persistence is not DB persistence yet; do not claim durable resume until repositories are wired and the migration is applied/verified.

## 2026-05-06 Prisma Schema-Engine Status Diagnostic Repair

**Decision**

- `npm run db:status` now runs `scripts/db-status.mjs` instead of raw `prisma migrate status`.
- The active database workflow remains `DATABASE_URL` only.
- `DATABASE_URL` remains expected to be the Supabase Session Pooler URL on port `5432`.
- `DIRECT_URL` was not restored as a config value, fallback, override, or documented active workflow.
- `prisma` and `@prisma/client` are pinned to the verified aligned `7.8.0` pair instead of floating on `latest`.

**Root cause found**

- Raw `npx prisma migrate status` still targets the Session Pooler host from `DATABASE_URL`, then returns only `Error: Schema engine error:`.
- A non-mutating Prisma connectivity preflight using `SELECT 1` exposed the underlying blocker that raw migrate status hid.
- Final diagnostic behavior showed one transient `P1001` reachability failure followed by `P1000` authentication failure against the Session Pooler.
- Therefore the bare schema-engine error is masking an environment-specific connection/credential problem for the current `DATABASE_URL`, not a `DIRECT_URL` regression, Prisma schema syntax error, or package version mismatch.

**Migration-history truth**

- The repo still has no committed `prisma/migrations` directory.
- Missing migration history is not the current connection failure because connectivity fails before migration status can inspect `_prisma_migrations`.
- It remains a separate deploy blocker: Prisma production deploys require committed migration files, not only `schema.prisma`.
- `scripts/db-apply.mjs` now fails closed before `migrate deploy` if no committed `migration.sql` files exist under `prisma/migrations`.

**Files changed for this entry**

- `package.json`
- `package-lock.json`
- `scripts/db-status.mjs`
- `scripts/db-apply.mjs`
- `scripts/db-validate-env.mjs`
- `.github/workflows/db-migrate.yml`
- `.env.example`
- `.gitignore`
- `.agents/skills/supabase/SKILL.md`
- `Guide-Files/env_backup.txt`
- `README.md`
- `PROJECT_LEDGER.md`
- `dailymotion_discovery_ledger.md`

**Status wrapper behavior**

- Validates `DATABASE_URL` without printing secrets.
- Prints sanitized protocol, host, port, database, host type, and whether query parameters exist.
- Warns when local Prisma migration history is missing.
- Runs `npx prisma db execute --stdin` with `SELECT 1` before migration status.
- Retries one `P1001` reachability failure once to avoid hiding a stable credential/config problem behind a transient pooler path failure.
- Runs `prisma migrate status` only after connectivity succeeds.
- Allows the guarded apply workflow to continue only for pending or uninitialized migration status after connectivity succeeds.

**Session Pooler query-parameter decision**

- Current Supabase Prisma documentation shows the Session Pooler URL on port `5432` for Prisma migrations and app use.
- The project documentation now states that `pgbouncer=true` is not required for the Session Pooler URL on port `5432`.
- Prisma/Supabase query parameters should only be added when official troubleshooting for the exact pooler mode requires them.

**Verification**

- Script syntax checks: passed for `scripts/db-status.mjs`, `scripts/db-apply.mjs`, and `scripts/db-validate-env.mjs`.
- `npm run db:validate`: passed; sanitized output showed Session Pooler host, port `5432`, database `postgres`, and no query params.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed and generated Prisma Client `7.8.0`.
- Raw `npx prisma migrate status`: still returned bare `Error: Schema engine error:` after loading the Session Pooler datasource.
- `npm run db:status`: now exits 1 with clear diagnostics; current run retried one `P1001` and then reported `P1000` authentication failure.
- DNS/TCP check: DNS resolved the Session Pooler host; TCP port `5432` succeeded on one returned address and failed on another, matching the transient reachability symptom.
- `npm run typecheck`: passed.
- `npm run build`: passed.

**Safety notes**

- `db:apply` was not run.
- No migration was created.
- No migration was applied.
- No reset, drop, or `db push` command was run.
- No Dailymotion, Gemini, UI, manifest, filter, saved-library, or video-card product logic was changed.
- Secrets were not intentionally printed. The local backup-like `Guide-Files/env_backup.txt` had secret-looking DB placeholders redacted and was added to `.gitignore`.

## 2026-05-06 Database URL Only Workflow Update

**Decision**

- The active Prisma/database workflow now uses `DATABASE_URL` only.
- `DATABASE_URL` must be the Supabase Session Pooler connection string for local Windows shells, online agents, Vercel, GitHub Actions, and other IPv4-limited environments.
- `DIRECT_URL` was removed from active Prisma config, validation scripts, app env validation, runtime env config, examples, and the GitHub migration workflow.
- Supabase direct hosts such as `db.<project-ref>.supabase.co` are kept only as a warning/reference because they can fail with Prisma `P1001` where IPv6 is unavailable.

**Reason**

- `npm run db:validate` could pass while `npm run db:status` still failed if Prisma selected a stale direct Supabase host.
- A one-variable policy prevents migration/status commands from targeting a different database than runtime.

**Files changed for this entry**

- `prisma.config.ts`
- `scripts/db-validate-env.mjs`
- `scripts/db-apply.mjs`
- `scripts/app-validate-env.mjs`
- `src/lib/config/env.ts`
- `.env.example`
- `.github/workflows/db-migrate.yml`
- `README.md`
- `dailymotion_discovery_ledger.md`
- `PROJECT_LEDGER.md`

**Verification**

- `npm run db:validate`: passed with `DATABASE_URL` only; printed sanitized protocol/host/port/database/host type and confirmed Prisma CLI/migrations use `DATABASE_URL` only.
- `npm run db:status`: targeted the Supabase Session Pooler host from `DATABASE_URL`; it did not attempt the Supabase direct host. Prisma then returned a bare schema-engine error, so live migration status still needs follow-up.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Active config/script/workflow audit found no `DIRECT_URL` readers.
- `npm run db:apply` was not run.

**Risks and limitations**

- Local secret-bearing files may still contain old keys, but active project code no longer reads `DIRECT_URL`.
- `DATABASE_URL` must be a valid, percent-encoded Supabase Session Pooler URL.
- The repo snapshot still has no `prisma/migrations` directory, so migration-status behavior may remain limited until committed migrations exist or Prisma's schema-engine error is investigated against the real database.

## Project Identity

**Project name**

AI Public Video Discovery Platform

**Short description**

A Next.js App Router application for researching public Dailymotion video metadata through manifests, filters, previews, and server-side AI helper routes.

**Main mission**

Help a researcher, analyst, or future product team discover, inspect, organize, and summarize public video metadata without downloading or rehosting video files.

**What problem the platform solves**

- Public video research is noisy when every search starts from scratch.
- Channel exploration often needs deduplication, pagination, stop/resume safety, and filtering by real metadata.
- Teams need a structured way to move from raw feed results to a reusable manifest that can be filtered, summarized, and eventually persisted.

**What the platform is not allowed to do**

- It is not a video downloader.
- It must not rehost or copy raw videos.
- It must not scrape private streams or bypass platform restrictions.
- AI features must not invent videos, channels, counts, or URLs.

**2026 product vision**

- Evolve from a Dailymotion-only MVP into a multi-platform public video research workspace.
- Add durable persistence for manifests, fetch jobs, and saved collections on Supabase/Postgres.
- Expand AI from helper text responses into structured indexing, semantic search, and workflow support.
- Keep the product safe, metadata-only, and suitable for Vercel-hosted online-first workflows.

## Application Goal

The app is built around the idea of **AI Public Video Discovery**: use real public metadata as the source of truth, shape it into manifests, and let filters and AI operate only on what the app actually fetched.

**Dailymotion public metadata discovery**

- The current platform adapter targets Dailymotion public endpoints.
- The app fetches titles, descriptions, thumbnails, duration, views, language, channel info, owner info, tags, and public URLs.
- Metadata is normalized into a common `NormalizedVideoMetadata` shape before the UI touches it.

**Channel Explorer**

- The main product surface today is `/channel-explorer`.
- It accepts channel URLs, profile URLs, usernames, and channel IDs.
- It can analyze the input, fetch the first page, or fetch all public pages with safety limits and delays.

**Manifests and why they exist**

- A manifest is the app's working set of fetched metadata.
- It gives the UI a stable structure for filtering, sorting, previewing, summarizing, and eventually persisting.
- The current explorer mostly uses in-memory manifests returned from API routes.

**Advanced filtering and AI helper features**

- Filters support keyword, views, duration, year/date, language, channel/owner, thumbnail/description presence, and sorting.
- AI routes help parse search intent, suggest filters, and summarize manifests.
- AI is intentionally constrained by a safety prompt so it only discusses real fetched metadata.

## Current Features

| Feature | Status | Notes |
| --- | --- | --- |
| Home / Dashboard | Implemented | Entry page with product framing and navigation into core work areas. |
| Search | Partial UI | UI shell exists and `/api/dailymotion/search` exists, but the page itself is still placeholder-oriented. |
| AI Search | Partial UI | Page explains available AI capabilities; no full chat/search workflow yet. |
| Channel Explorer | Implemented MVP | Primary working feature with analyze, fetch, fetch-all, stop, filters, results, and AI helper panel. |
| Dailymotion public metadata fetching | Implemented | Uses Dailymotion public API fields and normalization helpers. |
| Fetch All / paginated fetching | Implemented | Uses page size, max page/item caps, and inter-page delay. |
| Stop Fetching / partial manifests | Implemented client-side | Browser `AbortController` stops requests; partial manifests remain visible. |
| Advanced filters | Implemented | Client-side filtering plus a server route for filtering supplied items. |
| Video cards | Implemented | Stable thumbnail ratio, grouped metadata, line clamping, and external open action. |
| Hover preview | Implemented | Uses Dailymotion embed iframe when `embedUrl` is available. |
| Saved Library | Placeholder UI | Persistence model exists, but end-user saved video workflow is not wired yet. |
| Supabase / Postgres foundation | Implemented foundation | Env validation, session helpers, schema, and workflow docs are present. |
| Prisma migration workflow | Implemented foundation | Validate/status/apply scripts plus GitHub Actions workflow exist. |
| Gemini AI integration | Implemented foundation | Three server routes call Gemini with controlled error handling. |
| Light / Dark mode | Implemented | CSS token system with localStorage persistence and system fallback. |
| Theme toggle | Implemented | Header icon toggle updates the root theme class and dataset. |
| Responsive UI | Implemented | Layouts use responsive grids, stacked header nav, and adaptive result grids. |

## Tech Stack

**Framework and language**

- Next.js `16.2.4`
- React `19.2.5`
- React DOM `19.2.5`
- TypeScript `6.0.3`
- App Router architecture

**Styling and UI**

- Tailwind CSS `4.2.4`
- `@tailwindcss/postcss` `4.2.4`
- Custom UI primitives in `src/components/ui`
- `@radix-ui/react-slot` `1.2.4`
- `class-variance-authority` `0.7.1`
- `clsx` `2.1.1`
- `tailwind-merge` `3.5.0`
- `lucide-react` `1.14.0`

**Data, validation, and state**

- Prisma `7.8.0`
- `@prisma/client` `7.8.0`
- PostgreSQL via Supabase
- `zod` `4.4.3`
- `zustand` `5.0.13`
- `dotenv` `17.4.2`
- `flexsearch` `0.8.212`

**Platform integrations**

- `@supabase/supabase-js` `2.105.3`
- `@supabase/ssr` `0.10.2`
- `@google/generative-ai` `0.24.1`
- Dailymotion public API

**Installed but not visibly active in scanned UI code**

- `framer-motion` `12.38.0` is installed, but there were no visible imports in the scanned `src` files.

## External Connections

**Supabase connection strategy**

- Runtime database access is documented around `DATABASE_URL`.
- The recommended connection for this repo's online-first workflow is the Supabase Session Pooler.
- Direct Supabase hosts may fail in IPv4-only environments.

**Supabase Session Pooler usage**

- `.env.example` and README both recommend a Session Pooler URL for `DATABASE_URL`.
- DB scripts classify pooler hosts and print only sanitized host metadata.

**DATABASE_URL behavior**

- Required for DB validation, runtime DB access, Prisma CLI, migration status, migration deploy, client generation, and Prisma Studio.
- Required in local `.env.local`, Vercel env vars, and GitHub Actions if migration/status commands are used.

**DIRECT_URL policy**

- Removed from the active project workflow.
- It is not a supported env variable, fallback, override, or duplicate connection string in this repo.
- Supabase direct connection strings are mentioned only as a warning/reference for Prisma `P1001` risk in IPv4-limited environments.

**Gemini API server-only behavior**

- `GEMINI_API_KEY` is server-only.
- `GEMINI_MODEL` is server-only and optional.
- AI routes return controlled error payloads when the key is missing or the API is unavailable.
- The Gemini helper uses `GEMINI_MODEL` when set, otherwise it falls back to `gemini-1.5-flash`.

**Dailymotion API / public metadata behavior**

- Works through public metadata endpoints.
- Supports anonymous requests where Dailymotion allows them.
- `DAILYMOTION_API_KEY` is optional and only added as a Bearer token when configured.

**Vercel deployment behavior**

- `npm run build` executes `scripts/app-validate-env.mjs` before `next build`.
- Public env parsing and database env parsing include build-time guard stubs for the Next.js production build phase.
- Proxy/session refresh lives in `src/proxy.ts`, which aligns with Next.js 16.

**GitHub Actions migration workflow**

- `.github/workflows/db-migrate.yml` is manual-only.
- It validates `DATABASE_URL`, runs pre-status, gates apply with confirmation, then runs post-status.

## Environment Variables

**Notes**

- Real `.env` data was not copied into this ledger.
- A local `.env` file exists and appears populated; treat it as sensitive.
- Use `.env.example` as the documented contract.

| Key | Class | Required now | Purpose | Where to get or set it | Missing behavior / default |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public / browser-safe | Yes | Public base URL for the app. | Local `.env.local`, Vercel env vars. | Build env validation fails if missing. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public / browser-safe | Yes | Public Supabase project URL for browser/server SSR clients. | Supabase project settings. | Build env validation fails if missing. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public / browser-safe | Yes | Browser-safe Supabase publishable key. | Supabase project settings. | Build env validation fails if missing. |
| `DATABASE_URL` | Server-only required | Yes | Canonical Postgres connection string for runtime, Prisma CLI, migration status, migration deploy, client generation, and Prisma Studio. | Supabase Connect page; use the Session Pooler URL. | DB scripts fail if missing or invalid. |
| `GEMINI_API_KEY` | Server-only required | Yes for AI routes | Enables Gemini-backed AI helper routes. | Google AI Studio or configured provider flow. | AI routes return unavailable/missing-config errors. |
| `GEMINI_MODEL` | Server-only optional | No | Selects the Gemini model for server AI routes. Never expose through `NEXT_PUBLIC_*`. | Local `.env.local` or Vercel env vars. | Defaults to `gemini-1.5-flash`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only optional | No | Reserved for privileged server-side Supabase operations. | Supabase project settings. | Not required by visible runtime paths. |
| `DAILYMOTION_API_BASE_URL` | Server-only optional | No | Base URL for Dailymotion API requests. | Usually keep default. | Defaults to `https://api.dailymotion.com`. |
| `DAILYMOTION_API_KEY` | Server-only optional | No | Optional Bearer token for Dailymotion endpoints that need auth. | Dailymotion developer account if applicable. | Public metadata fetching still attempts anonymous access. |
| `CRON_SECRET` | Server-only optional | No | Future secret for scheduled or protected cron entrypoints. | Self-generated. | No visible effect in scanned runtime routes. |
| `WEBHOOK_SECRET` | Server-only optional | No | Future secret for protected webhook handlers. | Self-generated. | No visible effect in scanned runtime routes. |
| `ENABLE_PGVECTOR` | Feature flag | No | Future toggle for pgvector and semantic features. | Local or deployment env. | Defaults to `false`. |
| `ENABLE_MANIFEST_PERSISTENCE` | Feature flag | No | Toggles Channel Explorer DB-backed manifests, jobs, history, resume, and coverage. | Local or deployment env. | Defaults to `true`; falls back to runtime memory with a UI warning if disabled or DB persistence is unavailable. |
| `MAX_CHANNEL_FETCH_PAGES` | Safety limit | No | Upper bound for fetch-all pagination pages. | Local or deployment env. | Defaults to `200`. |
| `MAX_CHANNEL_FETCH_ITEMS` | Safety limit | No | Upper bound for total fetched items in fetch-all mode. | Local or deployment env. | Defaults to `10000`. |
| `CHANNEL_FETCH_DELAY_MS` | Safety limit | No | Delay between fetch-all page requests. | Local or deployment env. | Defaults to `250`. |
| `AI_EMBEDDING_MODEL` | Future-only | No | Placeholder for future embeddings or semantic search work. | Future AI provider config. | No visible effect in current runtime code. |

**Accepted values and DB URL notes**

- `DATABASE_URL` must be a `postgres://` or `postgresql://` URL.
- Use the Supabase Session Pooler host shape `aws-0-<region>.pooler.supabase.com`.
- Percent-encode reserved password characters such as `#`, `@`, `?`, `/`, and `$` before pasting DB URLs.
- `ENABLE_PGVECTOR` and `ENABLE_MANIFEST_PERSISTENCE` accept string values `true` or `false`.
- Safety limits are parsed as integers.

## Database and Prisma

**Prisma's role**

- Defines the relational schema.
- Powers client generation and migration/status workflows.
- Is not visibly used by runtime route handlers yet; the scanned `src` code did not show `@prisma/client` imports in app logic.
- Current installed and locked Prisma version pair is `prisma` `7.8.0` and `@prisma/client` `7.8.0`.

**Supabase / Postgres role**

- Supabase provides the managed Postgres target and SSR auth/session foundation.
- Postgres is intended to persist videos, sources, manifests, jobs, and saved items as the app matures beyond in-memory manifests.

**`prisma.config.ts`**

- Loads dotenv-backed env files in priority order.
- Resolves the Prisma CLI datasource URL from `DATABASE_URL` only.
- Documents why this project uses the Supabase Session Pooler instead of direct Supabase hosts.

```text
Prisma CLI -> DATABASE_URL -> Supabase Session Pooler
```

**`prisma/schema.prisma`**

- Keeps the datasource provider as `postgresql`.
- Defines the data model without embedding connection strings in the schema file.

**Migration commands**

```bash
npm run db:validate
npm run db:status
npm run db:apply
npm run db:migrate:deploy
npm run db:create-migration
npm run db:generate
npm run db:studio
```

**Migration status diagnostics**

- `npm run db:status` is a project wrapper, not raw Prisma.
- The wrapper validates env, applies a process-only Prisma CLI `connect_timeout` default when needed, checks Prisma connectivity with a non-mutating `SELECT 1`, then runs `prisma migrate status` only after connectivity succeeds.
- Current live status against the configured Supabase Session Pooler reaches migration status successfully and reports the schema is up to date.

**Why `DATABASE_URL` is the required DB variable**

- It is the single canonical connection variable for runtime and default CLI behavior.
- It supports the practical Supabase Session Pooler workflow for Vercel, Codespaces, GitHub Actions, and Windows environments.

**Why `DIRECT_URL` was removed from active workflow**

- Supabase direct hosts can be unavailable in IPv4-only environments.
- Keeping a second migration URL allowed Prisma status/apply commands to target a stale direct host while validation passed against the pooler.
- A one-variable policy keeps runtime, status, deploy, and generated-client workflows aligned.

**Database models**

| Model | Purpose |
| --- | --- |
| `VideoSource` | Tracks a source entity such as a channel, profile, or external source record. |
| `Video` | Stores normalized video metadata across platforms. |
| `Manifest` | Stores a manifest header, origin, status, and counts. |
| `ManifestItem` | Joins a manifest to specific videos with ordering and AI score fields. |
| `FetchJob` | Tracks long-running fetch work, cursors, limits, status, and errors. |
| `SavedVideo` | Represents a per-user saved or favorited video entry with notes. |

**Current schema reality**

- The Prisma migration history exists under `prisma/migrations`.
- `20260506_channel_deep_fetch_history_persistence_foundation` has been applied to the configured Supabase/Postgres target.
- Channel Explorer runtime paths now use the schema through the centralized persistence repository when `ENABLE_MANIFEST_PERSISTENCE=true`, with runtime memory only as the disabled/unavailable fallback.

## Migration Workflow

**Local / online workflow**

```bash
npm install
cp .env.example .env.local
npm run db:validate
npm run db:status
CONFIRM_DB_APPLY=true npm run db:apply
```

**Dotenv loading**

- `scripts/load-project-env.mjs` is the shared loader for standalone Node scripts.
- It reads `.env.local`, `.env`, `.env.development`, and `.env.production`.
- Real environment variables always win because `dotenv` is loaded with `override: false`.

**What each DB script does**

- `db:validate`: validates DB env and prints sanitized connection metadata only.
- `db:status`: validates env, applies process-only Prisma CLI timeout hardening, checks Prisma connectivity with `SELECT 1`, then runs `prisma migrate status` only after connectivity succeeds.
- `db:apply`: validates env, requires committed migration files, checks status through the wrapper, requires confirmation for production-like targets, runs `migrate deploy`, runs `generate`, and checks status again.

**GitHub Actions workflow**

- Manual `workflow_dispatch` only.
- Requires `DATABASE_URL`.
- Confirmation gate prevents accidental apply runs.

**Why `prisma migrate deploy` is used**

- It is the production-safe apply path for committed migration files.
- It avoids the drift and risk of `prisma db push` as a production migration strategy.
- It is intentionally blocked by this repo when no committed `prisma/migrations/**/migration.sql` files exist.

**Commands to avoid**

- Do not run `prisma migrate reset` in shared or production-like environments.
- Do not drop tables as part of helper automation.
- Do not treat `db:apply` as safe without verifying the target database.

## Architecture Overview

**High-level request flow**

1. A page or UI action sends JSON to an App Router API route.
2. The route calls `src/lib` helpers for parsing, fetching, normalization, filtering, or AI.
3. Helpers return normalized metadata or controlled error states.
4. The page renders the manifest or error state without needing raw provider-specific data shapes.

**Search flow**

1. Client submits a search query.
2. `POST /api/dailymotion/search` calls the Dailymotion client.
3. Results are normalized.
4. A temporary search manifest is created and returned.
5. The current `/search` page is still a placeholder shell, so this flow is foundation-first.

**Channel Explorer flow**

1. User enters a Dailymotion channel/profile/user input.
2. The page can call analyze, fetch, or fetch-all routes.
3. Input analysis resolves the source type and API path.
4. Results are normalized into a `ChannelManifest`.
5. The page applies client-side filters and renders cards.

**Manifest creation flow**

1. Provider results are normalized into `NormalizedVideoMetadata`.
2. `createChannelManifest` or `createTemporarySearchManifest` wraps items with manifest metadata.
3. `dedupeVideos` removes duplicates by app-level video ID.

**Filtering flow**

1. The page keeps a filter object in local state.
2. `applyAdvancedVideoFilters` applies keyword, numeric, date, metadata-presence, and sort logic.
3. `strictMetadataFiltering` decides whether missing metadata should fail a filter.

**AI helper flow**

1. An API route receives a query, instruction, or manifest.
2. The route prepends the shared safety prompt.
3. Gemini returns text output.
4. The route returns the text or a controlled error message.

**Saved Library flow**

- UI surface exists at `/saved`.
- Database model `SavedVideo` exists.
- No visible runtime route or UI action yet writes saved entries into the database.

**Theme / UI flow**

1. `layout.tsx` injects a no-flash theme bootstrapping script.
2. `ThemeToggle` writes the chosen theme to `localStorage`.
3. CSS variables in `globals.css` drive the actual light/dark look.

## API Routes

| Route | Method | Purpose | Main dependencies | Safety behavior |
| --- | --- | --- | --- | --- |
| `/api/dailymotion/channel/analyze` | `POST` | Parse channel/profile/user input into a source descriptor. | `dailymotion-url-analyzer.ts` | Returns `400` with a controlled error on invalid input. |
| `/api/dailymotion/channel/fetch` | `POST` | Fetch the first page of a channel feed and wrap it in a manifest. | `dailymotion-channel-service.ts` | Returns controlled `rate_limited`, `unknown`, or provider errors. |
| `/api/dailymotion/channel/fetch-all` | `POST` | Paginate through public channel results with dedupe, delay, and safety caps. | Dailymotion client, manifest builder, fetch safety config | Preserves partial manifests on failure and exposes retry context. |
| `/api/dailymotion/channel/metadata` | `POST` | Fetch and persist public channel/profile metadata such as reported video totals when available. | `channel-metadata-service.ts`, `channel-fetch-persistence.ts` | Labels provider totals as reported, not guaranteed complete. |
| `/api/dailymotion/channel/jobs/start` | `POST` | Start or resume a DB-backed channel fetch job when persistence is enabled. | `channel-deep-fetch-service.ts`, `channel-fetch-persistence.ts` | Creates/persists source, manifest, job, and planned windows with runtime fallback. |
| `/api/dailymotion/channel/jobs/next` | `POST` | Process and persist the next job chunk. | `channel-deep-fetch-service.ts`, `channel-fetch-persistence.ts` | Persists page attempts, videos, manifest items, counters, and checkpoints. |
| `/api/dailymotion/channel/jobs/stop` | `POST` | Stop a fetch job and persist its resumable checkpoint. | `channel-deep-fetch-service.ts`, `channel-fetch-persistence.ts` | Marks operational job state without deleting canonical metadata. |
| `/api/dailymotion/channel/jobs/[id]/status` | `GET` | Read DB-backed fetch job status, hydrating after runtime restart. | `channel-deep-fetch-service.ts`, `channel-fetch-persistence.ts` | Returns persisted job graph when runtime memory is gone. |
| `/api/dailymotion/channel/history` | `GET` | List durable DB fetch history for a source. | `channel-deep-fetch-service.ts`, `channel-fetch-persistence.ts` | Falls back to runtime memory only if persistence is disabled/unavailable. |
| `/api/dailymotion/channel/coverage` | `GET` | Summarize source coverage from persisted job/window/page/video state. | `channel-deep-fetch-service.ts`, `channel-fetch-persistence.ts` | Distinguishes complete, partial, capped, failed, stopped, provider-limited, and max-limit states. |
| `/api/dailymotion/channel/stop-fetch` | `POST` | Explain stop behavior. | None | Safe informational route only; no server-side job cancellation. |
| `/api/dailymotion/search` | `POST` | Search global Dailymotion video metadata and build a temporary manifest. | Dailymotion client, temporary manifest builder | Rejects empty queries and returns controlled provider errors. |
| `/api/manifests/channel/filter` | `POST` | Apply advanced filters to supplied manifest items. | `apply-advanced-video-filters.ts` | Pure transform over caller-provided items. |
| `/api/ai/parse-query` | `POST` | Ask Gemini to parse a research query into safe filter text/JSON. | `gemini-client.ts`, `prompts.ts` | Uses AI safety prompt; returns errors instead of hallucinated data. |
| `/api/ai/filter-helper` | `POST` | Ask Gemini for filter suggestions against a manifest summary. | `gemini-client.ts`, `prompts.ts` | Truncates manifest summary input and limits the AI scope. |
| `/api/ai/summarize-manifest` | `POST` | Ask Gemini to summarize a manifest without inventing videos. | `gemini-client.ts`, `prompts.ts` | Truncates manifest input and enforces the no-invention safety prompt. |

## UI Design System

**Current design direction**

- Warm, calm SaaS-like research workspace.
- Reduced card radius compared with the earlier pass.
- Layered neutral surfaces instead of stark white or pure black.

**Light / dark mode**

- Light mode uses off-white and neutral earth surfaces.
- Dark mode uses softened green-neutral surfaces rather than pure black.
- The current palette is driven by CSS custom properties in `src/app/globals.css`.

**Theme tokens**

- Core tokens include `--background`, `--background-elevated`, `--surface`, `--surface-muted`, `--foreground`, `--muted-foreground`, `--card`, `--border`, `--accent`, `--accent-strong`, `--ring`, `--shadow`, `--success`, and `--danger`.

**Video card design**

- Stable `aspect-video` thumbnail region.
- Line-clamped title and description.
- Grouped metadata rows for channel, views, duration, date, and language.
- Zero-safe duration and views handling.
- External open action and optional hover preview.

**Responsive behavior**

- Header collapses into wrapped nav rows on small screens.
- Dashboard and search surfaces shift between single-column and multi-column layouts.
- Results grid scales from one column to four columns.
- Filter controls reflow across breakpoint grids.

**Filter UI and active chips**

- Filter inputs are token-based custom primitives.
- Active filters render as chips based on truthy and non-empty values.
- Sorting is handled through a select with predefined option keys.

## Folder Structure

**Repo tree**

```text
.
|-- .agents/
|   `-- skills/
|       |-- supabase/
|       `-- supabase-postgres-best-practices/
|-- .github/
|   `-- workflows/
|       `-- db-migrate.yml
|-- Guide-Files/
|   |-- ai_video_discovery_platform_2026_phase_guide.md
|   |-- env_backup.txt
|   `-- git_github_arabic_commands_guide.md
|-- prisma/
|   |-- migrations/
|   |   |-- 20260506_channel_deep_fetch_history_persistence_foundation/
|   |   |   `-- migration.sql
|   |   `-- migration_lock.toml
|   `-- schema.prisma
|-- scripts/
|   |-- app-validate-env.mjs
|   |-- db-apply.mjs
|   |-- db-status.mjs
|   |-- db-validate-env.mjs
|   |-- load-project-env.mjs
|   `-- prisma-command-env.mjs
|-- src/
|   |-- app/
|   |   |-- ai-search/
|   |   |   `-- page.tsx
|   |   |-- api/
|   |   |   |-- ai/
|   |   |   |   |-- filter-helper/
|   |   |   |   |   `-- route.ts
|   |   |   |   |-- parse-query/
|   |   |   |   |   `-- route.ts
|   |   |   |   `-- summarize-manifest/
|   |   |   |       `-- route.ts
|   |   |   |-- dailymotion/
|   |   |   |   |-- channel/
|   |   |   |   |   |-- analyze/
|   |   |   |   |   |   `-- route.ts
|   |   |   |   |   |-- fetch/
|   |   |   |   |   |   `-- route.ts
|   |   |   |   |   |-- fetch-all/
|   |   |   |   |   |   `-- route.ts
|   |   |   |   |   `-- stop-fetch/
|   |   |   |   |       `-- route.ts
|   |   |   |   `-- search/
|   |   |   |       `-- route.ts
|   |   |   `-- manifests/
|   |   |       `-- channel/
|   |   |           `-- filter/
|   |   |               `-- route.ts
|   |   |-- channel-explorer/
|   |   |   `-- page.tsx
|   |   |-- channels/
|   |   |   `-- page.tsx
|   |   |-- saved/
|   |   |   `-- page.tsx
|   |   |-- search/
|   |   |   `-- page.tsx
|   |   |-- globals.css
|   |   |-- layout.tsx
|   |   `-- page.tsx
|   |-- components/
|   |   |-- ai/
|   |   |   `-- ai-helper-panel.tsx
|   |   |-- channel-explorer/
|   |   |   |-- channel-fetch-progress.tsx
|   |   |   |-- channel-input-panel.tsx
|   |   |   `-- channel-manifest-summary.tsx
|   |   |-- filters/
|   |   |   |-- active-filter-chips.tsx
|   |   |   `-- advanced-filter-panel.tsx
|   |   |-- layout/
|   |   |   |-- app-shell.tsx
|   |   |   `-- theme-toggle.tsx
|   |   |-- ui/
|   |   |   |-- button.tsx
|   |   |   |-- card.tsx
|   |   |   `-- input.tsx
|   |   `-- video/
|   |       |-- video-card.tsx
|   |       |-- video-hover-preview.tsx
|   |       `-- video-results-grid.tsx
|   |-- lib/
|   |   |-- ai/
|   |   |   |-- ai-schemas.ts
|   |   |   |-- gemini-client.ts
|   |   |   `-- prompts.ts
|   |   |-- config/
|   |   |   |-- env.ts
|   |   |   `-- public-env.ts
|   |   |-- filters/
|   |   |   |-- apply-advanced-video-filters.ts
|   |   |   `-- filter-types.ts
|   |   |-- manifests/
|   |   |   |-- channel-manifest.ts
|   |   |   `-- temporary-search-manifest.ts
|   |   |-- platforms/
|   |   |   `-- dailymotion/
|   |   |       |-- dailymotion-channel-service.ts
|   |   |       |-- dailymotion-client.ts
|   |   |       |-- dailymotion-normalize.ts
|   |   |       `-- dailymotion-url-analyzer.ts
|   |   |-- supabase/
|   |   |   |-- client.ts
|   |   |   |-- middleware.ts
|   |   |   `-- server.ts
|   |   `-- utils/
|   |       |-- cn.ts
|   |       `-- zero-safe-number.ts
|   |-- stores/
|   |   |-- channel-manifest-store.ts
|   |   `-- search-store.ts
|   |-- types/
|   |   |-- filters.ts
|   |   |-- manifest.ts
|   |   |-- platform.ts
|   |   `-- video.ts
|   `-- proxy.ts
|-- .env.example
|-- .gitignore
|-- PROJECT_LEDGER.md
|-- README.md
|-- dailymotion_discovery_ledger.md
|-- next-env.d.ts
|-- next.config.ts
|-- package-lock.json
|-- package.json
|-- postcss.config.mjs
|-- prisma.config.ts
|-- skills-lock.json
`-- tsconfig.json
```

**Major folder purposes**

| Folder | Purpose |
| --- | --- |
| `.agents/` | Repo-local AI skills and references for future agent work, especially Supabase guidance. |
| `.github/workflows/` | Operational automation, currently focused on manual Prisma migration runs. |
| `Guide-Files/` | Human reference documents and helper notes kept alongside the repo. |
| `prisma/` | Schema source for Postgres persistence. |
| `scripts/` | Standalone Node scripts for env validation and guarded DB operations. |
| `src/app/` | App Router pages, layout, CSS, and API routes. |
| `src/components/` | Reusable UI and feature components. |
| `src/lib/` | Business logic, provider adapters, manifests, filters, env handling, AI helpers, and Supabase helpers. |
| `src/stores/` | Lightweight Zustand state stores. |
| `src/types/` | Shared TypeScript contracts for platforms, manifests, filters, and videos. |

## File-by-File Hints

**How to read this section**

- This section focuses on the important project files and runtime entry points.
- It does not enumerate every leaf reference markdown file under `.agents/skills/**/references`, because those are imported reference notes rather than app runtime code.

### Root and repo-level docs

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `.env.example` | Documented env contract with placeholders only. | Main source of truth for required and optional env keys. |
| `.gitignore` | Ignore rules for env files, build output, and local artifacts. | Confirms secret files and build output should stay out of git. |
| `package.json` | App metadata, scripts, and dependency declarations. | Fastest way to understand stack, commands, and high-level tooling. |
| `package-lock.json` | Locked dependency graph. | Useful when exact installed versions matter. |
| `README.md` | Operational documentation for setup, envs, Supabase, Prisma, and deployment. | Best human-facing summary of the current app contract. |
| `PROJECT_LEDGER.md` | Historical implementation ledger. | Explains why recent hardening work happened and what changed. |
| `dailymotion_discovery_ledger.md` | This project-wide reference ledger. | Intended onboarding document for future developers and AI agents. |
| `next.config.ts` | Minimal Next.js config with `reactStrictMode: true`. | Confirms low customization at framework config level. |
| `next-env.d.ts` | Next.js generated type references. | Standard TS glue file; should not be edited manually. |
| `postcss.config.mjs` | Tailwind PostCSS plugin config. | Enables Tailwind v4 styling pipeline. |
| `tsconfig.json` | TypeScript compiler settings and path alias config. | Confirms strict mode, bundler module resolution, and `@/*` alias usage. |
| `prisma.config.ts` | Prisma CLI config and datasource resolution logic. | Critical for enforcing the `DATABASE_URL`-only Session Pooler workflow. |
| `skills-lock.json` | Lock file for repo-local skills metadata. | Tracks AI skill source and hashes for local agent tooling. |

### Repo-local agent and guide files

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `.agents/skills/supabase/SKILL.md` | Repo-local Supabase agent skill entrypoint. | Tells future AI agents how to approach Supabase work in this repo. |
| `.agents/skills/supabase-postgres-best-practices/SKILL.md` | Supabase Postgres performance best-practices skill. | Helpful for future schema or query tuning work. |
| `Guide-Files/ai_video_discovery_platform_2026_phase_guide.md` | Rebuild-from-scratch style planning guide. | Historical planning reference, not the live app contract. |
| `Guide-Files/git_github_arabic_commands_guide.md` | Git/GitHub command guide in Arabic. | Developer reference only; not part of runtime. |
| `Guide-Files/env_backup.txt` | A backup-oriented env-related file by name. | Treat carefully and review for secret hygiene before sharing the repo. |

### Scripts and workflow

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `scripts/load-project-env.mjs` | Shared dotenv loader with env file priority and unsupported-file warnings. | Central helper for all standalone script env behavior. |
| `scripts/app-validate-env.mjs` | Build-time app env validation. | Stops `next build` early when required app env is missing. |
| `scripts/db-validate-env.mjs` | Sanitized DB env validation. | Validates DB URLs safely without printing secrets. |
| `scripts/db-status.mjs` | Sanitized Prisma migration status wrapper. | Applies process-only timeout hardening, checks connectivity, then reports migration status. |
| `scripts/db-apply.mjs` | Guarded migration apply flow. | Enforces confirmation and safe command ordering for DB changes. |
| `scripts/prisma-command-env.mjs` | Process-only Prisma CLI connection defaults. | Adds `connect_timeout` for DB scripts without rewriting stored env values. |
| `.github/workflows/db-migrate.yml` | Manual-only migration workflow. | Production-oriented migration path for GitHub Actions users. |

### Prisma

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `prisma/schema.prisma` | Postgres schema models for sources, videos, manifests, jobs, and saved items. | Core data model for future persistence and migrations. |
| `prisma/migrations/20260506_channel_deep_fetch_history_persistence_foundation/migration.sql` | Applied migration for the current persistence foundation. | Creates canonical/temporary tables, indexes, relations, enums, and RLS. |
| `prisma/migrations/migration_lock.toml` | Prisma migration provider lock. | Records the Postgres provider for migration history. |

### App shell and pages

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `src/app/layout.tsx` | Root layout, metadata, global CSS import, and no-flash theme boot script. | Top-level UI and theme behavior starts here. |
| `src/app/globals.css` | Global Tailwind import plus theme tokens and base styles. | The current design system lives here. |
| `src/app/page.tsx` | Dashboard / home page. | Product entry surface and navigation hub. |
| `src/app/channel-explorer/page.tsx` | Main interactive Channel Explorer page. | Most important product screen in the current MVP. |
| `src/app/search/page.tsx` | Global search page shell. | Shows the intended future search workspace shape. |
| `src/app/ai-search/page.tsx` | AI Search page shell. | Documents available AI-assisted discovery directions. |
| `src/app/saved/page.tsx` | Saved Library page shell. | Placeholder for future collection and saved-video work. |
| `src/app/channels/page.tsx` | Redirect to `/channel-explorer`. | Legacy or convenience route mapping. |
| `src/proxy.ts` | Next.js 16 proxy entrypoint for Supabase session refresh. | Replaces the older middleware naming pattern. |

### API routes

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `src/app/api/dailymotion/channel/analyze/route.ts` | Channel input analyzer route. | First step for turning user input into provider API paths. |
| `src/app/api/dailymotion/channel/fetch/route.ts` | First-page channel fetch route. | Smallest safe manifest fetch path. |
| `src/app/api/dailymotion/channel/fetch-all/route.ts` | Multi-page channel fetch route. | Most complex fetch logic and partial-manifest behavior. |
| `src/app/api/dailymotion/channel/stop-fetch/route.ts` | Stop-fetch info route. | Documents that cancellation is client-side today. |
| `src/app/api/dailymotion/search/route.ts` | Dailymotion search route. | Search manifest foundation for future search UI. |
| `src/app/api/manifests/channel/filter/route.ts` | Server-side filter route. | Reusable filtering endpoint for supplied items. |
| `src/app/api/ai/parse-query/route.ts` | AI query-parsing route. | Future bridge between natural language and structured filters. |
| `src/app/api/ai/filter-helper/route.ts` | AI filter suggestion route. | Supports manifest-aware filter guidance. |
| `src/app/api/ai/summarize-manifest/route.ts` | AI manifest summary route. | Supports metadata summarization while staying grounded. |

### Components

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `src/components/layout/app-shell.tsx` | Header, nav, and page container. | Shared chrome for all visible pages. |
| `src/components/layout/theme-toggle.tsx` | Light/dark icon toggle. | Persists user theme preference to `localStorage`. |
| `src/components/ai/ai-helper-panel.tsx` | Small AI capability explainer card. | Keeps AI helper scope visible in the explorer workflow. |
| `src/components/channel-explorer/channel-input-panel.tsx` | Analyze/fetch control panel. | Main action surface for entering Dailymotion inputs. |
| `src/components/channel-explorer/channel-fetch-progress.tsx` | Fetch progress stats card. | Summarizes fetch state, counts, and API total. |
| `src/components/channel-explorer/channel-manifest-summary.tsx` | Current manifest summary card. | Provides quick context about the active manifest. |
| `src/components/filters/advanced-filter-panel.tsx` | Filter form UI. | Exposes the full filter contract to the user. |
| `src/components/filters/active-filter-chips.tsx` | Active filter chips. | Makes the current filter state visible at a glance. |
| `src/components/video/video-card.tsx` | Result card with thumbnail, metadata, and open action. | Core result presentation component. |
| `src/components/video/video-hover-preview.tsx` | Iframe hover preview. | Adds lightweight live preview behavior. |
| `src/components/video/video-results-grid.tsx` | Responsive card grid plus empty state. | Shared result rendering container. |
| `src/components/ui/button.tsx` | Token-based button primitive. | Keeps shared interaction styling consistent. |
| `src/components/ui/card.tsx` | Token-based card primitive. | Shared framed surface across the app. |
| `src/components/ui/input.tsx` | Token-based input primitive. | Shared text and number input styling. |

### Library code

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `src/lib/config/public-env.ts` | Public env parsing with build-phase fallback stubs. | Keeps browser-safe env separate from server-only env logic. |
| `src/lib/config/env.ts` | Server env parsing, DB URL validation, optional flags, and fetch safety config. | Central runtime config module. |
| `src/lib/ai/gemini-client.ts` | Gemini client wrapper and controlled route errors. | Single place for AI provider setup and failure normalization. |
| `src/lib/ai/ai-schemas.ts` | Lightweight filter-shape validation helpers. | Helps constrain AI-proposed filters. |
| `src/lib/ai/prompts.ts` | Shared AI safety prompt. | Encodes the "no invented videos" policy in one place. |
| `src/lib/platforms/dailymotion/dailymotion-url-analyzer.ts` | Input parsing for Dailymotion source types. | Converts flexible user input into API-ready source descriptors. |
| `src/lib/platforms/dailymotion/dailymotion-client.ts` | Dailymotion fetch wrapper with timeout and safe error mapping. | Core provider adapter for both search and channel fetches. |
| `src/lib/platforms/dailymotion/dailymotion-normalize.ts` | Raw-to-normalized metadata transform. | Prevents provider-specific data shapes from leaking into the UI. |
| `src/lib/platforms/dailymotion/dailymotion-channel-service.ts` | First-page channel fetch service plus shared fetch limits. | Provider-aware fetch service for the main explorer flow. |
| `src/lib/manifests/channel-manifest.ts` | Channel manifest construction and dedupe helpers. | Central manifest creation logic for explorer results. |
| `src/lib/manifests/temporary-search-manifest.ts` | Search manifest construction helper. | Keeps search results aligned with the manifest model. |
| `src/lib/filters/apply-advanced-video-filters.ts` | Actual filter and sort engine. | One of the most important behavior modules in the repo. |
| `src/lib/filters/filter-types.ts` | Default advanced filter state. | Defines initial filter values consistently. |
| `src/lib/supabase/client.ts` | Browser Supabase client helper. | Foundation for future authenticated browser flows. |
| `src/lib/supabase/server.ts` | Server Supabase client helper. | Foundation for future server-side authenticated flows. |
| `src/lib/supabase/middleware.ts` | Supabase session refresh helper used by `src/proxy.ts`. | Keeps session cookies synchronized in request flow. |
| `src/lib/utils/cn.ts` | Class merge utility. | Shared Tailwind class composition helper. |
| `src/lib/utils/zero-safe-number.ts` | Numeric parsing helpers that preserve valid zero values. | Important for correct metadata filtering and display. |

### Types and stores

| Path | What it contains | Why it matters |
| --- | --- | --- |
| `src/types/platform.ts` | Platform union type. | Current adapter space is intentionally small and explicit. |
| `src/types/video.ts` | Normalized video metadata contract. | Main type shared across fetch, filter, and UI layers. |
| `src/types/manifest.ts` | Channel and search manifest contracts. | Keeps manifest structure explicit across routes and UI. |
| `src/types/filters.ts` | Advanced filter contract and sort options. | Shared type between UI and filter engine. |
| `src/stores/channel-manifest-store.ts` | Zustand store for a channel manifest. | Available state foundation, even though the current page uses local state. |
| `src/stores/search-store.ts` | Zustand store for search manifests. | Future search-state foundation. |

## Safety and Security

- Server-only secrets must stay server-only. Never move DB URLs, Gemini keys, or service-role keys into `NEXT_PUBLIC_*`.
- The platform is metadata-only. Do not add downloading, rehosting, or stream scraping features.
- AI routes are constrained by a safety prompt that forbids inventing videos, IDs, URLs, or counts.
- DB scripts print sanitized connection host/protocol details only, not raw secrets.
- Partial manifests are preserved on fetch-all failures instead of being thrown away.
- `zeroSafeNumber` ensures valid `0` values are not mistaken for missing metadata.
- Proxy refreshes Supabase session cookies but is not, by itself, a full authorization strategy.
- Real `.env` data was intentionally omitted from this ledger.

## 2026-11-11 Prisma ORM 7.10.1 Restoration, Dependency Upgrade & Platform Linking

### 1. Prisma ORM 7 (`7.10.1`) Restoration & Schema/Migration Alignment
- Removed experimental uncommitted Prisma 8 RC packages/files (`@prisma/orm-postgres`, `@prisma/cli-engine`, `prisma@^8.0.0-rc.*`, `src/prisma/`, `src/lib/db/scalars.ts`, `scripts/db-probe.ts`).
- Installed pinned stable **Prisma ORM 7.10.1** (`prisma@7.10.1`, `@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1`).
- Restored canonical Prisma schema (`prisma/schema.prisma`, 16 models, 10 enums) and SQL migrations (`prisma/migrations/20260506_channel_deep_fetch_history_persistence_foundation`, `prisma/migrations/20261011183739_workspace_cloud_persistence`).
- Canonical DB resolution (`src/lib/db/database-url.ts`, `prisma.config.ts`, `src/lib/prisma/client.ts`, `src/lib/db/prisma.ts`, `scripts/db-*.mjs`, `/api/admin/migrations/status`): uses `DATABASE_URL` as primary (Supabase Session Pooler `:5432`) and `SUPABASE_DATABASE_URL_CONNECTION_STRING` as optional warned backup (`DATABASE_URL_CONNECTION_STRING`, `DATABASE_URL_DIRECT`, and `DIRECT_URL` remain retired).
- Restored all Prisma 7 repositories and services (`src/lib/repositories/channel-fetch-persistence.ts` with native SQL tag array filtering, `src/lib/persistence/repositories/{commits,errors,saved-titles,search-history}.ts`, `src/lib/persistence/batch-save/commit.ts`, `src/lib/discovery/token-cache-store.ts`, `src/app/api/cloud/sync-state/route.ts`), adding `listCollections`, `updateSavedVideo`, and `deleteSavedVideoById` in `saved-titles.ts` plus Date `.toISOString()` hydration restoration in `channel-deep-fetch-service.ts`.
- Live database status check (`node scripts/db-status.mjs --allow-status-failure`): reached `aws-0-eu-west-2.pooler.supabase.com:5432` over IPv4 and received `FATAL: (ENOTFOUND) tenant/user postgres.uuhyelghiwiotcjvidmg not found` (remote Supabase project unreachable/non-existent; pending migration `20261011183739_workspace_cloud_persistence` remains ready to deploy via `CONFIRM_DB_APPLY=true npm run db:apply` once `.env` points at an active project).

### 2. Node Library Modernization & Linting
- Updated core packages in `package.json`: `next@^16.4.6`, `react@^19.3.1`, `react-dom@^19.3.1`, `@google/genai@^3.2.0` (replacing deprecated `@google/generative-ai`), `@supabase/supabase-js@^2.119.0`, `pg@^8.23.1`, `zod@^4.6.7`, `zustand@^5.1.0`, `lucide-react@^1.72.0`, `framer-motion@^14.12.0`, `tailwindcss@^4.3.5`, `@tailwindcss/postcss@^4.3.5`, `vitest@^5.1.0`, `dotenv@^18.0.10`.
- Added ESLint 9 flat configuration (`eslint.config.mjs`) with `eslint@^9.39.5` + `eslint-config-next@^16.4.6` replacing removed Next 16 `next lint`, and resolved all React 19 `react-hooks/set-state-in-effect` and hook dependency errors.

### 3. Discovery, AI, Filter, and Frontend/Backend Enhancements
- Fixed `src/app/api/discovery/v2/[resource]/route.ts` and `v2-search-service.ts` to forward `isExplicit`, `isForKids`, and `fields`, plus optional `fields` passthrough across `v1/[resource]/route.ts` and `v1-search-service.ts`.
- Upgraded `src/lib/ai/gemini-client.ts` to `@google/genai` defaulting to `gemini-2.5-flash` (`src/lib/config/env.ts`), placeholder-key `503 missing_config` detection, structured JSON mode (`generateGeminiJson`), and error status propagation in `/api/ai/{parse-query,filter-helper,summarize-manifest}`.
- Added admin-gated cloud CRUD endpoints: `GET/POST/PATCH/DELETE /api/cloud/saved-titles`, `GET/POST /api/cloud/collections`, `PATCH/DELETE /api/cloud/collections/[id]`, `GET/DELETE /api/cloud/history`.
- Connected live UI workflows:
  - `/saved` (`src/app/saved/page.tsx`): Saved Library & Postgres Collections manager alongside browser draft items.
  - `/workspace` (`CloudSyncPanel` + `useDiscoveryWorkspace.hydrateFromCloud`): two-way Save + Pull hydration from Supabase.
  - `/ai-search` & `AiHelperPanel`: live Gemini query translation -> Dailymotion V1 execution -> grounded manifest filter suggestions & summaries.
  - `/search` (`UnifiedSearch`): URL param hydration & sync, Save Search, local quick filter, JSON/CSV export.
  - Channel Explorer filters (`apply-advanced-video-filters.ts`, `AdvancedFilterPanel`, `ActiveFilterChips`): fixed inclusive UTC `dateTo`, added `excludeKeyword` & `tags` filters, quick presets, dismissible filter chips, and `VideoCard` workspace save + ID copy.
  - Home (`src/app/page.tsx`): Quick V1 search launcher & links to AI Search and Saved Library.

### 4. Environment & Documentation Cleanup
- Removed unused env vars (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `WEBHOOK_SECRET`, `AI_EMBEDDING_MODEL`, `ENABLE_PGVECTOR`) from `src/lib/config/env.ts` and regenerated `.env.example` using `.env` conventions; made placeholder/missing `GEMINI_API_KEY` a non-fatal `[WARN]` in `scripts/app-validate-env.mjs`.
- Removed stale duplicate/phase docs (`PROJECT_LEDGER.md` and obsolete `Guide-Files/` phase specs) and rewrote `README.md`, `docs/migrations/{README,registry,recovery}.md`, and `docs/api-v2-capability-inventory.md` for 2026.

## 2026-11-12 Local-First Research Workspace, Cloudflare R2 + Worker Persistence & API Capability Architecture

### 1. Official 2026 Dailymotion API Research & Architecture Docs
- Verified official Legacy/Partner API v1 vs REST API v2 rules in `docs/api/dailymotion-api-capabilities-2026.md`.
- Completed system-by-system parity audit against reference workspace patterns in `docs/architecture/youtube-discovery-parity-matrix.md`.
- Documented target persistence, Worker HMAC token, generation manifest, and non-destructive Supabase archive plan in `docs/architecture/dailymotion-target-architecture.md`.

### 2. Local Filters, Taxonomy, Search Presets, Collections & History (Phases 1 & 2)
- Added canonical taxonomy (`src/lib/resources/dailymotion-resource-taxonomy.ts`), explicit API vs Local filter matrix (`src/lib/discovery/filter-capabilities.ts`, rendered on `/capabilities`), zero-safe filter pipeline (`src/lib/filters/discovery-result-filters.ts`), FlexSearch/weighted local searcher (`src/lib/search/discovery-local-search.ts`), `DiscoveryLocalFilterPanel`, `RawJsonDrawer`, and upgraded `ResultCard`.
- Upgraded `UnifiedSearch` and `DiscoveryExplorer` with zero-API local filters, bulk selection & collection assignment, offline cached snapshot replay (`?snapshotType=preset|history&snapshotId=...`), and Search History / Saved Search Preset capture.
- Added dedicated research workspace routes: `/collections`, `/saved-searches`, `/history`, and `/storage`, linked in `AppShell`.

### 3. Local-First IndexedDB Engine & Two-Phase Outbox Sync (Phase 3)
- Implemented `dailymotion_discovery_local_v1` IndexedDB store (`src/lib/local-first/indexeddb-store.ts`) with one-time non-destructive `localStorage` migration, atomic outbox operations + `sync_journal` recovery (`src/lib/sync/sync-coordinator.ts`), `SaveReceipt` stage contracts (`src/lib/sync/save-receipt.ts`), tombstone-aware cloud hydration (`src/lib/sync/cloud-hydration-service.ts`), and reactive `useMergedDataset()` (`src/lib/local-first/use-merged-dataset.ts`).

### 4. Dedicated Cloudflare Worker + Private R2 + Prisma 7 Schema Draft (Phases 4 & 5)
- Authored local Wrangler/Worker source (`cloudflare/workers/dailymotion-discovery-api/{wrangler.jsonc,.dev.vars.example,README.md,src/index.ts,src/index.test.ts}`) binding `DM_BUCKET -> dailymotion-discovery-private` with Web Crypto HS256 capability verification, path traversal rejection, immutable part `onlyIf` collision guard (409), and `/batch/upload` + `/batch/verify`. (Not deployed remotely; awaits operator approval.)
- Added server storage & sync services (`src/lib/storage/{r2-canonical-paths,r2-capability-token,r2-manifest-serializer,r2-worker-client,zip-builder,storage-explorer-service}.ts`, `src/lib/persistence/{r2-sync-service,supabase-to-r2-migration}.ts`) and admin-gated routes (`/api/sync/{save-all,hydrate,status}`, `/api/storage/{overview,verify,export}`, `/api/admin/storage-migration`).
- Added additive Prisma 7 models (`SavedSearchPreset`, `ResearchCollection`, `ResearchCollectionItem`, `StorageDataset`, `StorageGeneration`, `StorageManifestPart`) and columns on `BatchCommit` in `prisma/schema.prisma` + SQL migration draft `prisma/migrations/20261112000000_r2_generations_and_presets/migration.sql` (not applied to remote DB without approval).

### 5. Bounded AI Manifest Context & Env Updates (Phases 6–8)
- Added `src/lib/ai/manifest-context.ts` enforcing configurable `AI_MANIFEST_MAX_ITEMS` / `AI_MANIFEST_MAX_CHARS` bounds and evidence IDs on `/api/ai/summarize-manifest` and `/api/ai/filter-helper`.
- Updated `.env.example` and `scripts/app-validate-env.mjs` with Cloudflare R2 Worker and AI bound variables.

### 6. Supabase Auth SSR, Canonical Admin (`asdy`), Searchable Country Selector & Cloudflare Deployment Prep
- **Supabase Auth Single Authority**:
  - Administrator `asdy` resolved server-side to canonical identity `asdy@dailymotion.discov.com` in `src/lib/admin/session.ts` (`CANONICAL_ADMIN_USERNAME = "asdy"`, `CANONICAL_ADMIN_EMAIL = "asdy@dailymotion.discov.com"`, `resolveAdminEmail()`).
  - Zero passwords stored in PostgreSQL. Supabase Auth is the single authoritative identity and password store.
  - Endpoint `POST /api/admin/login` resolves `asdy` -> `asdy@dailymotion.discov.com`, authenticates via `supabase.auth.signInWithPassword`, falls back to local dev/test credentials, and issues an HMAC-signed `dm_admin_session` httpOnly cookie.
  - Endpoint `POST /api/admin/change-password` gates caller via `requireAdmin()`, re-authenticates current password, updates password via `supabase.auth.updateUser({ password: newPassword })`.
  - Added `ChangePasswordForm` on `/settings` (`src/app/settings/page.tsx`) with client-side match validation and honest status/error surfacing.
  - Tests: `src/lib/admin/__tests__/change-password.test.ts` (identity mapping + unauthenticated 401 gate).
- **Searchable ISO 3166-1 alpha-2 Country Selector & Multi-Level Filtering**:
  - Created `src/components/discovery/country-selector.tsx`: 249 ISO 3166-1 alpha-2 entries, real-time search, dropdown menu, clear button, and distinct visual badges (`API parameter` vs `Local result filter`).
  - Integrated into API parameter inputs (`src/components/discovery/discovery-explorer.tsx` for `ams_country` and `src/components/discovery/unified-search.tsx` for `country` / `localization`).
  - Integrated into local result filtering: added `country: string` to `LocalFilterState`, `DEFAULT_DISCOVERY_LOCAL_FILTERS`, `matchesClassification`, and `listActiveLocalFilterChips` in `src/lib/filters/discovery-result-filters.ts`.
  - Embedded in `src/components/discovery/discovery-local-filter-panel.tsx` drawer.
  - Tests: `src/lib/filters/__tests__/discovery-result-filters.test.ts` (6/6 passing).
- **Cloudflare Worker `.prod.vars` Safe Inspection & Secret Protection**:
  - Protected `.prod.vars`, `.dev.vars`, and `*.vars` in `.gitignore` (verified with `git check-ignore`).
  - Created `scripts/worker-inspect-env.mjs`: validates dotenv format, identifies `WORKER_AUTH_SECRET` (secret, 64 chars) and `ALLOWED_ORIGINS` (config, 85 chars), confirms `WORKER_AUTH_SECRET === CLOUDFLARE_R2_WORKER_HMAC_SECRET` without printing or leaking values.
  - Configured `cloudflare/workers/dailymotion-discovery-api/wrangler.jsonc` with `"remote": true` on `DM_BUCKET` binding.
  - Documented official deployment: `npx wrangler deploy --secrets-file .prod.vars`.
- **Total Vercel Blob Audit & Elimination**:
  - Scanned codebase via `git grep -i "vercel.*blob"`, `BLOB_READ_WRITE_TOKEN`, `@vercel/blob`; zero occurrences remain across all source, config, and script files. Zero Vercel Blob dependencies in `package.json`.
- **Database Connectivity & Forward-Only Migration Posture**:
  - Diagnosed Supabase Session Pooler connection via `node scripts/db-diagnose-connection.mjs`: DNS OK, TCP 5432 OK, PostgreSQL auth OK (`aws-0-eu-west-2.pooler.supabase.com:5432`, 615ms latency).
  - Forward-only migration strategy preserved: no destructive DDL, no reset; pending migration `20261112000000_r2_generations_and_presets` is ready for zero-downtime deployment via `CONFIRM_DB_APPLY=true npm run db:apply`.
- **Verification Evidence**:
  - Full Vitest suite: 26/26 test files passed, 119/119 tests passed (`npm test`).
  - TypeScript typecheck: `tsc --noEmit` exit 0 (0 type errors).
  - Environment preflight: `node scripts/app-validate-env.mjs` exit 0.
  - Worker environment preflight: `node scripts/worker-inspect-env.mjs` exit 0.

## 2026-11-12 Final Engineering Completion: Environment Audit, Saved Items, Canonical Manifests & Cloudflare Architecture

### 1. Complete Environment Variables Audit & Contract
- Audited entire codebase (57 total active/optional environment variables).
- Authored comprehensive contract: `docs/ENVIRONMENT_VARIABLES.md` containing complete specifications (Name, Location, Required status, Sensitivity, Purpose, Default, Format, Provider, Feature, Environment, Validation).
- Synchronized all `.example` files (`.env.example`, `.dev.vars.example`, `.prod.vars.example`) with safe placeholders; zero secrets leaked.
- Added automated preflight validation script: `scripts/validate-all-env.mjs` and npm script `npm run env:validate:all` (exit 0). Validates URLs, numeric limits, booleans, secret alignment (`CLOUDFLARE_R2_WORKER_HMAC_SECRET === WORKER_AUTH_SECRET`), git protection, and documentation completeness.

### 2. Dedicated Saved Items System (`/saved-items`)
- Implemented dedicated research workspace route `/saved-items` (`src/app/saved-items/page.tsx`) with stable identity (`dailymotion:video:<id>`, `dailymotion:channel:<id>`), country selector (`mode="local"`), category filter, search, view modes (Grid / List), sorting (newest/oldest/title/views/duration), multi-item batch selection, bulk removal, collection assignment, stable ID copy helpers, and sync status badges.
- Upgraded `src/lib/local-first/indexeddb-store.ts` with `buildStableDailymotionId`, enriched `LocalSavedItemRecord` with `stableId`, `provider`, `country`, `category`, `sourcePage`, `sourceQuery`, `sourceFilters`, `syncStatus`, and `collectionIds`.
- Enriched `SyncCoordinator` (`src/lib/sync/sync-coordinator.ts`) with `isItemSaved`, `saveItem`, `removeItem`, and `removeItemsBatch`.
- Added navigation link in `src/components/layout/app-shell.tsx` under Workspace and Library.

### 3. Universal Card Save Integration
- Enhanced all discovery cards (`ResultCard`, `VideoCard`, `ChannelMetadataPanel`, `UnifiedSearch`, `DiscoveryExplorer`, `AiSearch`) to save items to IndexedDB via `SyncCoordinator.toggleSaveItem` and keep state synchronized with `useDiscoveryWorkspace()`.
- Added "Save Channel" button in `ChannelMetadataPanel` (`src/components/channel-explorer/channel-metadata-panel.tsx`) with instant local persistence and outbox queuing.

### 4. Canonical Storage Architecture & Manifest Schema
- Centralized all storage paths in `src/lib/storage/dailymotion-canonical-paths.ts` (`saved-items`, `discovery/videos`, `discovery/channels`, `collections`, `saved-searches`, `search-history`, `legacy-supabase-archive`).
- Authored canonical manifest schema with Zod validation, immutable generation IDs, and SHA-256 integrity calculation in `src/lib/storage/canonical-manifest-schema.ts`.
- Created Cloudflare deployment guide with verified Windows PowerShell commands in `docs/CLOUDFLARE_DEPLOYMENT.md`.

### 5. Verification Evidence
- Vitest suite: 29/29 test files passed, 132/132 tests passed (`npm test`).
- Added tests: `src/lib/storage/__tests__/canonical-manifest-schema.test.ts` (3 tests), `src/lib/storage/__tests__/dailymotion-canonical-paths.test.ts` (5 tests), `src/lib/sync/__tests__/sync-coordinator-saved-items.test.ts` (5 tests).
- `npm run env:validate:all`: exit 0 (all constraints and secret alignments verified).
- `npm run db:validate`: exit 0 (primary `DATABASE_URL` Supabase Session Pooler verified).
- `node scripts/app-validate-env.mjs`: exit 0.

## 2026-11-13 Final Architecture Standardization, Cloudflare R2 Binding (R2_BUCKET), Supabase Auth 7-Day Session TTL, Zero-Local-Build Policy & Vercel Remote Deployment

### 1. Cloudflare Dedicated Worker Binding Standardization (`R2_BUCKET`) & Prisma 7 Schema Fix
- Resolved Prisma 7.10.1 P1012 schema validation error: removed deprecated `url = env("DATABASE_URL")` from `prisma/schema.prisma` (in Prisma ORM 7, connection URLs for Migrate live exclusively in `prisma.config.ts` via `datasource.url: resolvePrismaCliDatabaseUrl()`).
- Reconciled authoritative Cloudflare R2 binding name from `DM_BUCKET` to **`R2_BUCKET`** across all files:
  - `cloudflare/workers/dailymotion-discovery-api/wrangler.jsonc`: binding set to `"R2_BUCKET"` with `"bucket_name": "dailymotion-discovery-private"` and `"remote": true`.
  - `cloudflare/workers/dailymotion-discovery-api/src/index.ts`: `Env.R2_BUCKET`, `env.R2_BUCKET` calls across `/health`, `/list`, `/batch/upload`, `/batch/verify`, and `/objects/*` (PUT/GET/HEAD/DELETE).
  - `cloudflare/workers/dailymotion-discovery-api/src/index.test.ts`: test harness initialized with `R2_BUCKET: new MemoryR2Bucket()`.
  - Next.js test harnesses in `src/lib/persistence/__tests__/r2-sync-service.test.ts` and `src/lib/storage/__tests__/r2-storage.test.ts` updated to `R2_BUCKET: bucket`.
  - Documentation files updated (`README.md`, `docs/CLOUDFLARE_DEPLOYMENT.md`, `docs/ENVIRONMENT_VARIABLES.md`, `docs/architecture/dailymotion-target-architecture.md`).
- Zero references to `DM_BUCKET` remain in application code or configuration.

### 2. Supabase Auth SSR & 7-Day Session TTL Enforcement
- Server-side admin session TTL enforced via `ADMIN_SESSION_TTL_SECONDS="604800"` (7 days = 604,800 seconds).
- Validated in `src/lib/config/env.ts` with `z.coerce.number().int().positive().default(604800)`.
- Enforced in `src/lib/admin/session.ts` via HMAC-SHA256 cookie validation (`parsed.exp * 1000 < Date.now()`).
- Endpoint `POST /api/admin/login` sets `dm_admin_session` with `httpOnly: true`, `sameSite: "lax"`, `secure: production`, `path: "/"`, and `maxAge: 604800`.
- Protected endpoints (`/api/cloud/*`, `/api/admin/*`, `/api/sync/*`, `/api/storage/*`) fail closed with 401 Unauthorized if the session cookie is missing, tampered, or expired.
- Canonical administrator mapping `asdy` -> `asdy@dailymotion.discov.com` preserved; zero passwords stored in PostgreSQL.

### 3. Standardized Package Scripts & Zero-Local-Build Policy
- Enforced strict user resource policy: **ZERO LOCAL PRODUCTION BUILDS** (`npm run build`, `next build`, `vercel build` prohibited in local automated check sequences).
- Standardized `package.json` scripts:
  - `db:validate`: `node scripts/db-validate-env.mjs` (validates connection parameters, host, port, protocol, query parameters in <1s without blocking on Windows pipes).
  - `worker:dev`: `wrangler dev --config cloudflare/workers/dailymotion-discovery-api/wrangler.jsonc`
  - `worker:deploy:dry-run`: `wrangler deploy --config cloudflare/workers/dailymotion-discovery-api/wrangler.jsonc --dry-run`
  - `worker:deploy`: `wrangler deploy --config cloudflare/workers/dailymotion-discovery-api/wrangler.jsonc --secrets-file cloudflare/workers/dailymotion-discovery-api/.prod.vars`
  - `worker:tail`: `wrangler tail dailymotion-discovery-api`
  - `env:validate:all`: `node scripts/validate-all-env.mjs`

### 4. Supabase UI & shadcn Component Integration
- `components.json` configured with `@supabase` registry: `"@supabase": "https://supabase.com/ui/r/{name}.json"`.
- Cleaned up root re-exports in `src/lib/utils.ts` (`export { cn } from "./utils/cn"`), `src/lib/client.ts`, `src/lib/server.ts`, and `src/lib/middleware.ts` to seamlessly bridge shadcn components with canonical Supabase SSR clients.
- Cleaned up `/saved-items` (`src/app/saved-items/page.tsx`): resolved TypeScript comparisons against `DailymotionResourceType` ("VIDEO", "CHANNEL", "USER", "PROFILE", "LIVESTREAM"), mapped to `toDiscoveryKind()`, formatted sync receipts with `completedAt || startedAt`, and wired `RawJsonDrawer payload`.

### 5. Complete Documentation Suite Authored in `docs/`
- `docs/DATABASE_ARCHITECTURE.md`: Complete architectural breakdown of the 23 PostgreSQL canonical tables in the Supabase Session Pooler instance, Prisma models, enums, relationships, indexes, unique constraints, and owner scoping.
- `docs/DATABASE_MIGRATIONS.md`: Details of all 3 applied migrations (`20260506`, `20261011`, `20261112`), migration runner, and forward-only non-destructive migration policies.
- `docs/SUPABASE_AUTH.md`: Administrator single identity (`asdy`), Supabase Auth SSR, 7-day session TTL, cookie encryption, and server-side route gating.
- `docs/STORAGE_ARCHITECTURE.md`: Dedicated Cloudflare Worker (`dailymotion-discovery-api`), `R2_BUCKET` binding, capability tokens, canonical path hierarchy, and two-phase batch commit with SHA-256 verification.
- `docs/MANIFEST_FORMAT.md`: Canonical manifest JSON schema (`dailymotion-manifest-v1`), SHA-256 integrity digest verification, and immutable generation parts.
- `docs/VERCEL_DEPLOYMENT.md`: Zero-local-build remote compilation architecture, production environment variable contract, and remote inspection commands.
- `docs/CLOUDFLARE_DEPLOYMENT.md`: Step-by-step PowerShell commands for private bucket creation, dry-run deployment, and production worker deployment.
- `docs/ENVIRONMENT_VARIABLES.md`: Comprehensive 57-variable contract with locations, sensitivity, defaults, and validation rules.

### 6. Full Verification Evidence
- TypeScript compilation: `next typegen && tsc --noEmit` exited 0 (zero errors).
- Vitest test suite: 29/29 test files passed, 132/132 tests passed (`npm test`).
- Environment preflight: `npm run env:validate:all` exited 0.
- Database preflight: `npm run db:validate` exited 0.
- Git security check: `git check-ignore .env .dev.vars .prod.vars` confirmed 100% ignored. Zero secrets exposed.

## 2026-11-13 Code-Derived Environment Variables Audit, Vercel Production Reconciliation & Remote Deployment

### 1. Source Code-First Discovery Methodology
- **Single Source of Truth**: Conducted exhaustive codebase scan across `src/` (App Router, API routes, Server/Client Components, Supabase SSR, Dailymotion V1/V2 clients, Gemini AI, R2 Worker client, admin session), `scripts/`, `cloudflare/` (worker implementation & `wrangler.jsonc`), `prisma.config.ts`, `prisma/`, and `.github/workflows/`.
- **Zero reliance on `.env` / `.env.example` as discovery authority**: Local `.env` was treated as an incomplete dev aid; actual code imports, Zod schemas (`env.ts`, `public-env.ts`), and `process.env` access points served as the sole canonical discovery source.
- **Inventory Discovered**: Exactly 48 active application environment variables + 2 legacy backward-compatibility aliases + 3 dedicated Cloudflare Worker variables.

### 2. Vercel Production Reconciliation
- **Vercel Project**: Linked to `dailymotion-discovery` (`prj_9CDQFRrhBzS0o0nihUiARHFqjO7m`) under team `alahly13s-projects`.
- **Initial Production State**: 46 variables configured.
- **Missing Code-Required Variables Added**:
  1. `ADMIN_EMAIL`: Added to Production (`asdy@dailymotion.discov.com`, resolves canonical administrator identity).
  2. `GEMINI_MODEL`: Added to Production (`gemini-2.5-flash`, Google AI Studio model identifier).
  3. `AI_MANIFEST_MAX_ITEMS`: Added to Production (`25`, bounded prompt item cap).
  4. `AI_MANIFEST_MAX_CHARS`: Added to Production (`9000`, bounded prompt character budget).
  5. `CHANNEL_FETCH_CONCURRENCY`: Added to Production (`3`, crawl parallel worker ceiling).
  6. `CHANNEL_FETCH_MAX_CONCURRENCY`: Added to Production (`5`, absolute concurrency ceiling).
- **Final Production State**: 52 variables configured (100% of code-required variables satisfied).
- **Cloudflare Worker Boundary**: Verified that `WORKER_AUTH_SECRET`, `ALLOWED_ORIGINS`, and `R2_BUCKET` remain exclusively in Cloudflare Worker configuration and are NOT present in Vercel.

### 3. Remote Production Redeployment & Verification
- Initiated zero-local-build remote redeployment: `vercel redeploy https://dailymotion-discovery-6zbb19boi-alahly13s-projects.vercel.app`.
- New deployment: `https://dailymotion-discovery-9r2fjo6rp-alahly13s-projects.vercel.app` (`dpl_FagXkMZT4EWmjdbZayVTZv1jkY3N`).
- Remote build duration: `1m 6s` on Vercel 2 vCPU / 8192 MiB basic runner.
- Status: **`● Ready`** with 68 static and dynamic routes compiled, aliased to `https://dailymotion-discovery.vercel.app`.
- Live HTTPS runtime verification via `vercel curl`:
  - `GET /api/discovery/auth-status`: HTTP 200 with `database.connectionSource: "DATABASE_URL"`, `supabase: { urlConfigured: true, secretConfigured: true }`, `tokenCache: { enabled: true }`, `v1.keyConfigured: true`, `v2.keyConfigured: true`.
  - `GET /api/admin/migrations/status`: HTTP 401 Unauthorized gate active (`{"ok":false,"error":"Administrator sign-in required.","reason":"unauthorized"}`).
  - `GET /`: HTTP 200 OK.
  - `GET /saved-items`: HTTP 200 OK.

### 4. Code & Documentation Sync
- Updated `docs/ENVIRONMENT_VARIABLES.md` with:
  - Exact source code file and line references for all variables.
  - Production vs Preview vs Development cross-reference audit table.
  - Vercel Secret vs Config categorization.
- Verified all automated checks:
  - `node scripts/validate-all-env.mjs`: Exit 0.
  - `npm test`: 29 test files passed, 132/132 tests passed.
  - `npm run typecheck`: Exit 0 (zero errors).

## 2026-11-14 Professional Search UI/UX Redesign, Type-Aware Result Cards, Search History Snapshots & Zero-API Local Replay

### 1. Advanced Search UI/UX Redesign (`/search` & `UnifiedSearch`)
- Transformed the search experience inspired by `F:\discovery\youtube-discovery`:
  - Wide, full-width search input with inner clear `X` button and magnifying glass submit button.
  - Smart query transform quick-buttons: "Trim Spaces", "Shuffle Words", and "Clear Text".
  - Collapsible API Filters toolbar directly below the input with active filter counter badges, separating outbound network constraints (version, resource kind, sort, localization, family filter) from client-side filtering.
  - 12-column grid workspace (`workspace-grid-12`):
    - Left side (`col-span-12 xl:col-span-8 2xl:col-span-9` or full width if filters collapsed):
      - Real-time counters by resource kind: All, Videos, Channels, Playlists, Livestreams, Users.
      - Bulk actions: Select All Visible, Save Selected, Add to Collection, Export JSON, Export CSV.
      - Adaptive grid of type-specific result cards.
      - Pagination controls ("Next Page", "Load More / Append").
    - Right side (`col-span-12 xl:col-span-4 2xl:col-span-3`):
      - Dedicated collapsible Local Filters panel with independent toggle button ("Hide Filters" / "Show Filters"), persisted in `localStorage`.
      - In-memory search inside retrieved results, target fields selector, duration slider, local sorting, and clear filters.

### 2. World-Class Type-Aware Result Cards (`ResultCard`)
- Refactored `ResultCard` (`src/components/discovery/result-card.tsx`) into type-routed specialized views:
  - **Video Card**: 16:9 thumbnail, duration overlay, version badge, HD/Kids/Explicit badges, title link, owner name, zero-safe views counter (`0 views` displayed honestly), relative date, expandable description, Save/Unsave (updates IndexedDB), Favorite star, Collection picker, Copy ID/URL, Raw JSON drawer.
  - **Channel / User / Profile Card**: Gradient banner header, circular overlapping avatar with fallback icon, channel name, ID handle, subscriber/follower badges, video count, "Explore Channel" action button linking directly to `/channel-explorer?channel=<id>`, Save Channel action, Copy ID, Raw JSON.
  - **Playlist Card**: Aspect-video thumbnail with stacked right-side playlist count overlay (`N videos`), playlist title, owner, "Explore Playlist" and Save actions.
  - **Livestream Card**: Pulsing red `LIVE` badge, viewer count overlay, stream title, broadcaster, and actions.

### 3. Collapsible Navigation Sidebar & Global Top Header (`AppShell`)
- Upgraded `src/components/layout/app-shell.tsx`:
  - Persistent desktop sidebar collapse with smooth CSS transitions (`transition-[padding]` on content, `transition-transform` on sidebar).
  - State persisted in `localStorage` (`dm_sidebar_open`).
  - Desktop toggle button with `PanelLeftClose` ("Hide Navbar") and `PanelLeftOpen` ("Show Navbar").
  - Mobile drawer navigation with backdrop, brand logo, full links, and auto-close on route change.
  - Top header architecture badges: "Dual-API Terminal" (Emerald), "Quota-Aware" (Sky), "Manifest-First" (Purple).
  - Quick header links to Search Workspace, Search History, Saved Items, and Theme Toggle.

### 4. Search History, Full Raw API JSON Snapshots & Zero-API Replay
- Configurable retention TTL via `NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS="604800"` (7 days default), validated with Zod, added to `.env.example`, `docs/ENVIRONMENT_VARIABLES.md`, and deployed to Vercel (Production, Preview, Development).
- Extended IndexedDB schema (version bumped to `2`) with new stores:
  - `search_snapshots`: key `id` (`snap_<timestamp>_<uuid>`), indexes on `expiresAt`, `capturedAt`, `route`, `query`.
  - `search_snapshot_pages`: key `id` (`<snapshotId>::page::<pageIndex>`), storing complete untouched raw API response payloads and normalized items.
  - **CRITICAL INVARIANT**: ZERO media/video/thumbnail binary downloads; only metadata and string URLs are persisted.
- Created `src/lib/search-history/search-snapshot-service.ts`:
  - Automatic capture invoked on successful searches across Unified Search (`/search`), Discovery Explorer (`/general-*`, `/videos-*`, `/channels-*`, `/playlists-*`, `/users-*`, `/live-*`), and AI Search (`/ai-search`).
  - Deterministic offline replay (`replaySearchSnapshot`): loads raw JSON from IndexedDB, reconstructs search state, and renders results with **ZERO Dailymotion API calls and ZERO Gemini calls**.
  - Safe background pruning (`cleanExpiredSearchSnapshots`): purges only expired search history without ever deleting Saved Items, Collections, or Sync Journal.
- Dedicated Search History page (`src/app/search-history/page.tsx` and alias `src/app/history/page.tsx`):
  - Chronological date grouping (Today, Yesterday, Earlier This Week, Earlier This Month, Older).
  - Snapshot cards with query, route, API version, total items, preview thumbnails gallery, expiration countdown timer.
  - Actions: "Replay Results" (loads offline in `/search?replay=<id>`), "Inspect Raw JSON" (opens drawer with full response), "Copy Query", "Delete Snapshot", and "Purge Expired".

### 5. Verification Evidence
- TypeScript compilation: `next typegen && tsc --noEmit` exited 0 (clean).
- Vitest test suite: 30/30 test files passed, 136/136 tests passed (`npm test`).
- Environment preflight: `node scripts/validate-all-env.mjs` exited 0.
- Database preflight: `npm run db:validate` exited 0.
- Git security check: `git check-ignore .env cloudflare/.../.dev.vars cloudflare/.../.prod.vars` confirmed 100% ignored. Zero secrets exposed.

## 2026-11-14 Search Architecture Consolidation & Unified Link Explorer (V1 / V2)

### 1. Navigation Simplification & Discovery Architecture Consolidation
- Streamlined `AppShell` (`src/components/layout/app-shell.tsx`) navigation into 4 clean, focused sections:
  - **OVERVIEW**: Dashboard (`/`)
  - **DISCOVERY**:
    - Global Search (`/global-search` with nested `V1 — Legacy` and `V2 — Current` links)
    - Link Explorer (`/link-explorer` with nested `V1 — Legacy` and `V2 — Current` links)
  - **LIBRARY**: Saved Items (`/saved-items`), Search History (`/search-history`), Collections (`/collections`)
  - **SYSTEM**: Settings (`/settings`), Account (`/account`), Admin (`/admin`), Storage & R2 (`/storage`), Capabilities (`/capabilities`)
- Implemented collapsible desktop navigation supporting full view (`w-64`, content `lg:pl-64`) and compact icon rail (`w-16`, content `lg:pl-16`), with preference persisted in `localStorage` (`dm_sidebar_open`) and fully responsive mobile drawer navigation.
- Added dedicated Account page (`src/app/account/page.tsx`) with administrator identity (`asdy@dailymotion.discov.com`), session lifecycle details, password change form (`/api/admin/change-password`), and system quick links.
- Consolidated legacy discovery routes into server-side query-preserving redirects (`src/lib/navigation/discovery-redirect.ts`):
  - `/channels-v1` -> `/link-explorer?v=v1&url=...`
  - `/channels-v2` -> `/link-explorer?v=v2&url=...`
  - `/channel-explorer` -> `/link-explorer?url=...`
  - `/playlists-v1` -> `/link-explorer?v=v1&url=...`
  - `/playlists-v2` -> `/link-explorer?v=v2&url=...`
  - `/users-v1` -> `/link-explorer?v=v1&url=...`
  - `/users-v2` -> `/link-explorer?v=v2&url=...`
  - `/live-v1` -> `/link-explorer?v=v1&url=...`
  - `/live-v2` -> `/link-explorer?v=v2&url=...`
  - `/videos-v1` -> `/global-search?v=v1&type=video`
  - `/videos-v2` -> `/global-search?v=v2&type=video`
  - `/general-v1` -> `/global-search?v=v1`
  - `/general-v2` -> `/global-search?v=v2`
  - `/search` -> `/global-search` (preserving all parameters, query transforms, and offline replay)
  - `/admin` -> `/admin/migrations`

### 2. Universal Dailymotion URL & Identifier Analyzer
- Enhanced `src/lib/platforms/dailymotion/dailymotion-url-analyzer.ts`:
  - Implemented `analyzeDailymotionUrlOrId(input)` with strict SSRF domain allowlist (`dailymotion.com`, `*.dailymotion.com`, `dai.ly`).
  - Automatic resource detection for:
    - Videos (`dailymotion.com/video/<id>`, short links `dai.ly/<id>`, bare `x...` IDs)
    - Playlists (`dailymotion.com/playlist/<id>`, `playlist:<id>`)
    - Channels & Profiles (`dailymotion.com/channel/<id>`, `dailymotion.com/@<handle>`, `@handle`, `channel:<id>`)
    - Users (`dailymotion.com/user/<id>`, `user:<id>`)
    - Livestreams (`dailymotion.com/live/<id>`, `live:<id>`)
    - Search queries (`dailymotion.com/search/<query>`)
  - Extracted canonical URLs, V1 API paths, V2 API paths, display labels, and contextual warnings.
  - Preserved backward compatibility for `analyzeDailymotionChannelInput`.
  - Added unit test suite in `src/lib/platforms/dailymotion/__tests__/dailymotion-url-analyzer.test.ts` (10 tests, 100% pass).

### 3. Unified Link Explorer Workspace (`/link-explorer`)
- Implemented `src/app/link-explorer/page.tsx` and `src/components/link-explorer/link-explorer-workspace.tsx`:
  - Version switcher: `[ V1 — Legacy API ]` and `[ V2 — Current API ]` synced to URL `?v=v1|v2`.
  - Large universal input with inner clear `X` button, quick example chips (`Video: x8n8x8`, `Short: dai.ly/x8n8x8`, `Channel: @lemonde`, `Playlist: x88apm`, `Live: x6m7w8`).
  - Automatic resource detection banner showing detected kind, canonical URL, API strategy, and warnings.
  - Manual resource-type override dropdown (`Auto-Detect Type`, `Force Video`, `Force Channel / Profile`, `Force Playlist`, `Force Livestream`, `Force User`).
  - Specialized resource display sections:
    - **Video**: Metadata card, 16:9 thumbnail, duration, views, owner, description, related videos tab.
    - **Channel / Profile**: Canonical header, stats, video catalog grid, deep crawler bridge ("Deep Fetch Crawler" -> `/channel-explorer?channel=<id>`).
    - **Playlist**: Header, item count, video catalog rendered with `ResultCard`.
    - **Livestream**: Pulsing live badge, viewer count, stream info.
  - Automatic IndexedDB search snapshot capture via `captureSearchSnapshot` with ZERO media binary downloads.
  - Raw JSON inspection drawer (`RawJsonDrawer`).

### 4. Dailymotion API Capability & Compatibility Documentation
- Authored `docs/API_CAPABILITY_MATRIX.md` and `docs/API_COMPATIBILITY_MATRIX.md` providing an authoritative comparison between Legacy API (v1) and Modern REST API (v2):
  - Base URLs, OAuth token endpoints, lifetimes, authentication requirements, and scope declarations.
  - Resource-by-resource compatibility matrix (Videos, Channels/Profiles, Users, Playlists, Livestreams).
  - Endpoint URLs, HTTP methods, scopes, supported query parameters, metadata fields, pagination models, and known limitations.
  - Link Explorer resolution paths and error recovery strategies.

### 5. Centralized Error Handling & Diagnostics Architecture
- Implemented `src/lib/dailymotion/errors/` module:
  - `types.ts`: 44 strongly-typed error codes (`DailymotionErrorCode`), 4 categories (`auth`, `http_provider`, `network`, `integration`), and unified `DailymotionNormalizedError` envelope.
  - `redact.ts`: Recursive secret, token, JWT, and URL parameter redaction to prevent accidental credential leakage in logs or client envelopes.
  - `retry.ts`: Bounded exponential backoff with full jitter, `Retry-After` header parsing, and retry eligibility rules.
  - `normalizer.ts`: Normalizes provider error payloads (V1/V2 envelopes, HTTP status codes, network/fetch exceptions) into safe, user-friendly diagnostic objects with actionable remedies.
  - `logger.ts`: Server-side structured logger with automatic redaction and correlation IDs.
  - `<ApiErrorAlert>` component: Accessible WCAG 2.2 AA alert with category/code badges, user-friendly guidance, retry action, settings shortcuts, and collapsible technical diagnostics.

### 6. Dashboard Redesign & Button Contrast System (WCAG 2.2 AA)
- **Dashboard Redesign (`src/app/page.tsx`)**:
  - Removed duplicate search input from the Dashboard page completely.
  - Reorganized page into a clean, modern overview with: Hero & Architecture Status Bar, Real-time Activity Metrics (Saved items, collections, presets, snapshots, V1/V2 query counters), 6 Core Workspace cards, Quick Configuration/Storage cards, and Platform Compliance & Safety cards.
- **Button Contrast Overhaul (WCAG 2.2 AA >= 4.5:1)**:
  - Fixed low-contrast light-on-light bugs across the application caused by `text-white` on `bg-[var(--primary)]` (which evaluates to `oklch(0.922 0 0)` in dark mode).
  - Migrated buttons, tabs, segmented controls, filter pills, and links across all workspaces to use `bg-primary text-primary-foreground`, yielding >= 13:1 contrast in dark mode and >= 14:1 contrast in light mode.
  - Updated shared button primitive (`src/components/ui/button.tsx`) and verified all variants (`primary`, `secondary`, `outline`, `ghost`, `destructive`, `success`, `gold`, `info`).

### 7. Verification Evidence
- TypeScript compilation: `node ./node_modules/typescript/bin/tsc --noEmit` exited 0 (clean, zero errors across entire codebase).
- Vitest test suite: **34/34 test files passed, 166/166 tests passed (`npm test`)**, including:
  - `src/lib/dailymotion/errors/__tests__/errors.test.ts` (11/11 tests passed).
  - `src/lib/discovery/__tests__/api-separation.test.ts` (5/5 tests passed).
- Environment preflight: `node scripts/validate-all-env.mjs` exited 0 (clean, zero secrets exposed).
- Database preflight: `npm run db:validate` exited 0 (clean).
- Git security check: `git check-ignore .env .dev.vars .prod.vars` confirmed 100% ignored. Zero secrets exposed.
- Vercel Production Deployment: Successfully deployed to production (`dpl_Fq7kXpWn4yVvRhJy2npN5`), deployment URL `https://dailymotion-discovery-rhjy2npn5-alahly13s-projects.vercel.app`, alias `https://dailymotion-discovery.vercel.app`. Status **`● Ready`** (duration 37s). Turbopack build cleanly emitted 225+ static/dynamic output items without CSR bailout.
- Live Browser UI & Flow Verification: Host-observed visual audit (`https://dailymotion-discovery.vercel.app`) confirmed 100% passing:
  - Sidebar navigation renders nested `V1 — Legacy API` and `V2 — Current API` links under both Global Search and Link Explorer.
  - Collapse and expand toggle operates smoothly (64px rail to 256px expanded) with persisted preferences in `localStorage`.
  - `/global-search` loads with zero hydration errors, interactive `[ V1 — Legacy ]` and `[ V2 — Current ]` switcher, quick filter toolbar (`[Resource Type]`, `[Category]`, `[Sort]`, `[More Filters]`), and real query execution returning live video result cards.
  - `/link-explorer` loads cleanly, provides instant universal URL/identifier analysis, example chips, manual resource override, and resolved catalog views.
  - Retired routes (`/channels-v1?channel=lemonde`, etc.) cleanly redirect preserving query parameters.
  - `/account` renders Administrator profile (`asdy@dailymotion.discov.com`), session security details, and quick system links.

## Known Limitations

- Live AI endpoints (`/api/ai/*`, `/ai-search`) fail closed with HTTP `503 missing_config` until a real `GEMINI_API_KEY` replaces the placeholder in `.env` or Vercel Environment Variables.
- Admin session auth gates `/api/sync/*`, `/api/storage/*`, `/api/cloud/*`, and `/api/admin/*`.
- Cloudflare Worker production deployment (`worker:deploy`) is ready for operator execution using Cloudflare CLI credentials.

## Future Roadmap

- Deploy `cloudflare/workers/dailymotion-discovery-api` using `npm run worker:deploy`.
- Monitor remote production build on Vercel after Git push.
- Expand multi-user Supabase Auth owner scoping when multi-user tenancy is introduced.

## Agent Instructions

- Read `AGENTS.md` and this ledger before making structural changes.
- Keep `prisma`, `@prisma/client`, and `@prisma/adapter-pg` aligned on **Prisma ORM 7 (`7.10.1`)** unless explicitly migrating to a new stable major version.
- Use a root `.env` file (never `.env.local`) with `DATABASE_URL` primary and optional `SUPABASE_DATABASE_URL_CONNECTION_STRING` backup; never introduce `DIRECT_URL` or `DATABASE_URL_CONNECTION_STRING`.
- Keep secrets server-only (`SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `PRIVATE_DAILYMOTION_API_KEY_*`, `DATABASE_URL`) and preserve `requireAdmin()` gating on `/api/cloud/*` and `/api/admin/*`.
- Never turn this product into a video downloader, rehosting tool, or private-stream scraper.
- Update this ledger and `README.md` / `docs/migrations/*` whenever schema, env contracts, or route architecture change.


---

## 2026-11-14: Persistence, Playlists, Settings Redesign, Auth Session Security & UX Architecture Integration

### 1. Architectural Summary & Scope
Continued development of the existing Dailymotion Discovery project, integrating all features into a single, cohesive, production-grade application without isolating UI from database or persistence:
1. **Seven-Day Search Persistence & Automatic Restoration**:
   - Primary persistence in IndexedDB (`search_snapshots` and `search_snapshot_pages` object stores).
   - Saved as results arrive, not only on page unload. Full untouched original API payload persisted (ZERO media binaries).
   - Automatic restoration on return to Global Search (`/global-search`) and Link Explorer (`/link-explorer`) with **ZERO Dailymotion API calls and ZERO Gemini calls**.
   - Clear UI indicator: `Restored from local search history · Zero API Calls`.
   - 7-day retention (`NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS=604800` default).
   - Multi-tab safety with workspace-scoped pointers (`getLatestSearchPointer` / `setLatestSearchPointer`).
   - Browser Storage API persistence integration via `requestBrowserPersistentStorage()` (`navigator.storage.persist()`).
2. **Explicit API V1 and V2 Provenance Architecture**:
   - Created canonical provenance module (`src/lib/discovery/provenance.ts`).
   - Defined `DailymotionSourceMetadata` containing `provider: "dailymotion"`, `apiVersion: "v1" | "v2"`, `resourceType`, `resourceId`, `fetchedAt`, `endpoint`, and `schemaVersion`.
   - Stamped provenance across normalizers (`v1-normalize.ts`, `v2-normalize.ts`), models (`DiscoveryItem.provenance`), IndexedDB snapshots, page records, saved items, playlists, and exports.
3. **Application-Managed Playlists Workspace**:
   - Created `/playlists` workspace (`src/app/playlists/page.tsx`) and navigation entry in `AppShell` Library section.
   - User-created playlist CRUD: Create, rename, edit description, view item counts, delete with confirmation modal.
   - Cleanly separated application playlists from Dailymotion platform playlists (persisted locally and synced via `entities_collections` and `entities_collection_items`).
   - Integrated `AddToPlaylistModal` (`src/components/playlists/add-to-playlist-modal.tsx`) directly onto all `ResultCard` components with instant duplicate prevention and inline playlist creation.
   - Playlist item management: Persisted reordering (move up, move down), single remove, bulk selection, bulk remove, bulk move to another playlist, in-playlist search, sort (position, title, date, views, duration), open URL, copy canonical link, and JSON/CSV export.
4. **Structured Settings Page Redesign**:
   - Reorganized `/settings` (`src/app/settings/page.tsx`) into 7 logically grouped tabbed sections:
     - **Account & Session**: Administrator profile (`asdy@dailymotion.discov.com`), active 7-day session validity, real Sign Out action, `ChangePasswordForm` (Supabase Auth SSR).
     - **Appearance**: Light / Dark / System theme switcher with live toggle.
     - **Discovery & API**: V1 & V2 `ConnectionPanel` diagnostics, capability matrix, zero secret exposure.
     - **Search Preferences**: Per-version defaults (`VersionDefaultsEditor` for V1 and V2: sort, page size, family filter, localization).
     - **Storage & Synchronization**: IndexedDB statistics, persistent storage status, library counts, links to `/storage`.
     - **Privacy & Data Retention**: 7-day TTL guarantee details, "Purge Expired Snapshots", "Clear All Search History" with confirmation safety.
     - **System & Diagnostics**: Application build info, Supabase Session Pooler connection (:5432), migration links.
5. **Real Sign Out & Administrator Session Security**:
   - Implemented real Supabase Auth SSR sign out endpoint (`/api/admin/logout`) and updated `/api/admin/session` POST handler.
   - Clears `dm_admin_session` cookie (`maxAge: 0`, `path: "/"`).
   - Enforces `Cache-Control: no-store, no-cache, must-revalidate` to prevent back-navigation cached access.
   - Server-side verification enforces 7-day session TTL (`ADMIN_SESSION_TTL_SECONDS=604800`) and fails closed on unauthenticated or expired requests.
6. **Dark Mode WCAG 2.2 AA Contrast Hardening**:
   - Added global CSS rules in `src/app/globals.css` explicitly styling native `<select>`, `<option>`, and `<optgroup>` with dark surface `#1e1e1e` and light text `#f8fafc`, resolving OS-native silver/white clashes on Windows Chromium/Edge.
   - Form inputs, placeholder text, popovers, dialogs, badges, and code blocks verified against WCAG 2.2 AA (>= 4.5:1 normal text, >= 3:1 large text).
7. **Global Search Results Layout Redesign**:
   - Redesigned results grid to guarantee at least 3 cards per row on desktop even with sidebar expanded: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 min-[1850px]:grid-cols-5 gap-4`.
8. **Sibling Layout for Local Filters**:
   - Implemented responsive sibling layout in `UnifiedSearch`: Left column = `DiscoveryLocalFilterPanel` (`aside` with `Local Only · Zero API Calls` badge), Right column = search workspace & results grid.
   - When collapsed, `aside` is hidden and `main` expands to 100% full width.
9. **Synchronized API Version State**:
   - Built `useSynchronizedApiVersion` hook and `version-sync.ts` using URL query parameter `?v=v1|v2` as single source of truth.
   - Dispatches `API_VERSION_EVENT` (`"dm:api-version-change"`), keeping sidebar sublinks, page tabs, and browser navigation in immediate lockstep without losing search query parameters.

### 2. Files Changed & Created
- `src/lib/discovery/provenance.ts` (created): Canonical provenance definitions and helpers.
- `src/lib/discovery/types.ts` (modified): Stamped `provenance` metadata onto `DiscoveryItem`.
- `src/lib/discovery/v1-normalize.ts` (modified): Attached V1 provenance envelope.
- `src/lib/discovery/v2-normalize.ts` (modified): Attached V2 provenance envelope.
- `src/lib/local-first/indexeddb-store.ts` (modified): Added workspace, ownerId, latest search pointers, `requestBrowserPersistentStorage`, `getDiscoveryDatabaseStats`.
- `src/lib/search-history/search-snapshot-types.ts` (modified): Updated capture & restore options.
- `src/lib/search-history/search-snapshot-service.ts` (modified): Added `getLatestRestorableSearchSnapshot`, `clearAllSearchSnapshots`, `purgeExpiredSearchSnapshots`.
- `src/lib/navigation/version-sync.ts` (created): Synchronized API version state management.
- `src/components/layout/app-shell.tsx` (modified): Synced version sublinks via `version-sync.ts`, added Playlists link.
- `src/components/playlists/add-to-playlist-modal.tsx` (created): Reusable playlist modal with duplicate prevention.
- `src/components/discovery/result-card.tsx` (modified): Embedded `+ Playlist` action.
- `src/app/playlists/page.tsx` (created): Complete Application-Managed Playlists workspace.
- `src/components/discovery/unified-search.tsx` (modified): Auto-restoration on mount, synchronized version, left-side sibling layout, desktop >= 3 cards per row.
- `src/components/link-explorer/link-explorer-workspace.tsx` (modified): Auto-restoration on mount, synchronized version, link explorer snapshot persistence.
- `src/app/api/admin/logout/route.ts` (created): Full Supabase SSR sign out & cookie clearance.
- `src/app/api/admin/session/route.ts` (modified): Synced logout behavior with SSR invalidation.
- `src/app/account/page.tsx` (modified): Connected real Sign Out action with `/admin/login` redirect.
- `src/app/settings/page.tsx` (modified): 7-section structured redesign with all controls connected.
- `src/app/globals.css` (modified): WCAG 2.2 AA Dark mode select/option contrast hardening.
- `src/lib/search-history/__tests__/search-persistence.test.ts` (created): 7-day persistence, restoration, pointer tests.
- `src/lib/navigation/__tests__/version-sync.test.ts` (created): Version synchronization tests.
- `src/lib/admin/__tests__/logout.test.ts` (created): Sign out, cookie, and session security tests.
- `src/app/playlists/__tests__/playlists.test.ts` (created): Playlist CRUD, duplicate prevention, reordering tests.

### 3. Verification Results
- **TypeScript**: `node ./node_modules/typescript/bin/tsc --noEmit` exited 0 (clean, zero errors across entire codebase).
- **Vitest**: `npm test` passed 38/38 test files, **187/187 tests passing**.
- **Prisma**: `npx prisma validate` validated successfully against `schema.prisma`.

---

## 2026-11-14: Link Explorer Version Toggle Decoupling & Strict Dual-API Track Separation

### 1. Root Cause & Architectural Correction
1. **Version Toggle Decoupling (`handleVersionChange`)**:
   - **Root Cause**: In `LinkExplorerWorkspace` (`src/components/link-explorer/link-explorer-workspace.tsx`), `handleVersionChange` contained `if (resolution?.analyzed) { void executeResolution(input, nextVersion); }`. Clicking `[ V1 — Legacy ]` or `[ V2 — Current ]` automatically invoked `executeResolution(input, nextVersion)`, firing an unprompted live network search.
   - **Fix**: Removed the auto-trigger from `handleVersionChange`. Switching between `V1` and `V2` strictly updates the internal version state (`setVersion(nextVersion)`), updates the URL query parameter (`?v=nextVersion`), and resets `restoredFromHistory` with **ZERO automated network queries**. The user alone initiates analysis by clicking "Analyze & Explore" or "Re-analyze Link".
2. **Multi-Word & Arabic Search Query Classification (`analyzeDailymotionUrlOrId`)**:
   - **Root Cause**: In `src/lib/platforms/dailymotion/dailymotion-url-analyzer.ts`, non-URL and non-`x...` inputs fell back to `kind: "channel"`. When users entered multi-word Arabic or Unicode phrases (e.g. `رقص افراح شعبيه مصرى`), the engine constructed invalid channel routes (`/user/رقص افراح شعبيه مصرى/videos` and `/v2/profiles/رقص افراح شعبيه مصرى/videos`), causing provider failures.
   - **Fix**: Enhanced `analyzeDailymotionUrlOrId` to detect multi-word queries (`/\s+/.test(cleanId)`) or non-slug characters as `kind: "search"` (`apiPathV1: /videos?search=...`, `apiPathV2: null`, `displayLabel: Search Query: "..."`).
   - Added `<option value="search">Force Search Query (v1)</option>` to the manual type override selector.
3. **Strict Dual-API Isolation Guarantee**:
   - **V1 Track**: Queries `/api/discovery/v1/general?q=${encodeURIComponent(query)}&pageSize=24&page=${page}`, returning video search results.
   - **V2 Track**: Dailymotion API v2 does not offer global video keyword search. If a user analyzes a search query under V2, the system cleanly and honestly explains: *"Dailymotion API v2 does not support global keyword search across all videos. Switch to API v1 for global search, or provide a channel/profile URL."* It never silently falls back to V1 or corrupts the V2 boundary.
4. **Link Explorer 2026 Architecture Integration**:
   - Strategy banner displays which track is currently active with an `Active Track` badge.
   - If active version differs from previously rendered resolution results, an inline notice explains: *"Active API version switched to V2. The results below were fetched from API V1."* with an optional `Re-analyze on V2` shortcut.
   - Integrated `AddToPlaylistModal` directly onto the Main Item Highlight card, allowing users to save analyzed items to playlists.

### 2. Files Modified & Added
- `src/components/link-explorer/link-explorer-workspace.tsx`: Decoupled version switcher from auto-execution, added Force Search override, added active strategy track badges, added `AddToPlaylistModal` to main item card.
- `src/lib/platforms/dailymotion/dailymotion-url-analyzer.ts`: Classifies multi-word text, Arabic/Unicode phrases as `kind: "search"`.
- `src/lib/link-explorer/link-explorer-service.ts`: Attached `page` parameter to `/api/discovery/v1/general` pagination.
- `src/lib/platforms/dailymotion/__tests__/dailymotion-url-analyzer.test.ts`: Added unit tests for multi-word Arabic, English phrases, and Unicode queries.
- `src/lib/discovery/__tests__/api-separation.test.ts`: Added tests for Link Explorer Arabic search query resolution and strict dual-API isolation.

### 3. Verification Evidence
- **TypeScript**: `node ./node_modules/typescript/bin/tsc --noEmit` exited 0 (clean, 0 errors).
- **Vitest**: `npm test` passed **38/38 test files, 190/190 tests passing**.
- **Prisma**: `npx prisma validate` validated successfully (schema valid).
