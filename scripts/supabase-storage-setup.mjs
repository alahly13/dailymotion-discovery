#!/usr/bin/env node
// supabase:storage:setup — idempotent creation of the private bucket.
// Creates `application-data` (private) ONLY when missing. Never alters an
// existing bucket. Sanitized output; run only when authorized.

import { loadProjectEnv } from "./load-project-env.mjs";

loadProjectEnv();

const { setupStorageBucket } = await import("../src/lib/persistence/storage-documents/setup.ts");

const result = await setupStorageBucket();
console.log(JSON.stringify(result, null, 2));
if (result.error || result.private === false) {
  console.error("[ERROR] Storage setup did not complete cleanly. See above (sanitized).");
  process.exit(1);
}
console.log("[OK] Private bucket ready (created or already present).");
