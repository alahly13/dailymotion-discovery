# Manifest Format & Integrity Specification — Dailymotion Discovery (2026)

This document specifies the canonical JSON manifest schema and cryptographic integrity verification standards for **Dailymotion Discovery**.

---

## 1. Canonical Manifest Schema (`dailymotion-manifest-v1`)

Defined and validated with Zod in `src/lib/storage/canonical-manifest-schema.ts`:

```json
{
  "$schema": "https://dailymotion.discovery/schemas/manifest-v1.json",
  "formatVersion": "dailymotion-manifest-v1",
  "datasetSlug": "saved-items",
  "ownerId": "admin",
  "generationId": "gen-1731518400000-a1b2c3d4",
  "createdAt": "2026-11-13T18:00:00.000Z",
  "totalRecords": 150,
  "totalBytes": 452810,
  "aggregateSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "parts": [
    {
      "partNumber": 1,
      "key": "dailymotion/persistence/admin/saved-items/generations/gen-1731518400000-a1b2c3d4/parts/part-000001.json",
      "recordCount": 150,
      "byteCount": 452810,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ],
  "metadata": {
    "platform": "dailymotion",
    "generator": "dailymotion-discovery-web",
    "apiVersion": "v1+v2"
  }
}
```

---

## 2. Cryptographic Integrity Rules

1. **SHA-256 Per Part**:
   Every part object is hashed with Web Crypto `crypto.subtle.digest("SHA-256", ...)`. The resulting hexadecimal string is stored in `StorageManifestPart.sha256`.
2. **Aggregate SHA-256**:
   The `aggregateSha256` digest is calculated over the concatenated sorted part digests:
   ```typescript
   const combined = parts.map((p) => p.sha256.toLowerCase()).join(":");
   const aggregate = sha256(combined);
   ```
3. **Immutability Invariant**:
   Once a generation manifest is finalized, its parts are immutable. Overwriting any part requires creating a new `generationId`.
