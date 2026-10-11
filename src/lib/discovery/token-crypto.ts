// AES-256-GCM token encryption for the durable token cache.
//
// What this controls: encryption of access tokens persisted in Postgres.
// Why it exists: raw tokens must never rest in plaintext. Key material comes
// only from server env TOKEN_CACHE_ENCRYPTION_KEY (derived via SHA-256 to a
// 32-byte key; the env value itself is never stored). Random 12-byte IV per
// row; auth tag verified on decrypt — tampered rows fail closed as misses.
// Rotation: change the key → old rows fail decrypt → treated as misses →
// tokens reacquired automatically. No data loss, no manual migration.
// Scope: server-only (token-cache-store). Never import into client code.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(): Buffer | null {
  const raw = (process.env.TOKEN_CACHE_ENCRYPTION_KEY ?? "").trim();
  if (!raw) return null;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function isTokenEncryptionConfigured(): boolean {
  return encryptionKey() !== null;
}

export interface SealedToken {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function sealToken(token: string): SealedToken | null {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { iv: iv.toString("hex"), authTag: cipher.getAuthTag().toString("hex"), ciphertext: ciphertext.toString("hex") };
}

export function unsealToken(sealed: SealedToken): string | null {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "hex"));
    decipher.setAuthTag(Buffer.from(sealed.authTag, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "hex")), decipher.final()]).toString("utf8");
  } catch {
    return null; // wrong key / tampered row → miss, never throw
  }
}
