import { z } from "zod";
import { publicEnv } from "./public-env";
import { resolveDatabaseUrl } from "@/lib/db/database-url";
import type { FetchProfile, FetchSafetyCaps } from "@/types/channel-fetch";

const postgresUrlSchema = z.string().url().refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}, "Must be a postgres:// or postgresql:// URL.");

const databaseSchema = z.object({
  DATABASE_URL_CONNECTION_STRING: postgresUrlSchema.optional(),
  DATABASE_URL: postgresUrlSchema.optional(),
});

const isBuildTime = process.env.NEXT_PHASE === "phase-production-build";

const optionalServerSchema = z.object({
  // Deprecated: retained for active Supabase clients only. The canonical
  // secret is SUPABASE_SECRET_KEY (server-only Supabase SDK). This variable
  // is never read as a credential path — do not reintroduce it.
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // Canonical server-only Supabase secret (sb_secret_…). Used only by the
  // server-side Storage client. Never prefix with NEXT_PUBLIC_.
  SUPABASE_SECRET_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().trim().min(1).optional(),
  DAILYMOTION_API_BASE_URL: z.string().url().default("https://api.dailymotion.com"),
  DAILYMOTION_API_KEY: z.string().optional(),
  // Canonical split: public discovery base vs authenticated Partner base.
  // A V1 base containing "partner" is honored as Partner (warns once).
  DAILYMOTION_API_BASE_URL_V1: z.string().url().default("https://api.dailymotion.com/"),
  DAILYMOTION_PARTNER_API_BASE_URL_V1: z.string().url().default("https://partner.api.dailymotion.com/rest"),
  DAILYMOTION_API_BASE_URL_V2: z.string().url().default("https://api.dailymotion.com/v2"),
  DAILYMOTION_OAUTH_TOKEN_URL_V1: z.string().url().default("https://partner.api.dailymotion.com/oauth/v1/token"),
  DAILYMOTION_OAUTH_TOKEN_URL_V2: z.string().url().default("https://oauth2.dailymotion.com/v2/token"),
  PRIVATE_DAILYMOTION_API_KEY_V1: z.string().optional(),
  PRIVATE_DAILYMOTION_API_KEY_SECRET_V1: z.string().optional(),
  PRIVATE_DAILYMOTION_API_KEY_V2: z.string().optional(),
  PRIVATE_DAILYMOTION_API_KEY_SECRET_V2: z.string().optional(),
  // V1 token endpoint REQUIRES scope (documented Platform scopes:
  // userinfo, email, manage_videos, manage_players, manage_playlists,
  // manage_subtitles). Default userinfo = least privilege for discovery.
  DAILYMOTION_API_SCOPE_V1: z.string().trim().min(1).default("userinfo"),
  // V2 scope default: read-only public bundle for discovery.
  DAILYMOTION_API_SCOPE_V2: z.string().trim().min(1).default("bundle.public"),
  // Tri-state safety default ("true"/"false"/unset→omit=safe). Parsed in
  // version-config; raw string kept here so "false" is never falsy-dropped.
  DAILYMOTION_FAMILY_FILTER: z.string().optional(),
  // v1 global localization default.
  DAILYMOTION_LOCALIZATION: z.string().trim().min(1).default("detect"),
  // Optional encryption key for the durable (Postgres) OAuth token cache.
  // Absent → memory-only reuse (documented). Server-only, never logged.
  TOKEN_CACHE_ENCRYPTION_KEY: z.string().optional(),
  TOKEN_CACHE_SAFETY_MARGIN_SECONDS: z.coerce.number().int().nonnegative().max(3600).default(60),
  ADMIN_DEFAULT_USERNAME: z.string().trim().min(1).default("admin"),
  ADMIN_INITIAL_PASSWORD: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  ADMIN_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  CRON_SECRET: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
  AI_EMBEDDING_MODEL: z.string().optional(),
  ENABLE_PGVECTOR: z.enum(["true", "false"]).default("false"),
  ENABLE_MANIFEST_PERSISTENCE: z.enum(["true", "false"]).default("true"),
  MAX_CHANNEL_FETCH_PAGES: z.coerce.number().int().positive().default(200),
  MAX_CHANNEL_FETCH_ITEMS: z.coerce.number().int().positive().default(100000),
  MAX_CHANNEL_FETCH_WINDOWS: z.coerce.number().int().positive().default(3000),
  MAX_CHANNEL_FETCH_WINDOW_DEPTH: z.coerce.number().int().positive().default(5),
  MAX_CHANNEL_FETCH_TOTAL_PAGES: z.coerce.number().int().positive().default(5000),
  MAX_CHANNEL_FETCH_PAGE_SIZE: z.coerce.number().int().positive().max(100).default(100),
  CHANNEL_FETCH_DELAY_MS: z.coerce.number().int().nonnegative().default(250),
  CHANNEL_FETCH_MIN_DELAY_MS: z.coerce.number().int().nonnegative().default(100),
  CHANNEL_FETCH_CONCURRENCY: z.coerce.number().int().positive().default(3),
  CHANNEL_FETCH_MAX_CONCURRENCY: z.coerce.number().int().positive().max(5).default(5),
  CHANNEL_FETCH_DEFAULT_PROFILE: z
    .enum(["quick-preview", "standard-fetch", "deep-balanced", "deep-aggressive", "recent-sync", "historical-backfill", "custom-expert"])
    .default("deep-balanced"),
  CHANNEL_FETCH_JOB_TTL_HOURS: z.coerce.number().int().positive().default(72),
  TEMP_MANIFEST_TTL_HOURS: z.coerce.number().int().positive().default(72),
});

function isSupabaseDirectHost(raw: string) {
  try {
    return /^db\.[a-z0-9-]+\.supabase\.co$/i.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}

let hasWarnedSupabaseDirect = false;
let cachedDatabaseEnv: z.infer<typeof databaseSchema> | null = null;

export function getDatabaseEnv() {
  if (cachedDatabaseEnv) return cachedDatabaseEnv;

  // Canonical contract first; legacy fallback handled by the resolver.
  // Validation here checks shapes only — resolution/warnings live in
  // src/lib/db/database-url.ts. Values are never printed.
  const values = {
    DATABASE_URL_CONNECTION_STRING: process.env.DATABASE_URL_CONNECTION_STRING?.trim() || undefined,
    DATABASE_URL: process.env.DATABASE_URL?.trim() || undefined,
  };

  const parsed = databaseSchema.safeParse(values);
  if (!parsed.success) {
    if (isBuildTime) {
      console.warn("[WARN] Skipping strict database env validation during Next.js production build.");
      cachedDatabaseEnv = {
        DATABASE_URL_CONNECTION_STRING: "postgresql://build:build@localhost:5432/build",
      };
      return cachedDatabaseEnv;
    }

    throw parsed.error;
  }

  if (!parsed.data.DATABASE_URL_CONNECTION_STRING && !parsed.data.DATABASE_URL) {
    if (isBuildTime) {
      console.warn("[WARN] Skipping strict database env validation during Next.js production build.");
      cachedDatabaseEnv = { DATABASE_URL_CONNECTION_STRING: "postgresql://build:build@localhost:5432/build" };
      return cachedDatabaseEnv;
    }
    throw new Error("Missing database connection string. Set DATABASE_URL_CONNECTION_STRING.");
  }

  cachedDatabaseEnv = {
    DATABASE_URL_CONNECTION_STRING: parsed.data.DATABASE_URL_CONNECTION_STRING,
    DATABASE_URL: parsed.data.DATABASE_URL,
  };

  const effective = parsed.data.DATABASE_URL_CONNECTION_STRING ?? parsed.data.DATABASE_URL ?? "";
  if (!hasWarnedSupabaseDirect && isSupabaseDirectHost(effective)) {
    console.warn(
      "[WARN] Database URL uses Supabase direct host (db.<project-ref>.supabase.co). " +
        "Use the Supabase Session Pooler URL for this project to avoid IPv4-limited connection failures."
    );
    hasWarnedSupabaseDirect = true;
  }

  return cachedDatabaseEnv;
}

export const optionalServerEnv = optionalServerSchema.parse(process.env);

export const env = {
  get geminiApiKey() {
    return requireServerEnv("GEMINI_API_KEY");
  },
  get geminiModel() {
    return optionalServerEnv.GEMINI_MODEL?.trim() || "gemini-1.5-flash";
  },
  get databaseUrl() {
    return getDatabaseEnv().DATABASE_URL_CONNECTION_STRING ?? getDatabaseEnv().DATABASE_URL ?? "";
  },
  get dailymotionApiBaseUrl() {
    return optionalServerEnv.DAILYMOTION_API_BASE_URL;
  },
  get publicAppUrl() {
    return publicEnv.NEXT_PUBLIC_APP_URL;
  },
};

export function requireServerEnv(name: "GEMINI_API_KEY" | "DATABASE_URL"): string {
  // DATABASE_URL resolves through the canonical contract (CONNECTION_STRING
  // first, legacy fallback with warning). Values are never printed.
  if (name === "DATABASE_URL") return resolveDatabaseUrl();

  const value = process.env[name];
  if (!value) throw new Error(`${name} is required on the server.`);
  return value;
}

export function getOptionalServerEnv(name: keyof typeof optionalServerEnv) {
  return optionalServerEnv[name];
}

export function getDailymotionConfig() {
  return {
    baseUrl: optionalServerEnv.DAILYMOTION_API_BASE_URL,
    apiKey: optionalServerEnv.DAILYMOTION_API_KEY?.trim() || "",
  };
}

export function getFetchSafetyConfig(): FetchSafetyCaps {
  const maxConcurrency = Math.max(1, optionalServerEnv.CHANNEL_FETCH_MAX_CONCURRENCY);
  const defaultConcurrency = Math.min(Math.max(1, optionalServerEnv.CHANNEL_FETCH_CONCURRENCY), maxConcurrency);

  // These values are server-side hard caps for Dailymotion collection work.
  // Channel Explorer UI settings are only requests; route handlers must clamp
  // them here so browser state cannot create unlimited or unsafe fetches. The
  // concurrency pair is server-only because provider pressure and Vercel
  // duration risk must remain backend-owned, not controlled by client state.
  return {
    legacyMaxPages: optionalServerEnv.MAX_CHANNEL_FETCH_PAGES,
    maxItems: optionalServerEnv.MAX_CHANNEL_FETCH_ITEMS,
    maxTotalPages: optionalServerEnv.MAX_CHANNEL_FETCH_TOTAL_PAGES,
    maxWindows: optionalServerEnv.MAX_CHANNEL_FETCH_WINDOWS,
    maxWindowDepth: optionalServerEnv.MAX_CHANNEL_FETCH_WINDOW_DEPTH,
    maxPageSize: optionalServerEnv.MAX_CHANNEL_FETCH_PAGE_SIZE,
    defaultDelayMs: optionalServerEnv.CHANNEL_FETCH_DELAY_MS,
    minDelayMs: optionalServerEnv.CHANNEL_FETCH_MIN_DELAY_MS,
    defaultConcurrency,
    maxConcurrency,
    defaultProfile: optionalServerEnv.CHANNEL_FETCH_DEFAULT_PROFILE as FetchProfile,
    jobTtlHours: optionalServerEnv.CHANNEL_FETCH_JOB_TTL_HOURS,
    tempManifestTtlHours: optionalServerEnv.TEMP_MANIFEST_TTL_HOURS,
    manifestPersistenceEnabled: optionalServerEnv.ENABLE_MANIFEST_PERSISTENCE === "true",
  };
}
