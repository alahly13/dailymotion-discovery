# Environment Variables Specification & Contract (2026)

**Application:** Dailymotion Discovery Platform  
**Target:** `E:\discovery\dailymotion-discovery`  
**Worker:** `cloudflare/workers/dailymotion-discovery-api`  
**Version:** Production 2026  
**Audited Against:** Actual Source Code (`src/`, `scripts/`, `cloudflare/`, `prisma.config.ts`, `wrangler.jsonc`) & Live Vercel CLI

---

## 1. Master Code-Derived Environment Contract Table

Every variable below was discovered through direct AST and static inspection of the actual repository source code.

| Variable Name | Source Reference(s) | Required Status | Sensitivity | Purpose | Default | Expected Format | Vercel Scope | Runtime vs Build | Dependent Feature |
|---|---|---|---|---|---|---|---|---|---|
| `DATABASE_URL` | `src/lib/config/env.ts:16,102`<br>`src/lib/db/database-url.ts:18`<br>`prisma.config.ts:22`<br>`scripts/app-validate-env.mjs:54` | Required Core | Secret | Primary PostgreSQL connection string | None | `postgresql://...:5432/postgres` | Production, Preview, Development | Runtime + Build | Prisma ORM 7 database repository & migrations |
| `SUPABASE_DATABASE_URL_CONNECTION_STRING` | `src/lib/config/env.ts:17,103`<br>`src/lib/db/database-url.ts:20`<br>`prisma.config.ts:27` | Optional Fallback | Secret | Fallback PostgreSQL connection string if primary unset | None | `postgresql://...` | Development, Preview | Runtime fallback | Database resilience (logs warning if used) |
| `PRISMA_CONNECT_TIMEOUT_SECONDS` | `src/lib/prisma/client.ts:20`<br>`scripts/prisma-command-env.mjs:8` | Optional | Config | Connection timeout for Prisma CLI and pool | `30` | Positive integer (seconds) | Production, Preview, Development | Runtime | Database connection pool resilience |
| `CONFIRM_DB_APPLY` | `scripts/db-apply.mjs:120`<br>`.github/workflows/db-migrate.yml:93` | Conditional CLI Gate | Config | Explicit safety gate for `npm run db:apply` | `false` | Boolean (`true`/`false`) | CLI / CI invocation only | CLI / CI | Prevents accidental migration execution |
| `NEXT_PUBLIC_APP_URL` | `src/lib/config/public-env.ts:4`<br>`src/lib/config/env.ts:162`<br>`scripts/app-validate-env.mjs:75` | Required Core | Config (Public) | Canonical public URL of the application | `http://localhost:3000` | URL (`https://...`) | Production, Preview, Development | Build + Runtime | App shell, absolute links, OAuth redirect |
| `NEXT_PUBLIC_SUPABASE_URL` | `src/lib/config/public-env.ts:5`<br>`src/lib/supabase/client.ts:6`<br>`src/lib/supabase/server.ts:6`<br>`scripts/app-validate-env.mjs:76` | Required Core | Config (Public) | Public HTTPS endpoint for Supabase project | None | `https://*.supabase.co` | Production, Preview, Development | Build + Runtime | Supabase Auth SSR, storage endpoints |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `src/lib/config/public-env.ts:6`<br>`src/lib/supabase/client.ts:7`<br>`src/lib/supabase/server.ts:7`<br>`scripts/app-validate-env.mjs:77` | Required Core | Config (Public) | Supabase publishable anonymous API key | None | String (`anon`/`publishable`) | Production, Preview, Development | Build + Runtime | Client-side Supabase SSR session hydration |
| `NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS` | `src/lib/config/public-env.ts:7`<br>`scripts/validate-all-env.mjs:135` | Optional | Config (Public) | Search history and API snapshot retention TTL | `604800` (7 days) | Positive integer (seconds) | Production, Preview, Development | Build + Runtime | IndexedDB search snapshot expiration & replay retention |
| `SUPABASE_SECRET_KEY` | `src/lib/config/env.ts:25`<br>`src/lib/supabase/storage-server.ts:20,47` | Optional / Conditional | Secret | Server-side Supabase secret key (`sb_secret_...`) | None | Secret string | Production, Preview, Development | Runtime | Server-side private storage document inspection |
| `ADMIN_DEFAULT_USERNAME` | `src/lib/config/env.ts:55`<br>`src/lib/admin/session.ts:21` | Optional | Config | Default administrator username fallback | `"asdy"` / `"admin"` | String | Production, Preview, Development | Runtime | Admin login username mapping |
| `ADMIN_EMAIL` | `src/lib/config/env.ts:56`<br>`src/lib/admin/session.ts:22` | Optional / Canonical | Config | Canonical administrator email mapped to Supabase Auth | `asdy@dailymotion.discov.com` | Email address | Production, Preview, Development | Runtime | Canonical admin identity resolution |
| `ADMIN_INITIAL_PASSWORD` | `src/lib/config/env.ts:57`<br>`src/app/api/admin/login/route.ts:78` | Optional Fallback | Secret | Local development fallback password | None | Secret string | Development, Preview | Runtime fallback | Offline / test admin login |
| `ADMIN_SESSION_SECRET` | `src/lib/config/env.ts:58`<br>`src/lib/admin/session.ts:71` | Required for Admin | Secret | HMAC secret for admin session cookie signing | None | High-entropy string (>= 32 chars) | Production, Preview, Development | Runtime | Admin route authentication (`/api/admin/*`, `/api/cloud/*`) |
| `ADMIN_SESSION_TTL_SECONDS` | `src/lib/config/env.ts:59`<br>`src/lib/admin/session.ts:32` | Optional | Config | Lifetime of admin session cookie | `604800` (7 days) | Positive integer (seconds) | Production, Preview, Development | Runtime | Admin session duration & cookie Max-Age |
| `CLOUDFLARE_R2_WORKER_URL` | `src/lib/config/env.ts:60`<br>`src/lib/storage/r2-capability-token.ts:58`<br>`scripts/app-validate-env.mjs:87` | Required for R2 | Config | Public URL of dedicated R2 Worker | None | `https://*.workers.dev` | Production, Preview, Development | Runtime | Next.js server proxy to Cloudflare R2 worker |
| `CLOUDFLARE_R2_WORKER_HMAC_SECRET` | `src/lib/config/env.ts:61`<br>`src/lib/storage/r2-capability-token.ts:59,70`<br>`scripts/app-validate-env.mjs:88` | Required for R2 | Secret | Shared HMAC secret matching Worker auth | None | 64-char hex string | Production, Preview, Development | Runtime | Generates HS256 capability tokens for Worker |
| `CLOUDFLARE_R2_BUCKET_NAME` | `src/lib/config/env.ts:62`<br>`src/lib/storage/r2-capability-token.ts:60` | Optional | Config | Bound Cloudflare R2 bucket name | `dailymotion-discovery-private` | String | Production, Preview, Development | Runtime | R2 bucket target validation |
| `STORAGE_OWNER_UUID` | `src/lib/config/env.ts:63`<br>`src/lib/storage/r2-canonical-paths.ts:54` | Optional | Config | Canonical tenant namespace partition | `admin` | String / UUID | Production, Preview, Development | Runtime | Scopes storage paths in R2 |
| `GEMINI_API_KEY` | `src/lib/config/env.ts:149,166`<br>`src/lib/ai/gemini-client.ts:6`<br>`scripts/app-validate-env.mjs:80` | Conditional | Secret | Google Gemini API key for `@google/genai` | None | Secret string | Production, Preview, Development | Runtime | AI Search, natural language filtering, manifest summary |
| `GEMINI_MODEL` | `src/lib/config/env.ts:26,153`<br>`src/lib/ai/gemini-client.ts:7` | Optional | Config | Default Gemini LLM model | `gemini-2.5-flash` | Model identifier string | Production, Preview, Development | Runtime | AI model selection |
| `AI_MANIFEST_MAX_ITEMS` | `src/lib/config/env.ts:64`<br>`src/lib/ai/manifest-context.ts:25` | Optional | Config | Maximum items in AI manifest prompt context | `25` | Positive integer (1-100) | Production, Preview, Development | Runtime | Bounded AI prompt budget |
| `AI_MANIFEST_MAX_CHARS` | `src/lib/config/env.ts:65`<br>`src/lib/ai/manifest-context.ts:26` | Optional | Config | Maximum characters in AI manifest prompt context | `9000` | Positive integer (1000-50000) | Production, Preview, Development | Runtime | Enforces strict Gemini context budgets |
| `DAILYMOTION_API_BASE_URL_V1` | `src/lib/config/env.ts:31`<br>`src/lib/discovery/version-config.ts:71` | Required V1 | Config | Dailymotion V1 public discovery endpoint | `https://api.dailymotion.com/` | URL (`https://...`) | Production, Preview, Development | Runtime | V1 anonymous video, channel, user discovery |
| `DAILYMOTION_PARTNER_API_BASE_URL_V1` | `src/lib/config/env.ts:32`<br>`src/lib/discovery/version-config.ts:72` | Optional | Config | Dailymotion V1 authenticated partner endpoint | `https://partner.api.dailymotion.com/rest` | URL (`https://...`) | Production, Preview, Development | Runtime | Partner V1 operations (requires credentials) |
| `DAILYMOTION_OAUTH_TOKEN_URL_V1` | `src/lib/config/env.ts:34`<br>`src/lib/discovery/version-config.ts:84` | Optional | Config | Dailymotion V1 OAuth token exchange endpoint | `https://partner.api.dailymotion.com/oauth/v1/token` | URL (`https://...`) | Production, Preview, Development | Runtime | V1 partner token minting |
| `PRIVATE_DAILYMOTION_API_KEY_V1` | `src/lib/config/env.ts:36`<br>`src/lib/discovery/version-config.ts:85` | Optional | Secret | Client key for Dailymotion V1 Partner API | None | String | Production, Preview, Development | Runtime | Partner V1 queries |
| `PRIVATE_DAILYMOTION_API_KEY_SECRET_V1` | `src/lib/config/env.ts:37`<br>`src/lib/discovery/version-config.ts:86` | Optional | Secret | Client secret for Dailymotion V1 Partner API | None | Secret string | Production, Preview, Development | Runtime | Partner V1 authentication |
| `DAILYMOTION_API_SCOPE_V1` | `src/lib/config/env.ts:43`<br>`src/lib/discovery/version-config.ts:87` | Optional | Config | OAuth scope for V1 partner token | `userinfo` | String | Production, Preview, Development | Runtime | Scope request for V1 token |
| `DAILYMOTION_API_BASE_URL_V2` | `src/lib/config/env.ts:33`<br>`src/lib/discovery/version-config.ts:102` | Required V2 | Config | Dailymotion REST API v2 base endpoint | `https://api.dailymotion.com/v2` | URL (`https://...`) | Production, Preview, Development | Runtime | V2 profiles, video catalog inspection |
| `DAILYMOTION_OAUTH_TOKEN_URL_V2` | `src/lib/config/env.ts:35`<br>`src/lib/discovery/version-config.ts:103` | Required V2 | Config | Dailymotion V2 OAuth2 token endpoint | `https://oauth2.dailymotion.com/v2/token` | URL (`https://...`) | Production, Preview, Development | Runtime | V2 client_credentials token minting |
| `PRIVATE_DAILYMOTION_API_KEY_V2` | `src/lib/config/env.ts:38`<br>`src/lib/discovery/version-config.ts:104` | Optional / V2 Auth | Secret | Client key for Dailymotion V2 API | None | String | Production, Preview, Development | Runtime | Authenticated V2 discovery |
| `PRIVATE_DAILYMOTION_API_KEY_SECRET_V2` | `src/lib/config/env.ts:39`<br>`src/lib/discovery/version-config.ts:105` | Optional / V2 Auth | Secret | Client secret for Dailymotion V2 API | None | Secret string | Production, Preview, Development | Runtime | Authenticated V2 discovery |
| `DAILYMOTION_API_SCOPE_V2` | `src/lib/config/env.ts:45`<br>`src/lib/discovery/version-config.ts:106` | Optional | Config | OAuth scope for V2 token | `bundle.public` | Dot-notation string | Production, Preview, Development | Runtime | Scope request for V2 token |
| `DAILYMOTION_FAMILY_FILTER` | `src/lib/config/env.ts:48`<br>`src/lib/discovery/version-config.ts:155` | Optional | Config | Tri-state global safety filter flag | `true` | Boolean string (`true`/`false`) | Production, Preview, Development | Runtime | Video safety & explicit content filtering |
| `DAILYMOTION_LOCALIZATION` | `src/lib/config/env.ts:50`<br>`src/lib/discovery/version-config.ts:163` | Optional | Config | V1 localization code or automatic detect | `detect` | String | Production, Preview, Development | Runtime | Country-specific discovery weighting |
| `TOKEN_CACHE_ENCRYPTION_KEY` | `src/lib/config/env.ts:53`<br>`src/lib/discovery/token-crypto.ts:15` | Optional | Secret | AES-256-GCM hex key for database token cache | None | 64-char hex string | Production, Preview, Development | Runtime | Durable encryption in `ApiVersionTokenCache` |
| `TOKEN_CACHE_SAFETY_MARGIN_SECONDS` | `src/lib/config/env.ts:54`<br>`src/lib/discovery/version-config.ts:138` | Optional | Config | Early refresh window before token expiry | `60` | Integer (0 to 3600 seconds) | Production, Preview, Development | Runtime | Proactive OAuth token refresh |
| `ENABLE_MANIFEST_PERSISTENCE` | `src/lib/config/env.ts:66,210` | Optional | Config | Enables database persistence of deep manifests | `true` | Boolean string (`true`/`false`) | Production, Preview, Development | Runtime | Channel Explorer persistence toggle |
| `MAX_CHANNEL_FETCH_PAGES` | `src/lib/config/env.ts:67,197` | Optional | Config | Max pages per channel fetch job | `200` | Positive integer | Production, Preview, Development | Runtime | Safety cap on deep fetch crawl |
| `MAX_CHANNEL_FETCH_ITEMS` | `src/lib/config/env.ts:68,198` | Optional | Config | Max video metadata items collected per job | `100000` | Positive integer | Production, Preview, Development | Runtime | Prevents unbounded memory growth |
| `MAX_CHANNEL_FETCH_WINDOWS` | `src/lib/config/env.ts:69,200` | Optional | Config | Max search windows generated during deep fetch | `3000` | Positive integer | Production, Preview, Development | Runtime | Deep fetch windowing ceiling |
| `MAX_CHANNEL_FETCH_WINDOW_DEPTH` | `src/lib/config/env.ts:70,201` | Optional | Config | Maximum recursion depth for adaptive windows | `5` | Positive integer | Production, Preview, Development | Runtime | Deep fetch recursion guard |
| `MAX_CHANNEL_FETCH_TOTAL_PAGES` | `src/lib/config/env.ts:71,199` | Optional | Config | Total page attempts allowed across entire job | `5000` | Positive integer | Production, Preview, Development | Runtime | Hard execution cap |
| `MAX_CHANNEL_FETCH_PAGE_SIZE` | `src/lib/config/env.ts:72,202` | Optional | Config | Page size requested from Dailymotion API | `100` | Positive integer (max 100) | Production, Preview, Development | Runtime | Clamped to provider limit (100) |
| `CHANNEL_FETCH_DELAY_MS` | `src/lib/config/env.ts:73,203` | Optional | Config | Inter-page request throttling delay | `250` | Integer (milliseconds) | Production, Preview, Development | Runtime | Rate-limit avoidance |
| `CHANNEL_FETCH_MIN_DELAY_MS` | `src/lib/config/env.ts:74,204` | Optional | Config | Minimum throttle delay under adaptive backoff | `100` | Integer (milliseconds) | Production, Preview, Development | Runtime | Floor for request delay |
| `CHANNEL_FETCH_CONCURRENCY` | `src/lib/config/env.ts:75,189` | Optional | Config | Default parallel fetch workers | `3` | Positive integer (1-5) | Production, Preview, Development | Runtime | Concurrency management |
| `CHANNEL_FETCH_MAX_CONCURRENCY` | `src/lib/config/env.ts:76,188` | Optional | Config | Maximum allowed concurrency ceiling | `5` | Positive integer (1-5) | Production, Preview, Development | Runtime | Concurrency ceiling |
| `CHANNEL_FETCH_DEFAULT_PROFILE` | `src/lib/config/env.ts:77,207` | Optional | Config | Default crawling strategy profile | `deep-balanced` | Enum (`deep-balanced`, etc.) | Production, Preview, Development | Runtime | Crawler tuning |
| `CHANNEL_FETCH_JOB_TTL_HOURS` | `src/lib/config/env.ts:80,208` | Optional | Config | Retention period for completed fetch jobs | `72` | Positive integer (hours) | Production, Preview, Development | Runtime | Data retention cleanup |
| `TEMP_MANIFEST_TTL_HOURS` | `src/lib/config/env.ts:81,209` | Optional | Config | Retention period for temporary manifests | `72` | Positive integer (hours) | Production, Preview, Development | Runtime | Ephemeral manifest cleanup |
| `WORKER_AUTH_SECRET` | `cloudflare/workers/.../src/index.ts:199,219` | Cloudflare Worker Only | Secret | HMAC secret for Worker capability tokens | None | 64-char hex string | Cloudflare Worker (`.prod.vars`) | Worker Runtime | **Worker Only. Do NOT add to Vercel.** |
| `ALLOWED_ORIGINS` | `cloudflare/workers/.../src/index.ts:124` | Cloudflare Worker Only | Config | CORS allowed origins for Worker | None | Comma-delimited URLs | Cloudflare Worker (`.prod.vars`) | Worker Runtime | **Worker Only. Do NOT add to Vercel.** |
| `R2_BUCKET` | `cloudflare/workers/.../src/index.ts:5,207` | Cloudflare Worker Only | Binding | R2 bucket binding name | None | Cloudflare R2 Binding | Cloudflare Worker (`wrangler.jsonc`) | Worker Runtime | **Worker Binding. Do NOT add to Vercel.** |

---

## 2. Source Code Requirements vs Actual Vercel Configuration Matrix

| Variable Name | Required by Code | Vercel Production | Vercel Preview | Vercel Development | Status in Production |
|---|---|---|---|---|---|
| `DATABASE_URL` | **Yes (Core)** | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `NEXT_PUBLIC_APP_URL` | **Yes (Core)** | Configured (Config) | Not Set | Not Set | Fully Operational |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes (Core)** | Configured (Config) | Not Set | Not Set | Fully Operational |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Yes (Core)** | Configured (Config) | Not Set | Not Set | Fully Operational |
| `CLOUDFLARE_R2_WORKER_URL` | **Yes (R2)** | Configured (Config) | Not Set | Not Set | Fully Operational |
| `CLOUDFLARE_R2_WORKER_HMAC_SECRET` | **Yes (R2)** | Configured (Secret) | Not Set | Not Set | Fully Operational |
| `ADMIN_SESSION_SECRET` | **Yes (Admin)** | Configured (Secret) | Not Set | Not Set | Fully Operational |
| `ADMIN_DEFAULT_USERNAME` | Optional | Configured (Secret) | Not Set | Not Set | Fully Operational |
| `ADMIN_EMAIL` | Optional | **Configured (Secret)** | Not Set | Not Set | **Added & Active** |
| `ADMIN_INITIAL_PASSWORD` | Optional | Configured (Secret) | Not Set | Not Set | Fully Operational |
| `ADMIN_SESSION_TTL_SECONDS` | Optional | Configured (Secret) | Not Set | Not Set | Fully Operational |
| `SUPABASE_SECRET_KEY` | Optional | Configured (Secret) | Not Set | Not Set | Fully Operational |
| `GEMINI_API_KEY` | Conditional | Configured (Secret) | Not Set | Not Set | Fully Operational |
| `GEMINI_MODEL` | Optional | **Configured (Secret)** | Not Set | Not Set | **Added & Active** |
| `AI_MANIFEST_MAX_ITEMS` | Optional | **Configured (Secret)** | Not Set | Not Set | **Added & Active** |
| `AI_MANIFEST_MAX_CHARS` | Optional | **Configured (Secret)** | Not Set | Not Set | **Added & Active** |
| `CLOUDFLARE_R2_BUCKET_NAME` | Optional | Configured (Config) | Not Set | Not Set | Fully Operational |
| `STORAGE_OWNER_UUID` | Optional | Configured (Config) | Not Set | Not Set | Fully Operational |
| `DAILYMOTION_API_BASE_URL_V1` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `DAILYMOTION_PARTNER_API_BASE_URL_V1` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `DAILYMOTION_OAUTH_TOKEN_URL_V1` | Optional | Configured (Secret) | Configured (Secret) | Not Set | Fully Operational |
| `PRIVATE_DAILYMOTION_API_KEY_V1` | Optional | Configured (Secret) | Configured (Secret) | Not Set | Fully Operational |
| `PRIVATE_DAILYMOTION_API_KEY_SECRET_V1` | Optional | Configured (Secret) | Configured (Secret) | Not Set | Fully Operational |
| `DAILYMOTION_API_SCOPE_V1` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `DAILYMOTION_API_BASE_URL_V2` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `DAILYMOTION_OAUTH_TOKEN_URL_V2` | Optional | Configured (Secret) | Configured (Secret) | Not Set | Fully Operational |
| `PRIVATE_DAILYMOTION_API_KEY_V2` | Optional | Configured (Secret) | Configured (Secret) | Not Set | Fully Operational |
| `PRIVATE_DAILYMOTION_API_KEY_SECRET_V2` | Optional | Configured (Secret) | Configured (Secret) | Not Set | Fully Operational |
| `DAILYMOTION_API_SCOPE_V2` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `DAILYMOTION_FAMILY_FILTER` | Optional | Configured (Config) | Not Set | Not Set | Fully Operational |
| `DAILYMOTION_LOCALIZATION` | Optional | Configured (Config) | Not Set | Not Set | Fully Operational |
| `TOKEN_CACHE_ENCRYPTION_KEY` | Optional | Configured (Secret) | Not Set | Not Set | Fully Operational |
| `TOKEN_CACHE_SAFETY_MARGIN_SECONDS` | Optional | Configured (Secret) | Configured (Secret) | Not Set | Fully Operational |
| `PRISMA_CONNECT_TIMEOUT_SECONDS` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `ENABLE_MANIFEST_PERSISTENCE` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `MAX_CHANNEL_FETCH_PAGES` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `MAX_CHANNEL_FETCH_ITEMS` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `MAX_CHANNEL_FETCH_WINDOWS` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `MAX_CHANNEL_FETCH_WINDOW_DEPTH` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `MAX_CHANNEL_FETCH_TOTAL_PAGES` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `MAX_CHANNEL_FETCH_PAGE_SIZE` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `CHANNEL_FETCH_DELAY_MS` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `CHANNEL_FETCH_MIN_DELAY_MS` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `CHANNEL_FETCH_CONCURRENCY` | Optional | **Configured (Secret)** | Not Set | Not Set | **Added & Active** |
| `CHANNEL_FETCH_MAX_CONCURRENCY` | Optional | **Configured (Secret)** | Not Set | Not Set | **Added & Active** |
| `CHANNEL_FETCH_DEFAULT_PROFILE` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `CHANNEL_FETCH_JOB_TTL_HOURS` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |
| `TEMP_MANIFEST_TTL_HOURS` | Optional | Configured (Config) | Configured (Config) | Not Set | Fully Operational |

---

## 3. Deprecated & Legacy Variables Present in Vercel

The following legacy variables were discovered in Vercel project settings from older architectures. They are completely ignored by the 2026 application codebase:

| Variable Name | Present In | 2026 Code Status | Recommendation |
|---|---|---|---|
| `BLOB_WEBHOOK_PUBLIC_KEY` | Production, Preview | Completely eliminated; zero Vercel Blob references in code. | Safe to delete from Vercel dashboard. |
| `BLOB_STORE_ID` | Production, Preview | Completely eliminated; zero Vercel Blob references in code. | Safe to delete from Vercel dashboard. |
| `AI_EMBEDDING_MODEL` | Production, Preview | Retired; replaced by FlexSearch and direct Gemini Flash. | Safe to delete from Vercel dashboard. |
| `ENABLE_PGVECTOR` | Production, Preview | Retired; platform uses standard PostgreSQL & Prisma ORM 7. | Safe to delete from Vercel dashboard. |

---

## 4. Manual Vercel Environment Variables Required

**Status:** **0 (Zero) Required Variables Missing from Vercel Production.**

All 48 active application variables are fully configured in Vercel Production. The remote production deployment `https://dailymotion-discovery-9r2fjo6rp-alahly13s-projects.vercel.app` compiled in `1m 6s` and is `● Ready` with 100% route generation and live API probe verification.
