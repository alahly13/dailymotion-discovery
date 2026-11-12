#!/usr/bin/env node

import { loadProjectEnv } from "./load-project-env.mjs";

loadProjectEnv();

const PLACEHOLDER_PATTERNS = [
  /<[^>]+>/,
  /\[[^\]]+\]/,
  /your-/i,
  /placeholder/i,
  /example/i,
  /optional/i,
  /leave empty/i,
  /omit/i,
];

function parseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function looksLikePostgres(raw) {
  const parsed = parseUrl(raw);
  return parsed ? ["postgres:", "postgresql:"].includes(parsed.protocol) : false;
}

function isBlankOrPlaceholder(raw) {
  const value = raw?.trim() || "";
  return value.length === 0 || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function validateRequired(name, options = {}) {
  const value = process.env[name]?.trim();
  if (isBlankOrPlaceholder(value)) return `${name} is missing or still contains a placeholder.`;

  if (options.kind === "url" && !parseUrl(value)) {
    return `${name} must be a valid URL.`;
  }

  if (options.kind === "postgres" && !looksLikePostgres(value)) {
    return `${name} must be a postgres:// or postgresql:// URL. Percent-encode reserved password characters such as #, @, ?, /, or $.`;
  }

  return null;
}

function validateDatabase() {
  // DATABASE_URL is primary; the documented backup applies only when the
  // primary is missing (warn loudly, never silently). Values never printed.
  const primary = process.env.DATABASE_URL?.trim();
  if (!isBlankOrPlaceholder(primary)) {
    if (!looksLikePostgres(primary)) {
      return "DATABASE_URL must be a postgres:// or postgresql:// URL. Percent-encode reserved password characters such as #, @, ?, /, or $.";
    }
    return null;
  }
  const backup = process.env.SUPABASE_DATABASE_URL_CONNECTION_STRING?.trim();
  if (!isBlankOrPlaceholder(backup)) {
    if (!looksLikePostgres(backup)) {
      return "SUPABASE_DATABASE_URL_CONNECTION_STRING must be a postgres:// or postgresql:// URL. Percent-encode reserved password characters such as #, @, ?, /, or $.";
    }
    console.warn("[WARN] Build uses backup SUPABASE_DATABASE_URL_CONNECTION_STRING because DATABASE_URL is missing. Set DATABASE_URL as primary.");
    return null;
  }
  return "DATABASE_URL is missing or still contains a placeholder.";
}

function main() {
  const failures = [
    validateDatabase(),
    validateRequired("NEXT_PUBLIC_APP_URL", { kind: "url" }),
    validateRequired("NEXT_PUBLIC_SUPABASE_URL", { kind: "url" }),
    validateRequired("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  ].filter(Boolean);

  const geminiIssue = validateRequired("GEMINI_API_KEY");
  if (geminiIssue) {
    // AI routes (/api/ai/*) fail closed with 503 missing_config when GEMINI_API_KEY
    // is unset or placeholder, so build/non-AI workflows warn instead of aborting.
    console.warn(`[WARN] ${geminiIssue} AI routes will return 503 missing_config until configured.`);
  }

  const r2Url = process.env.CLOUDFLARE_R2_WORKER_URL?.trim() || "";
  const r2Secret = process.env.CLOUDFLARE_R2_WORKER_HMAC_SECRET?.trim() || "";
  if (r2Url && !parseUrl(r2Url)) {
    failures.push("CLOUDFLARE_R2_WORKER_URL must be a valid https:// or http:// URL when configured.");
  } else if (!r2Url || !r2Secret) {
    console.warn("[WARN] Cloudflare R2 Worker (CLOUDFLARE_R2_WORKER_URL / CLOUDFLARE_R2_WORKER_HMAC_SECRET) is not configured. R2 sync falls back to local IndexedDB / Postgres.");
  }

  if (failures.length > 0) {
    console.error("[ERROR] Build is missing required environment configuration:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error("Use a root .env file for local builds, or configure the same keys in Vercel Project Settings -> Environment Variables.");
    process.exit(1);
  }

  console.log("[OK] Required application environment variables are present for build/runtime.");
}

main();
