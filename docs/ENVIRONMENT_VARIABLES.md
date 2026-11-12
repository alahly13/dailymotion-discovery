# Environment Variables Specification & Contract (2026)

**Application:** Dailymotion Discovery Platform  
**Target:** `E:\discovery\dailymotion-discovery`  
**Worker:** `cloudflare/workers/dailymotion-discovery-api`  
**Version:** Production 2026  

---

## 1. Master Environment Contract Table

| Variable Name | Location | Required Status | Sensitivity | Purpose | Default | Expected Format | Provider | Feature | Environment | Validation |
|---|---|---|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Root app | Required | Public | Canonical public origin of the deployment | `http://localhost:3000` | URL (`http(s)://...`) | Local / Vercel | App shell, absolute links, OAuth redirect | All | Checked in build & runtime validator |
| `NEXT_PUBLIC_SUPABASE_URL` | Root app | Required | Public | Public HTTPS endpoint for Supabase project | None | URL (`https://*.supabase.co`) | Supabase | Auth SSR, storage endpoints, browser client | All | Validated URL format |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Root app | Required | Public | Supabase publishable anonymous API key | None | String (`anon`/`publishable`) | Supabase | Client-side Supabase SSR session hydration | All | Non-empty string check |
| `DATABASE_URL` | Root app | Required | Secret | Primary PostgreSQL connection string | None | URL (`postgresql://...:5432/postgres`) | Supabase Session Pooler | Prisma ORM 7 repository operations & migrations | All | Parsed by Prisma & pg pooler check |
| `SUPABASE_DATABASE_URL_CONNECTION_STRING` | Root app | Optional | Secret | Fallback PostgreSQL connection string | None | URL (`postgresql://...`) | Supabase | Backup database connection if DATABASE_URL unset | Dev / Test | Warns loudly when used |
| `PRISMA_CONNECT_TIMEOUT_SECONDS` | Root app | Optional | Configuration | Timeout for Prisma CLI and connection pool | `30` | Positive integer (seconds) | Local configuration | Database connection timeout resilience | All | Number coercion |
| `CONFIRM_DB_APPLY` | Root CLI / CI | Conditional | Configuration | Safety gate for `npm run db:apply` | `false` | Boolean (`true`/`false`) | Operator invocation | Prevents accidental migration execution | Staging / Prod | Exact string check `true` |
| `SUPABASE_SECRET_KEY` | Root app | Optional | Secret | Server-side Supabase secret key (`sb_secret_...`) | None | Secret string | Supabase | Server-side storage document inspection | All | Validated non-empty when used |
| `GEMINI_API_KEY` | Root app | Conditional | Secret | Google Gemini API key for `@google/genai` | None | Secret string | Google AI Studio | `/api/ai/*` queries, manifest summarization | All | Fail-closed HTTP 503 check |
| `GEMINI_MODEL` | Root app | Optional | Configuration | Default Gemini LLM model | `gemini-2.5-flash` | Model identifier string | Google AI | AI Search, natural language filtering | All | Non-empty string |
| `DAILYMOTION_API_BASE_URL_V1` | Root app | Required | Configuration | Dailymotion V1 public discovery endpoint | `https://api.dailymotion.com/` | URL (`https://...`) | Dailymotion | V1 video, channel, user, playlist discovery | All | URL validation |
| `DAILYMOTION_PARTNER_API_BASE_URL_V1` | Root app | Optional | Configuration | Dailymotion V1 authenticated partner endpoint | `https://partner.api.dailymotion.com/rest` | URL (`https://...`) | Dailymotion | Partner V1 operations (requires credentials) | All | URL validation |
| `DAILYMOTION_OAUTH_TOKEN_URL_V1` | Root app | Optional | Configuration | Dailymotion V1 OAuth token exchange endpoint | `https://partner.api.dailymotion.com/oauth/v1/token` | URL (`https://...`) | Dailymotion | V1 partner token minting | All | URL validation |
| `PRIVATE_DAILYMOTION_API_KEY_V1` | Root app | Optional | Secret | Client key for Dailymotion V1 Partner API | None | String (alphanumeric) | Dailymotion Studio | Partner V1 queries | All | Sanitized pair check |
| `PRIVATE_DAILYMOTION_API_KEY_SECRET_V1` | Root app | Optional | Secret | Client secret for Dailymotion V1 Partner API | None | Secret string | Dailymotion Studio | Partner V1 authentication | All | Sanitized pair check |
| `DAILYMOTION_API_SCOPE_V1` | Root app | Optional | Configuration | OAuth scope for V1 partner token | `userinfo` | Space-delimited string | Dailymotion | Scope request for V1 token | All | Non-empty string |
| `DAILYMOTION_API_BASE_URL_V2` | Root app | Required | Configuration | Dailymotion REST API v2 base endpoint | `https://api.dailymotion.com/v2` | URL (`https://...`) | Dailymotion | V2 profiles, video catalog inspection | All | URL validation |
| `DAILYMOTION_OAUTH_TOKEN_URL_V2` | Root app | Required | Configuration | Dailymotion V2 OAuth2 token endpoint | `https://oauth2.dailymotion.com/v2/token` | URL (`https://...`) | Dailymotion | V2 client_credentials token minting | All | URL validation |
| `PRIVATE_DAILYMOTION_API_KEY_V2` | Root app | Optional | Secret | Client key for Dailymotion V2 API | None | String (alphanumeric) | Dailymotion Studio | Authenticated V2 discovery | All | Pair check |
| `PRIVATE_DAILYMOTION_API_KEY_SECRET_V2` | Root app | Optional | Secret | Client secret for Dailymotion V2 API | None | Secret string | Dailymotion Studio | Authenticated V2 discovery | All | Pair check |
| `DAILYMOTION_API_SCOPE_V2` | Root app | Optional | Configuration | OAuth scope for V2 token | `bundle.public` | Dot-notation string | Dailymotion | Scope request for V2 token | All | Non-empty string |
| `DAILYMOTION_FAMILY_FILTER` | Root app | Optional | Configuration | Tri-state global safety filter flag | `true` | Boolean string (`true`/`false`) | Local configuration | Video safety & explicit content filtering | All | Tri-state parser |
| `DAILYMOTION_LOCALIZATION` | Root app | Optional | Configuration | V1 localization code or automatic detect | `detect` | String (`detect` or ISO code) | Dailymotion | Country-specific discovery weighting | All | String check |
| `TOKEN_CACHE_ENCRYPTION_KEY` | Root app | Optional | Secret | AES-256-GCM hex key for database token cache | None | 64-char hexadecimal string | Local secret generation | Secure storage in `ApiVersionTokenCache` | Staging / Prod | Hex length & crypto validation |
| `TOKEN_CACHE_SAFETY_MARGIN_SECONDS` | Root app | Optional | Configuration | Early refresh window before token expiry | `60` | Integer (0 to 3600 seconds) | Local configuration | Proactive OAuth token refresh | All | Integer bounds |
| `ADMIN_DEFAULT_USERNAME` | Root app | Optional | Configuration | Default administrator username fallback | `asdy` | String | Local configuration | Admin login username mapping | All | Non-empty string |
| `ADMIN_EMAIL` | Root app | Optional | Configuration | Canonical admin identity email override | `asdy@dailymotion.discov.com` | Email address | Local configuration | Resolves `asdy` to Supabase Auth user | All | Valid email |
| `ADMIN_INITIAL_PASSWORD` | Root app | Optional | Secret | Local development admin password fallback | None | Secret string | Local configuration | Admin authentication in offline/test mode | Dev / Test | Length >= 8 |
| `ADMIN_SESSION_SECRET` | Root app | Required | Secret | HMAC secret for admin session cookie signing | None | High-entropy string (>= 32 chars) | Local secret generation | Signs `dm_admin_session` cookie | All | Length check >= 32 |
| `ADMIN_SESSION_TTL_SECONDS` | Root app | Optional | Configuration | Lifetime of admin session cookie | `604800` (7 days) | Integer (seconds) | Local configuration | Admin session duration | All | Positive integer |
| `CLOUDFLARE_R2_WORKER_URL` | Root app | Required | Configuration | Public URL of the dedicated R2 Worker | None | URL (`https://...workers.dev`) | Cloudflare Workers | Server proxy to R2 Worker endpoints | All | URL validation |
| `CLOUDFLARE_R2_WORKER_HMAC_SECRET` | Root app | Required | Secret | Shared HMAC secret matching Worker auth | None | 64-char hexadecimal string | Cloudflare / Local secret | Generates HS256 capability tokens | All | 64-char hex validation |
| `CLOUDFLARE_R2_BUCKET_NAME` | Root app | Optional | Configuration | Bound Cloudflare R2 bucket name | `dailymotion-discovery-private` | String (R2 bucket identifier) | Cloudflare R2 | R2 bucket target validation | All | Bucket name format |
| `STORAGE_OWNER_UUID` | Root app | Optional | Configuration | Canonical tenant namespace partition | `admin` | String / UUID | Local configuration | Scopes storage paths in R2 | All | Path-safe string |
| `AI_MANIFEST_MAX_ITEMS` | Root app | Optional | Configuration | Maximum items included in AI manifest prompt | `25` | Positive integer (1-100) | Local configuration | Prevents AI prompt context overflows | All | Integer bounds |
| `AI_MANIFEST_MAX_CHARS` | Root app | Optional | Configuration | Maximum character length of AI manifest context | `9000` | Positive integer (1000-50000) | Local configuration | Enforces strict Gemini context budgets | All | Integer bounds |
| `ENABLE_MANIFEST_PERSISTENCE` | Root app | Optional | Configuration | Enables database persistence of deep manifests | `true` | Boolean string (`true`/`false`) | Local configuration | Channel Explorer deep fetch persistence | All | Enum check |
| `MAX_CHANNEL_FETCH_PAGES` | Root app | Optional | Configuration | Max pages per channel fetch job | `200` | Positive integer | Local configuration | Safety cap on deep fetch crawl | All | Positive integer |
| `MAX_CHANNEL_FETCH_ITEMS` | Root app | Optional | Configuration | Max video metadata items collected per job | `100000` | Positive integer | Local configuration | Prevents unbounded memory growth | All | Positive integer |
| `MAX_CHANNEL_FETCH_WINDOWS` | Root app | Optional | Configuration | Max search windows generated during deep fetch | `3000` | Positive integer | Local configuration | Deep fetch windowing algorithm ceiling | All | Positive integer |
| `MAX_CHANNEL_FETCH_WINDOW_DEPTH` | Root app | Optional | Configuration | Maximum recursion depth for adaptive windows | `5` | Positive integer | Local configuration | Deep fetch recursion guard | All | Positive integer |
| `MAX_CHANNEL_FETCH_TOTAL_PAGES` | Root app | Optional | Configuration | Total page attempts allowed across entire job | `5000` | Positive integer | Local configuration | Hard execution cap | All | Positive integer |
| `MAX_CHANNEL_FETCH_PAGE_SIZE` | Root app | Optional | Configuration | Page size requested from Dailymotion API | `100` | Positive integer (max 100) | Dailymotion | Dailymotion API page limit | All | Integer <= 100 |
| `CHANNEL_FETCH_DELAY_MS` | Root app | Optional | Configuration | Inter-page request throttling delay | `250` | Integer (milliseconds) | Local configuration | Rate-limit avoidance | All | Non-negative integer |
| `CHANNEL_FETCH_MIN_DELAY_MS` | Root app | Optional | Configuration | Minimum throttle delay under adaptive backoff | `100` | Integer (milliseconds) | Local configuration | Floor for request delay | All | Non-negative integer |
| `CHANNEL_FETCH_CONCURRENCY` | Root app | Optional | Configuration | Default parallel fetch workers | `3` | Positive integer (1-5) | Local configuration | Concurrency management | All | Integer 1-5 |
| `CHANNEL_FETCH_MAX_CONCURRENCY` | Root app | Optional | Configuration | Maximum allowed concurrency | `5` | Positive integer (1-5) | Local configuration | Concurrency ceiling | All | Integer 1-5 |
| `CHANNEL_FETCH_DEFAULT_PROFILE` | Root app | Optional | Configuration | Default crawling strategy profile | `deep-balanced` | Enum (`deep-balanced`, etc.) | Local configuration | Crawler tuning | All | Valid enum value |
| `CHANNEL_FETCH_JOB_TTL_HOURS` | Root app | Optional | Configuration | Retention period for completed fetch jobs | `72` | Positive integer (hours) | Local configuration | Data retention cleanup | All | Positive integer |
| `TEMP_MANIFEST_TTL_HOURS` | Root app | Optional | Configuration | Retention period for temporary manifests | `72` | Positive integer (hours) | Local configuration | Ephemeral manifest cleanup | All | Positive integer |
| `WORKER_AUTH_SECRET` | Worker | Required | Secret | HMAC-SHA256 secret for capability tokens | None | 64-char hexadecimal string | Cloudflare Secrets / `.prod.vars` | Authenticates incoming Worker requests | Worker | Must match Next.js secret |
| `ALLOWED_ORIGINS` | Worker | Required | Configuration | Comma-delimited list of allowed CORS origins | None | String (URLs) | Cloudflare / `.prod.vars` | CORS headers on Worker responses | Worker | Comma-delimited URLs |
| `DM_BUCKET` | Worker | Required | Binding | Cloudflare R2 bucket binding | None | R2 Bucket Binding | Cloudflare R2 | Direct Worker access to R2 bucket | Worker | Configured in `wrangler.jsonc` |

---

## 2. Deprecated and Retired Variables

The following variables have been removed or retired to maintain security and eliminate stale architectural debt:

| Variable Name | Former Purpose | Status | Replacement / Resolution |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy privileged database/auth access | **Retired** | Replaced with `SUPABASE_SECRET_KEY` for server-side Storage and Supabase Auth SSR. Privileged service role keys are never stored in code. |
| `CRON_SECRET` | Legacy cron trigger authorization | **Retired** | No active cron endpoints require this variable. |
| `WEBHOOK_SECRET` | Legacy webhook verification | **Retired** | Webhooks are not used in current metadata discovery platform. |
| `AI_EMBEDDING_MODEL` | Legacy vector embedding model configuration | **Retired** | Discovery uses FlexSearch in-memory search and direct grounded Gemini Flash queries. |
| `ENABLE_PGVECTOR` | Legacy vector database extension toggle | **Retired** | Platform uses Prisma ORM 7 with native SQL queries and FlexSearch. |
| `DATABASE_URL_CONNECTION_STRING` | Legacy alternate name for database connection | **Retired** | Canonical variable is `DATABASE_URL`. |
| `DATABASE_URL_DIRECT` | Legacy direct database URL | **Retired** | Canonical variable is `DATABASE_URL` pointing to Supabase Session Pooler. |
| `DIRECT_URL` | Legacy direct connection variable | **Retired** | Canonical variable is `DATABASE_URL`. |
| `DAILYMOTION_API_BASE_URL` | Unversioned Dailymotion endpoint | **Deprecated Alias** | Replaced by `DAILYMOTION_API_BASE_URL_V1` and `DAILYMOTION_API_BASE_URL_V2`. Kept as V1 fallback only. |
| `DAILYMOTION_API_KEY` | Unversioned Dailymotion API key | **Deprecated Alias** | Replaced by `PRIVATE_DAILYMOTION_API_KEY_V1` / `PRIVATE_DAILYMOTION_API_KEY_V2`. |

---

## 3. Git Protection & Security Verification

All production and development variable files containing real secrets are strictly excluded from source control:
- `.env` — Ignored by `.gitignore`.
- `.dev.vars` — Ignored by `.gitignore`.
- `.prod.vars` — Ignored by `.gitignore`.
- `*.vars` — Ignored by `.gitignore`.
- Example files (`.env.example`, `cloudflare/workers/dailymotion-discovery-api/.dev.vars.example`, `cloudflare/workers/dailymotion-discovery-api/.prod.vars.example`) contain only sanitized placeholders and are tracked in git.
