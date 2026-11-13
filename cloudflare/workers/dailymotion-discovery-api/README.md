# Dailymotion Discovery — Dedicated Cloudflare R2 Worker (`dailymotion-discovery-api`)

Dedicated Cloudflare Worker mediating private Cloudflare R2 storage (`dailymotion-discovery-private`) for Dailymotion Discovery 2026.

## Architecture & Security Invariants

- **Dedicated Worker:** `dailymotion-discovery-api` (isolated from other discovery platforms).
- **Private Authoritative R2 Bucket:** `R2_BUCKET -> dailymotion-discovery-private`.
- **HMAC Capability Token Security:** Every data request requires an ephemeral Web Crypto HS256 JWT signed with `WORKER_AUTH_SECRET` (`iss: "dailymotion-discovery-web"`, `aud: "dailymotion-discovery-api"`).
- **Secret Separation:** Secrets (`WORKER_AUTH_SECRET`) are loaded securely via `.prod.vars` using `--secrets-file .prod.vars`.
- **Allowed Origins:** `ALLOWED_ORIGINS` restricts CORS access.
- **Collision Guard:** Immutable dataset manifest parts enforce `409 Conflict` on attempted overwrite.
- **Path Traversal Protection:** Disallows dot-segments (`..`), backslashes, double slashes, and control characters.

## Deployment Instructions

```bash
cd cloudflare/workers/dailymotion-discovery-api

# 1. Provision private R2 bucket (if not already provisioned):
npx wrangler r2 bucket create dailymotion-discovery-private

# 2. Deploy Worker with secrets file (.prod.vars):
npx wrangler deploy --secrets-file .prod.vars
```

Ensure `CLOUDFLARE_R2_WORKER_URL` and matching `CLOUDFLARE_R2_WORKER_HMAC_SECRET` are configured in Next.js root `.env`.
