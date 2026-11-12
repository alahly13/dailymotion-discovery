# Dailymotion Discovery Platform (2026)

Next.js App Router metadata discovery, channel catalog persistence, local-first research organization, and AI-assisted analysis built for **Legacy Dailymotion API v1** and **Dailymotion API v2**, backed by **IndexedDB (`dailymotion_discovery_local_v1`)**, **Cloudflare R2 via dedicated Worker (`dailymotion-discovery-api`)**, **PostgreSQL / Prisma ORM 7 (`7.10.1`)**, **Supabase Private Storage**, and **Google Gemini (`@google/genai`)**.

> This platform works exclusively with public metadata and official API endpoints. It never downloads, rehosts, or scrapes private video streams.

---

## Core Architecture (2026 Stack)

- **Framework**: Next.js `16.4.6` (App Router) · React `19.3.1` · TypeScript · Tailwind CSS v4
- **Local-First Durability**: Browser IndexedDB (`dailymotion_discovery_local_v1`) with write-ahead `pending_operations` outbox, interrupted sync journal recovery, and seamless one-time localStorage migration
- **Authoritative Object Storage**: Private Cloudflare R2 (`dailymotion-discovery-private`) accessed strictly via dedicated Worker (`cloudflare/workers/dailymotion-discovery-api`), Web Crypto HMAC-SHA256 capability tokens, immutable UTF-8 chunked parts (`40 MiB` target / `45 MiB` cap), and SHA-256 `/batch/verify` integrity checks
- **Database & ORM**: **Prisma ORM `7.10.1`** (`prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg`) with canonical `StorageDataset` / `StorageGeneration` / `StorageManifestPart` / `ResearchCollection` / `SavedSearchPreset` models
- **Legacy Cloud Storage Bridge**: Supabase (`@supabase/supabase-js`, `@supabase/ssr`) private storage (`SUPABASE_SECRET_KEY`) with non-destructive archival migration preview & copy (`/api/admin/storage-migration`)
- **AI Helpers**: Google Gemini via **`@google/genai`** defaulting to **`gemini-2.5-flash`** with bounded manifest inspection (`AI_MANIFEST_MAX_ITEMS`, `AI_MANIFEST_MAX_CHARS`)

---

## Application Routes

### Discovery Workspaces (Version-Explicit)
Each resource uses separate endpoints, query parameters, normalizers, pagination, and history:
- **Unified Search**: `/search` (V1/V2 switcher, dynamic `param-schema` filters, `DiscoveryLocalFilterPanel` zero-API refinement & search-inside-results, bulk selection, offline cached snapshot replay, Save Search Preset)
- **AI Search**: `/ai-search` (Gemini query translation to structured V1 params, live Dailymotion V1 execution, bounded manifest summarization)
- **V1 Pages**: `/general-v1`, `/videos-v1`, `/channels-v1`, `/playlists-v1`, `/users-v1`, `/live-v1`
- **V2 Pages**: `/general-v2`, `/videos-v2`, `/channels-v2`, `/playlists-v2`, `/users-v2`, `/live-v2`
- **Capabilities & API Docs**: `/compare`, `/capabilities` (resource tables + `FILTER_CAPABILITY_MATRIX` API vs Local boundary), `/docs`

### Research Workspace, Collections, Presets & Storage Center
- **Saved Library**: `/saved` (IndexedDB + PostgreSQL saved items, favorites, quick collection links)
- **Personal Research Collections**: `/collections` (personal collections distinct from Dailymotion platform playlists: create/edit/delete, reorder up/down, move/copy, per-item notes, overlap badges, JSON/CSV export)
- **Saved Search Presets**: `/saved-searches` (pin, tag, filter, Re-run Live API Query vs Reload Cached Snapshot Offline)
- **Search History Explorer**: `/history` (local search across queries & params, Params JSON drawer, live re-run & offline snapshot replay)
- **Storage, Manifest Explorer & Recovery**: `/storage` (R2 Worker health, dataset generation manifests, SHA-256 verification, full cloud ZIP & offline JSON backup/restore, interrupted sync repair, non-destructive Supabase -> R2 archive copy)
- **Channel Explorer & Saved Channels**: `/channel-explorer`, `/channels`, `/channels/[sourceId]`, `/channels/[sourceId]/attempts/[attemptId]`
- **Workspace Sync**: `/workspace` (Outbox telemetry, SaveReceipt stage indicator, two-way Save All & Cloud Hydrate)
- **Settings & Admin**: `/settings`, `/admin/login`, `/admin/migrations`

---

## API Routes

- **Discovery V1 / V2 / Shared**: `/api/discovery/v1/[resource]`, `/api/discovery/v2/[resource]`, `/api/discovery/{auth-status,compare}`
- **AI Routes**: `POST /api/ai/{parse-query,filter-helper,summarize-manifest}`
- **Local-First & R2 Sync (Admin-gated)**:
  - `POST /api/sync/save-all` (two-phase R2 batch upload + SHA-256 verify + manifest/version pointer + Postgres commit)
  - `GET /api/sync/hydrate` · `GET /api/sync/status`
  - `GET /api/storage/overview` · `POST /api/storage/verify` · `GET /api/storage/export` (ZIP with SHA-256 manifest)
  - `GET / POST /api/admin/storage-migration` (non-destructive Supabase -> R2 archive preview & copy)
- **Legacy Cloud Workspace CRUD (Admin-gated)**: `/api/cloud/{sync-state,batch-commit,saved-titles,collections,history}`
- **Channel Deep-Fetch**: `/api/dailymotion/channel/*`
- **Admin Diagnostics**: `/api/admin/{login,session,migrations/status}`

---

## Setup & Environment (`.env` only)

Copy `.env.example` to a root `.env` file (**do not create `.env.local`** in this repository):

```bash
npm install
cp .env.example .env
npm run env:validate
npm run db:generate
npm run dev
```

### Database Connection Strategy
- **Primary**: `DATABASE_URL` pointing to the **Supabase Session Pooler** on port `5432` (`postgresql://postgres.<project-ref>:<percent-encoded-password>@aws-0-<region>.pooler.supabase.com:5432/postgres`).
- **Backup**: Optional `SUPABASE_DATABASE_URL_CONNECTION_STRING` used only when `DATABASE_URL` is absent.
- Never configure `DIRECT_URL` or `DATABASE_URL_CONNECTION_STRING` (retired legacy names).
- Optional `PRISMA_CONNECT_TIMEOUT_SECONDS="30"` guards CLI commands against transient pooler `P1001` timeouts.
- See `.env.example` for every public, Postgres, Supabase Storage, Gemini AI, Dailymotion V1/V2, Admin, and Channel Fetch cap variable.

---

## Database & Migration Commands (Prisma 7.10.1)

| Command | Purpose |
|---|---|
| `npm run db:validate` | Validate database env configuration without printing secrets |
| `npm run db:diagnose` | Layered DNS / TCP / `pg` / Prisma diagnostics |
| `npm run db:status` | Preflight connectivity + read-only `prisma migrate status` |
| `CONFIRM_DB_APPLY=true npm run db:apply` | Guarded migration deploy + client generation + verification |
| `npm run db:generate` | Regenerate Prisma Client (`@prisma/client` `7.10.1`) |
| `npm run db:create-migration` | Author a new SQL migration draft under `prisma/migrations/` |
| `npm run db:studio` | Open Prisma Studio |

Full runbooks live under `docs/migrations/`.

---

## Verification & Quality Scripts

```bash
npm run env:validate
npm run lint
npm run typecheck
npm test
npm run build
```
