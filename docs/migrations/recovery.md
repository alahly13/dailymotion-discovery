# Recovery guide

## Interrupted batch save

- Same `idempotencyKey` retry replays the recorded result — never duplicates.
- DB failed after Storage upload: the staged snapshot is unreferenced but
  intact; retry with the SAME key. It is adopted or superseded, never
  double-counted.
- Client timeout after successful commit: next retry returns the recorded
  result (`replayed: true`).
- `batch_commits` row with `status=failed` + `errorJson` explains what broke.

## Interrupted data migration

- Rerun resumes from `lastCheckpoint`; completed prefixes are skipped.
- Verify counts before marking complete; failed runs keep sanitized errors.

## Staged Storage orphans

- Objects under `users/admin/**` not referenced by `storage_documents` or
  history rows are safe to leave; remove only via explicit, approved cleanup
  after verifying no DB pointer exists.

## Schema migration problems

- Never edit applied migrations or `_prisma_migrations` by hand.
- Pending migration with bad SQL: fix with a NEW migration (or, if never
  applied anywhere, regenerate it — document why).
- Failed apply: `npm run db:status` shows failed state; repair via Prisma's
  documented resolve flow (`prisma migrate resolve`), not manual table edits.

## Secret rotation

- `TOKEN_CACHE_ENCRYPTION_KEY` change → old token rows fail decrypt → cache
  misses → tokens reacquired automatically. No data migration needed.
- Supabase secret rotation: update `SUPABASE_SECRET_KEY` locally + Vercel,
  redeploy; no code change.
