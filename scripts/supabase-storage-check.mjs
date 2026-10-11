#!/usr/bin/env node
// supabase:storage:check — verify private bucket + self-cleaning probe.
// Uses the single app implementation (no duplicated helper). Creates NOTHING
// except its own uniquely-named probe object, which it deletes. Sanitized.

import { loadProjectEnv } from "./load-project-env.mjs";

loadProjectEnv();

const { checkStorage } = await import("../src/lib/persistence/storage-documents/documents.ts");

const result = await checkStorage();
console.log(JSON.stringify(result, null, 2));
if (result.error || !result.bucketExists || result.bucketPrivate === false || result.probeUpload === false || result.probeReadBack === false || result.probeCleanup === false) {
  console.error("[ERROR] Storage verification did not fully pass. See `error` above (sanitized).");
  process.exit(1);
}
console.log("[OK] Private bucket verified: exists, private, probe upload/read/delete passed.");
