# Storage Architecture — Dailymotion Discovery (2026)

This document describes the cloud storage architecture for **Dailymotion Discovery**, featuring a **Dedicated Cloudflare Worker** (`dailymotion-discovery-api`) mediating private **Cloudflare R2** storage (`dailymotion-discovery-private`).

---

## 1. Storage Topology & Security Model

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
|             Binding: R2_BUCKET (Native R2 Binding)        |
+-----------------------------------------------------------+
                             |
                   Native R2 Binding
         (Zero AWS SDKs, Zero S3 credentials, Zero public URLs)
                             |
                             v
+-----------------------------------------------------------+
|              Cloudflare R2 Private Bucket                 |
|             Bucket: dailymotion-discovery-private         |
|             Paths: dailymotion/persistence/{owner}/...    |
+-----------------------------------------------------------+
```

### Security & Integrity Invariants
1. **Zero Public Bucket Access**: Bucket `dailymotion-discovery-private` is 100% private.
2. **Ephemeral HMAC Capability Tokens**: Web Crypto HS256 JWT token signed by Next.js using `CLOUDFLARE_R2_WORKER_HMAC_SECRET` (matching `WORKER_AUTH_SECRET`). Max lifetime: 5 minutes.
3. **Collision Guard on Immutable Parts**: Generation chunk files (`.../parts/part-*.json`) reject overwrite with `409 Conflict` via `{ onlyIf: { etagDoesNotMatch: "*" } }`.
4. **Path Sanitization**: Rejects dot segments (`..`), backslashes, double slashes, and control characters.
5. **Strict Sizing & Payload Limits**: Maximum single object: 45 MiB; Maximum batch: 200 MiB / 50 items. Content-Type must be `application/json`.

---

## 2. Canonical Storage Path Hierarchy

Managed in `src/lib/storage/dailymotion-canonical-paths.ts`:

```text
dailymotion/persistence/{ownerId}/
├── saved-items/
│   ├── version.json
│   └── generations/{generationId}/
│       ├── manifest.json
│       └── parts/
│           ├── part-000001.json
│           └── ...
├── collections/
│   ├── version.json
│   └── generations/{generationId}/...
├── saved-searches/
│   ├── version.json
│   └── generations/{generationId}/...
├── search-history/
│   ├── version.json
│   └── generations/{generationId}/...
├── discovery/videos/
│   └── manifests/{manifestId}/...
├── discovery/channels/
│   └── manifests/{sourceId}/...
└── legacy-supabase-archive/
    └── {migrationId}/...
```

---

## 3. Two-Phase Save & Verification Protocol

1. **Serialization (`R2ManifestSerializer`)**:
   Dataset records are deterministically split into JSON parts under 45 MiB. Each part's SHA-256 digest is computed.
2. **Batch Upload (`POST /batch/upload`)**:
   Worker uploads parts to R2 with metadata containing `sha256`, `owner`, and `batchId`.
3. **Batch Verification (`POST /batch/verify`)**:
   Worker re-reads uploaded parts and verifies SHA-256 checksums match expected client values.
4. **Manifest Commit**:
   Upon 100% verification, the generation `manifest.json` and `version.json` pointers are atomically committed.
