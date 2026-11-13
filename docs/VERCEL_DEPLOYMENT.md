# Vercel Deployment & Remote Build Policy — Dailymotion Discovery (2026)

This document provides guidelines and configuration instructions for deploying **Dailymotion Discovery** on Vercel.

---

## 1. Remote Build Architecture Policy (Zero Local Production Builds)

Due to local machine memory and CPU constraints, local compilation commands are strictly prohibited in local automated pipelines:

- Prohibited locally: `npm run build`, `next build`, `vercel build`, `vercel deploy --prebuilt`.
- Production build compilation occurs exclusively on **Vercel's remote infrastructure**.

### Deployment Workflow:

```text
Local Machine
  │
  ├── 1. Edit code & run lightweight validation (Vitest, tsc --noEmit, prisma validate)
  ├── 2. Commit changes (excluding .env, .dev.vars, .prod.vars)
  └── 3. Push to GitHub main: git push origin main
          │
          ▼
GitHub (https://github.com/alahly13/dailymotion-discovery)
          │
          ▼ Webhook Trigger
Vercel Remote Build Infrastructure
  │
  ├── 1. Pull latest commit from main branch
  ├── 2. Inject Production Environment Variables from Vercel Project Settings
  ├── 3. Execute `npm run build` remotely (Validates env, generates Prisma client, compiles Next.js 16 App Router)
  ├── 4. Deploy to Vercel Global Edge Network
  └── 5. Live Application Ready
```

---

## 2. Environment Variables in Vercel Project Settings

Configure these variables in the **Vercel Dashboard > Project Settings > Environment Variables** (Production & Preview):

| Variable Name | Required | Example / Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase Session Pooler connection string (`postgresql://postgres.xxx:[PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `https://uuhyelghiwiotcjvidmg.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | `sb_pub_...` |
| `SUPABASE_SECRET_KEY` | Optional | `sb_secret_...` |
| `NEXT_PUBLIC_APP_URL` | Yes | `https://dailymotion-discovery.vercel.app` (or custom domain) |
| `ADMIN_DEFAULT_USERNAME` | Yes | `asdy` |
| `ADMIN_EMAIL` | Yes | `asdy@dailymotion.discov.com` |
| `ADMIN_INITIAL_PASSWORD` | Yes | Secure password (used by Supabase Auth / fallback) |
| `ADMIN_SESSION_SECRET` | Yes | 64-char hexadecimal string for session HMAC signing |
| `ADMIN_SESSION_TTL_SECONDS` | Yes | `604800` (7 days) |
| `CLOUDFLARE_R2_WORKER_URL` | Yes | `https://dailymotion-discovery-api.elmahdyabdulla209.workers.dev` |
| `CLOUDFLARE_R2_WORKER_HMAC_SECRET` | Yes | Must match `WORKER_AUTH_SECRET` in `.prod.vars` |
| `CLOUDFLARE_R2_BUCKET_NAME` | Yes | `dailymotion-discovery-private` |
| `STORAGE_OWNER_UUID` | Yes | `admin` |
| `GEMINI_API_KEY` | Yes | Google Gemini API key (for AI Search) |
| `GEMINI_MODEL` | Optional | `gemini-2.5-flash` |
| `DAILYMOTION_API_BASE_URL_V1` | Optional | `https://api.dailymotion.com/` |
| `DAILYMOTION_API_BASE_URL_V2` | Optional | `https://api.dailymotion.com/v2` |
| `PRIVATE_DAILYMOTION_API_KEY_V1` | Optional | Dailymotion V1 API Key |
| `PRIVATE_DAILYMOTION_API_KEY_SECRET_V1` | Optional | Dailymotion V1 API Secret |
| `PRIVATE_DAILYMOTION_API_KEY_V2` | Optional | Dailymotion V2 API Key |
| `PRIVATE_DAILYMOTION_API_KEY_SECRET_V2` | Optional | Dailymotion V2 API Secret |

---

## 3. Remote Build Inspection via Vercel CLI

To inspect deployment logs and status without building locally:

```powershell
# List latest deployments:
npx vercel ls

# Inspect specific deployment logs:
npx vercel inspect <deployment-url>
```
