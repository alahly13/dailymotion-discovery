import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("https://dailymotion-discovery.vercel.app"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default("https://example.supabase.co"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).default("build-placeholder"),
  NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
});

const isBuildOrTest = process.env.NEXT_PHASE === "phase-production-build" || process.env.NODE_ENV === "test";

function parsePublicEnv() {
  // Explicitly reference each NEXT_PUBLIC_* property so Next.js Turbopack and Webpack
  // can inline the values at build time into client browser bundles.
  const raw = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS: process.env.NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS,
  };

  const parsed = publicSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  // In the client browser or during build/test, fail-soft with sane defaults rather than crashing the client
  if (typeof window !== "undefined" || isBuildOrTest) {
    if (typeof window === "undefined" && process.env.NODE_ENV !== "test") {
      console.warn("[WARN] Skipping strict public env validation during Next.js production build.");
    }
    return {
      NEXT_PUBLIC_APP_URL: raw.NEXT_PUBLIC_APP_URL || "https://dailymotion-discovery.vercel.app",
      NEXT_PUBLIC_SUPABASE_URL: raw.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "build-placeholder",
      NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS: Number(raw.NEXT_PUBLIC_SEARCH_HISTORY_TTL_SECONDS) || 604800,
    };
  }

  throw parsed.error;
}

export const publicEnv = parsePublicEnv();

/**
 * Determines whether real (non-placeholder) Supabase URL and publishable key are active.
 *
 * What this controls: Prevents proxy middleware, auth routes, and SSR helpers from probing
 * the build/test fallback `https://example.supabase.co` over the network when env is unset.
 * Scope: Shared Supabase configuration guard (client and server safe).
 */
export function isSupabaseConfigured(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? publicEnv.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  return Boolean(
    url &&
      key &&
      !url.includes("example.supabase.co") &&
      key !== "build-placeholder"
  );
}
