# Cloudflare Worker & R2 Storage Deployment Guide — Dailymotion Discovery (2026)

This document provides the authoritative, step-by-step production deployment guide for the **Dailymotion Discovery Cloudflare Worker** (`dailymotion-discovery-api`) and its dedicated **Cloudflare R2 Bucket** (`dailymotion-discovery-private`).

---

## 1. Architecture & Security Model

```
+-----------------------------------------------------------+
|               Next.js Web Application                    |
|             (E:\discovery\dailymotion-discovery)          |
+-----------------------------------------------------------+
                             |
         HTTPS + Ephemeral Web Crypto HS256 JWT Token
       (Claims: iss="dailymotion-discovery-web", aud="dailymotion-discovery-api",
         sub="admin", storage_owner_uuid, operation, key, max_bytes, exp: 5m)
                             |
                             v
+-----------------------------------------------------------+
|              Cloudflare Worker (Dedicated)                |
|             Worker Name: dailymotion-discovery-api        |
|             Binding: DM_BUCKET (Native R2 Binding)        |
+-----------------------------------------------------------+
                             |
                  Native Native R2 Binding
        (Zero AWS SDKs, Zero S3 credentials, Zero public URLs)
                             |
                             v
+-----------------------------------------------------------+
|              Cloudflare R2 Private Bucket                 |
|             Bucket: dailymotion-discovery-private         |
|             Paths: dailymotion/persistence/{owner}/...    |
+-----------------------------------------------------------+
```

### Key Security Invariants
1. **Zero Public Bucket Access**: The bucket `dailymotion-discovery-private` is 100% private. No public R2.dev domain or read URLs are ever enabled.
2. **Ephemeral Capability Tokens**: Every read/write/delete/list operation requires an HS256 capability JWT token signed by Next.js using `WORKER_AUTH_SECRET` (matching `CLOUDFLARE_R2_WORKER_HMAC_SECRET`).
3. **Collision Guard**: Immutable generation parts (`.../parts/part-*.json`) enforce `409 Conflict` on attempted overwrite via `{ onlyIf: { etagDoesNotMatch: "*" } }`.
4. **Path Sanitization**: Key traversal (`..`, `\`, `//`, null bytes, control characters) is rejected with `400 Bad Request`.
5. **Strict JSON Payloads**: Enforces `application/json; charset=utf-8` and a 45 MiB per-object / 200 MiB per-batch ceiling.

---

## 2. Environment Variables & Secret Separation

Secrets are managed via dedicated `.vars` files and **NEVER** committed to version control.

| Environment | Secret File Location | Sensitive Variables | Purpose |
|---|---|---|---|
| **Production Worker** | `cloudflare/workers/dailymotion-discovery-api/.prod.vars` | `WORKER_AUTH_SECRET`, `ALLOWED_ORIGINS` | Injected into Cloudflare Worker during `wrangler deploy --secrets-file` |
| **Local Dev Worker** | `cloudflare/workers/dailymotion-discovery-api/.dev.vars` | `WORKER_AUTH_SECRET`, `ALLOWED_ORIGINS` | Loaded locally during `wrangler dev` |
| **Next.js Web App** | `.env` | `CLOUDFLARE_R2_WORKER_HMAC_SECRET`, `CLOUDFLARE_R2_WORKER_URL` | Used by server-side `R2WorkerClient` to generate capability tokens |

> [!IMPORTANT]
> `WORKER_AUTH_SECRET` in `.prod.vars` **MUST EXACTLY MATCH** `CLOUDFLARE_R2_WORKER_HMAC_SECRET` in `.env`.
> The validation script `npm run env:validate:all` automatically verifies this alignment.

---

## 3. Step-by-Step Deployment Instructions (Windows PowerShell)

Run these commands from PowerShell inside the repository root (`E:\discovery\dailymotion-discovery`):

### Step 1: Navigate to the Worker Directory
```powershell
cd E:\discovery\dailymotion-discovery\cloudflare\workers\dailymotion-discovery-api
```

### Step 2: Authenticate with Cloudflare (First Time Only)
```powershell
# Authenticate using Cloudflare CLI interactive OAuth login:
npx wrangler login

# Verify your active Cloudflare identity and account:
npx wrangler whoami
```

### Step 3: Provision the Private R2 Bucket (Idempotent)
```powershell
# Create the private bucket if it has not been created yet:
npx wrangler r2 bucket create dailymotion-discovery-private

# Verify the bucket is provisioned:
npx wrangler r2 bucket list
```

### Step 4: Perform a Dry-Run Deployment (Verification)
```powershell
npx wrangler deploy --dry-run
```

### Step 5: Deploy the Worker with Production Secrets
```powershell
# Deploy the worker bundle and automatically inject secrets from .prod.vars:
npx wrangler deploy --secrets-file .prod.vars
```

---

## 4. Live Verification & Health Check

### Health Check Endpoint
The worker provides a public, zero-credential `/health` endpoint for monitoring and uptime probes:

```powershell
# Inspect the live deployed health status:
Invoke-RestMethod -Uri "https://dailymotion-discovery-api.elmahdyabdulla209.workers.dev/health" -Method Get | ConvertTo-Json
```

### Expected Output Format:
```json
{
  "ok": true,
  "worker": "dailymotion-discovery-api",
  "bucket": "dailymotion-discovery-private",
  "binding_configured": true,
  "secret_configured": true,
  "timestamp": "2026-11-12T23:15:00.000Z"
}
```

### Integration Test Verification
Run the automated end-to-end test suite to verify token generation, batch upload, sha256 checksum verification, and read-back:

```powershell
cd E:\discovery\dailymotion-discovery
npm test -- src/lib/storage/__tests__/r2-storage.test.ts
```

---

## 5. Troubleshooting & Common Operational Errors

### Issue: `Unexpected token 'H', "Hello World!" is not valid JSON`
- **Cause**: The Cloudflare Worker was created with default template code and has not been updated with `src/index.ts`.
- **Fix**: Run `npx wrangler deploy --secrets-file .prod.vars` from `cloudflare/workers/dailymotion-discovery-api`.

### Issue: `401 Unauthorized: Invalid capability token signature`
- **Cause**: `CLOUDFLARE_R2_WORKER_HMAC_SECRET` in Next.js `.env` does not match `WORKER_AUTH_SECRET` in `.prod.vars`.
- **Fix**: Run `npm run env:validate:all` to detect secret mismatch, synchronize the values, and redeploy with `--secrets-file .prod.vars`.

### Issue: `500 DM_BUCKET R2 binding not configured`
- **Cause**: The bucket `dailymotion-discovery-private` was not bound or `wrangler.jsonc` was modified.
- **Fix**: Verify `wrangler.jsonc` has:
  ```jsonc
  "r2_buckets": [
    {
      "binding": "DM_BUCKET",
      "bucket_name": "dailymotion-discovery-private",
      "remote": true
    }
  ]
  ```

### Issue: `409 Conflict: immutable object already exists`
- **Cause**: An immutable generation part (`.../parts/part-000001.json`) is being overwritten with differing data.
- **Fix**: This is an intentional safety invariant. Generate a new `generation_id` using `generateGenerationId()` or `Date.now()`.
