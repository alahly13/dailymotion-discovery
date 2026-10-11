# Dailymotion Discovery Platform Ledger

Updated: 2026-10-11
Repo path: `E:\discovery\dailymotion-discovery`
Scope: Project source-of-truth ledger, updated after Supabase/Postgres/Storage/batch-save/migration-management integration.

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

## Known Limitations

- The current real product surface is mostly `/channel-explorer`.
- `/search`, `/ai-search`, and `/saved` are still mostly placeholder UIs.
- Channel Explorer now uses Prisma/Supabase persistence for manifests, jobs, windows, page attempts, history, resume checkpoints, coverage, source metadata, snapshots, and videos when `ENABLE_MANIFEST_PERSISTENCE=true`.
- `npm run lint` is blocked by the stale `next lint` script; Next.js 16 requires moving linting to a direct ESLint or Biome command.
- `stop-fetch` is informational only; actual stop behavior is browser-side `AbortController`, not server-side job cancellation.
- AI routes currently return plain text, not strongly structured end-to-end JSON workflows.
- No visible sign-in, sign-up, or full account management UI exists in the scanned app pages.
- Runtime Prisma usage is intentionally centralized in `src/lib/prisma/client.ts` and `src/lib/repositories/channel-fetch-persistence.ts`, and only server route handlers reach that layer.
- `framer-motion` is installed but not visibly used in the scanned source files.
- Future database applies still require the operator to verify the target database and set `CONFIRM_DB_APPLY=true`.

## Future Roadmap

- Add a YouTube adapter with the same normalized metadata and manifest model.
- Expand into multi-platform adapters beyond Dailymotion.
- Expand DB-backed Channel Explorer persistence into saved-library workflows, cleanup tooling, and event/audit timelines.
- Enable `pgvector` and semantic search once embeddings are introduced.
- Add authentication and user-account flows on top of the existing Supabase SSR foundation.
- Expand saved collections and library workflows beyond the current placeholder page.
- Add AI indexing, structured AI outputs, and retrieval-friendly metadata pipelines.
- Add pagination or virtualization for very large manifests and result sets.
- Add production monitoring, observability, and operational dashboards for fetch behavior and AI route health.

## Agent Instructions

- Read this ledger first before making structural changes.
- Do not rebuild the app from scratch unless a human explicitly requests that approach.
- Prefer minimal, surgical edits that respect the current manifest-first architecture.
- Keep secrets server-only and do not print them in logs or docs.
- Treat `DATABASE_URL` as the canonical DB variable.
- Do not reintroduce `DIRECT_URL` as an active env variable, override, fallback, or duplicate database URL.
- Preserve separation between Search Manifest, Channel Manifest, Saved Library, and AI scopes.
- Do not turn this product into a downloader, scraper, or rehosting tool.
- Update this ledger and `PROJECT_LEDGER.md` after meaningful architecture, workflow, or env-contract changes.
- Check `README.md`, `PROJECT_LEDGER.md`, and repo-local `.agents/skills/` guidance when working on Supabase, Prisma, or operational flows.
