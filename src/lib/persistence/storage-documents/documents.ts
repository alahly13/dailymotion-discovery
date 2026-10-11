// Storage document operations (server-only Supabase SDK).
//
// What this controls: upload/download/verify/remove of private JSON objects.
// Rules: bucket `application-data` must be private; uploads are immutable
// versioned objects (never overwrite a published revision in place — write a
// new revision path); downloads resolve known paths from the DB registry;
// verification compares SHA-256 before data is trusted. Failures throw
// sanitized errors (no secrets, no user data in messages).
// Scope: batch orchestrator, sync routes, storage scripts. Never browser.

import { getStorageServerClient } from "@/lib/supabase/storage-server";
import {
  STORAGE_BUCKET,
  verifyEnvelope,
  type StorageEnvelope,
} from "./paths";

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

function bucket() {
  return getStorageServerClient().storage.from(STORAGE_BUCKET);
}

export interface UploadResult {
  path: string;
  checksum: string;
  byteSize: number;
}

/** Upload a JSON envelope as an immutable object; verifies read-back. */
export async function uploadDocument(path: string, json: string, checksum: string): Promise<UploadResult> {
  const bytes = Buffer.byteLength(json, "utf8");
  let uploadError: string | null = null;
  try {
    const { error } = await bucket().upload(path, json, { contentType: "application/json", upsert: false });
    if (error) uploadError = error.message;
  } catch (error) {
    uploadError = error instanceof Error ? error.message : "upload failed";
  }
  if (uploadError) throw new StorageUnavailableError(`Storage upload failed for known path (${uploadError}).`);
  // Read-back verification before the object is treated as authoritative.
  const downloaded = await downloadDocumentText(path);
  if (downloaded === null) throw new StorageUnavailableError("Storage upload verification failed (read-back missed).");
  return { path, checksum, byteSize: bytes };
}

export async function downloadDocumentText(path: string): Promise<string | null> {
  try {
    const { data, error } = await bucket().download(path);
    if (error || !data) return null;
    return await data.text();
  } catch {
    return null;
  }
}

/** Download + checksum-verify a typed envelope; null on any mismatch. */
export async function downloadEnvelope<T>(path: string): Promise<StorageEnvelope<T> | null> {
  const text = await downloadDocumentText(path);
  if (!text) return null;
  try {
    const envelope = JSON.parse(text) as StorageEnvelope<T>;
    return verifyEnvelope(envelope) ? envelope : null;
  } catch {
    return null;
  }
}

/** Remove ONLY an explicitly passed object path (cleanup flows). */
export async function removeDocument(path: string): Promise<boolean> {
  try {
    const { error } = await bucket().remove([path]);
    return !error;
  } catch {
    return false;
  }
}

export interface StorageCheckResult {
  urlConfigured: boolean;
  secretConfigured: boolean;
  bucketExists: boolean | null;
  bucketPrivate: boolean | null;
  probeUpload: boolean | null;
  probeReadBack: boolean | null;
  probeCleanup: boolean | null;
  error: string | null;
}

/**
 * Combined Storage verification: config → bucket → self-cleaning probe.
 * The probe uses a unique `__probe__/` path and deletes only that object.
 * Never logs secrets or user data.
 */
export async function checkStorage(): Promise<StorageCheckResult> {
  const base: StorageCheckResult = {
    urlConfigured: false,
    secretConfigured: false,
    bucketExists: null,
    bucketPrivate: null,
    probeUpload: null,
    probeReadBack: null,
    probeCleanup: null,
    error: null,
  };
  let client;
  try {
    const { storageConfigStatus } = await import("@/lib/supabase/storage-server");
    const facts = storageConfigStatus();
    base.urlConfigured = facts.urlConfigured;
    base.secretConfigured = facts.secretConfigured;
    client = getStorageServerClient();
  } catch (error) {
    base.error = error instanceof Error ? error.message : "Storage client unavailable.";
    return base;
  }
  try {
    const { data: buckets, error } = await client.storage.listBuckets();
    if (error) throw new Error(`Bucket listing failed (${error.message}).`);
    const found = (buckets ?? []).find((b) => b.name === STORAGE_BUCKET) ?? null;
    base.bucketExists = found !== null;
    base.bucketPrivate = found ? found.public === false : null;
    if (!found) {
      base.error = `Bucket "${STORAGE_BUCKET}" does not exist. Create it as private (see docs/migrations/README.md).`;
      return base;
    }
    if (found.public !== false) {
      base.error = `Bucket "${STORAGE_BUCKET}" is not private. Review before storing snapshots.`;
      return base;
    }
    const probePath = `users/admin/__probe__/probe-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
    const probeBody = JSON.stringify({ probe: true, at: new Date().toISOString() });
    const { error: upError } = await client.storage.from(STORAGE_BUCKET).upload(probePath, probeBody, { contentType: "application/json", upsert: false });
    base.probeUpload = !upError;
    if (upError) {
      base.error = `Probe upload failed (${upError.message}).`;
      return base;
    }
    const { data, error: dlError } = await client.storage.from(STORAGE_BUCKET).download(probePath);
    const text = !dlError && data ? await data.text().catch(() => null) : null;
    base.probeReadBack = text === probeBody;
    const { error: rmError } = await client.storage.from(STORAGE_BUCKET).remove([probePath]);
    base.probeCleanup = !rmError;
    if (!base.probeReadBack) base.error = "Probe read-back mismatch.";
    else if (rmError) base.error = "Probe object uploaded but cleanup failed — remove it manually.";
    return base;
  } catch (error) {
    base.error = error instanceof Error ? error.message : "Storage check failed.";
    return base;
  }
}
