// storage-documents setup helper: idempotent private bucket creation.
// Creates `application-data` ONLY when missing. Never alters an existing
// bucket's visibility, policies, or contents. Sanitized output.

import { getStorageServerClient } from "@/lib/supabase/storage-server";
import { STORAGE_BUCKET } from "@/lib/persistence/storage-documents/paths";

export interface StorageSetupResult {
  created: boolean;
  existed: boolean;
  private: boolean | null;
  error: string | null;
}

export async function setupStorageBucket(): Promise<StorageSetupResult> {
  let client;
  try {
    client = getStorageServerClient();
  } catch (error) {
    return { created: false, existed: false, private: null, error: error instanceof Error ? error.message : "Storage unavailable." };
  }
  try {
    const { data: buckets, error: listError } = await client.storage.listBuckets();
    if (listError) return { created: false, existed: false, private: null, error: `Bucket listing failed (${listError.message}).` };
    const found = (buckets ?? []).find((b) => b.name === STORAGE_BUCKET) ?? null;
    if (found) {
      return { created: false, existed: true, private: found.public === false, error: found.public === false ? null : `Bucket "${STORAGE_BUCKET}" exists but is not private — review manually; visibility was NOT changed.` };
    }
    const { error: createError } = await client.storage.createBucket(STORAGE_BUCKET, { public: false });
    if (createError) return { created: false, existed: false, private: null, error: `Bucket creation failed (${createError.message}).` };
    return { created: true, existed: false, private: true, error: null };
  } catch (error) {
    return { created: false, existed: false, private: null, error: error instanceof Error ? error.message : "Storage setup failed." };
  }
}
