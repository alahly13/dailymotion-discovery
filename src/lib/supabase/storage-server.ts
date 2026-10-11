// Server-only Supabase SDK client with the canonical secret key.
//
// What this controls: privileged Storage/API access (private bucket ops).
// Canonical credential: SUPABASE_SECRET_KEY (sb_secret_…). The legacy
// SUPABASE_SERVICE_ROLE_KEY is NOT a fallback — no implicit downgrade.
// Missing key throws a sanitized actionable error (name only, never value).
// This module must never be imported by client components ("server-only"
// boundary is enforced by construction: it reads server env + secret).
// Scope: storage-documents service + storage scripts/routes.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function supabaseUrl(): string {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!url) throw new Error("Supabase Storage unavailable: NEXT_PUBLIC_SUPABASE_URL is not configured.");
  return url;
}

function secretKey(): string {
  const key = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "Supabase Storage unavailable: SUPABASE_SECRET_KEY is not configured. " +
        "Set it in .env.local / Vercel (Supabase Dashboard → API Keys → Secret key). " +
        "The legacy service-role variable is retired and is not used as a fallback."
    );
  }
  return key;
}

let cached: SupabaseClient | null = null;

/** Privileged server-side Supabase client (Storage). Throws sanitized. */
export function getStorageServerClient(): SupabaseClient {
  if (!cached) {
    cached = createClient(supabaseUrl(), secretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/** Sanitized connectivity facts (no secrets). */
export function storageConfigStatus(): { urlConfigured: boolean; secretConfigured: boolean } {
  return {
    urlConfigured: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().length > 0,
    secretConfigured: (process.env.SUPABASE_SECRET_KEY ?? "").trim().length > 0,
  };
}
