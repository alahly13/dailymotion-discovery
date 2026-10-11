// Two-tier token persistence: in-memory (fast) + Postgres (cross-instance).
//
// What this controls: durable storage of encrypted per-version OAuth tokens.
// Tier behavior:
// - Memory is always authoritative for speed; durable Postgres extends reuse
//   across serverless instances/restarts when BOTH are true: the
//   `api_version_token_cache` table exists (migration applied) AND
//   TOKEN_CACHE_ENCRYPTION_KEY is configured.
// - Writes happen ONLY on token acquisition — never per search.
// - Any durable failure (no key, no table, no DB, undecryptable row) degrades
//   to memory-only; callers see misses, never exceptions.
// - Namespaces are per-version ("v1" | "v2"); no cross-reads.
// Scope: server-only, used by auth.ts. Never import into client code.

import { getPrismaClient } from "@/lib/prisma/client";
import { isTokenEncryptionConfigured, sealToken, unsealToken } from "./token-crypto";
import type { ApiVersion } from "./types";

export interface DurableToken {
  token: string;
  expiresAt: number;
  scope: string;
  obtainedAt: number;
}

export function durableCacheStatus(): { enabled: boolean; reason: string } {
  if (!isTokenEncryptionConfigured()) {
    return { enabled: false, reason: "Durable token cache disabled: set TOKEN_CACHE_ENCRYPTION_KEY to share tokens across instances (memory-only reuse otherwise)." };
  }
  return { enabled: true, reason: "Durable token cache active (encrypted Postgres row per API version)." };
}

type TokenRow = {
  findUnique: (args: unknown) => Promise<{ encryptedToken: string; iv: string; authTag: string; scope: string; expiresAt: Date; obtainedAt: Date } | null>;
  upsert: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<unknown>;
};

function table(): TokenRow | null {
  try {
    const prisma = getPrismaClient() as unknown as { apiVersionTokenCache?: TokenRow };
    return prisma.apiVersionTokenCache ?? null;
  } catch {
    return null;
  }
}

export async function readDurableToken(version: ApiVersion): Promise<DurableToken | null> {
  const rows = table();
  if (!rows || !isTokenEncryptionConfigured()) return null;
  try {
    const row = await rows.findUnique({ where: { version } });
    if (!row) return null;
    const token = unsealToken({ iv: row.iv, authTag: row.authTag, ciphertext: row.encryptedToken });
    if (!token) return null; // wrong key or tampered → miss
    return { token, expiresAt: row.expiresAt.getTime(), scope: row.scope, obtainedAt: row.obtainedAt.getTime() };
  } catch {
    return null; // table missing / DB down → memory-only mode
  }
}

export async function writeDurableToken(version: ApiVersion, entry: DurableToken): Promise<void> {
  const rows = table();
  if (!rows || !isTokenEncryptionConfigured()) return;
  const sealed = sealToken(entry.token);
  if (!sealed) return;
  try {
    await rows.upsert({
      where: { version },
      create: {
        version,
        encryptedToken: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        scope: entry.scope,
        expiresAt: new Date(entry.expiresAt),
        obtainedAt: new Date(entry.obtainedAt),
      },
      update: {
        encryptedToken: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        scope: entry.scope,
        expiresAt: new Date(entry.expiresAt),
        obtainedAt: new Date(entry.obtainedAt),
      },
    });
  } catch {
    /* best-effort: memory tier still serves this instance */
  }
}

export async function clearDurableToken(version: ApiVersion): Promise<void> {
  const rows = table();
  if (!rows) return;
  try {
    await rows.deleteMany({ where: { version } });
  } catch {
    /* best-effort */
  }
}
