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
  return parsed ? ['postgres:', 'postgresql:'].includes(parsed.protocol) : false;
}

function isBlankOrPlaceholder(raw) {
  const value = raw?.trim() || "";
  return value.length === 0 || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function classifyHost(host = '') {
  if (/\.pooler\.supabase\.com$/i.test(host)) return 'supabase-session-pooler';
  if (/^db\.[a-z0-9-]+\.supabase\.co$/i.test(host)) return 'supabase-direct';
  return 'custom-or-other';
}

function sanitizeMeta(raw) {
  const parsed = parseUrl(raw);
  if (!parsed) return null;

  return {
    protocol: parsed.protocol.replace(':', ''),
    host: parsed.hostname || '(missing-host)',
    port: parsed.port || '(default)',
    database: parsed.pathname?.replace(/^\//, '') || '(unknown)',
    hostType: classifyHost(parsed.hostname || ''),
    queryParams: parsed.searchParams.size > 0 ? 'present' : 'none',
  };
}

function validate() {
  // Canonical first, legacy fallback (warns). Values never printed.
  const canonical = process.env.DATABASE_URL_CONNECTION_STRING?.trim() || '';
  const legacy = process.env.DATABASE_URL?.trim() || '';
  const databaseUrl = canonical || legacy;
  const usingLegacy = !canonical && !!legacy;

  if (isBlankOrPlaceholder(databaseUrl)) {
    console.error('[ERROR] Missing required environment variable: DATABASE_URL_CONNECTION_STRING');
    console.error('Set DATABASE_URL_CONNECTION_STRING in Vercel, GitHub Codespaces, GitHub Actions, your local shell, or a root .env.local file.');
    process.exit(1);
  }

  if (!looksLikePostgres(databaseUrl)) {
    console.error('[ERROR] DATABASE_URL_CONNECTION_STRING must be a postgres:// or postgresql:// URL.');
    console.error('If your password contains reserved characters such as #, @, ?, /, or $, percent-encode them before pasting the URL.');
    process.exit(1);
  }

  console.log('[OK] Required database environment is present and valid.');

  const databaseDetails = sanitizeMeta(databaseUrl);
  console.log(
    `- connection: protocol=${databaseDetails.protocol}, host=${databaseDetails.host}, port=${databaseDetails.port}, database=${databaseDetails.database}, host_type=${databaseDetails.hostType}, query_params=${databaseDetails.queryParams}`
  );

  if (usingLegacy) {
    console.warn('[WARN] Using deprecated DATABASE_URL fallback. Migrate to DATABASE_URL_CONNECTION_STRING (canonical wins when both are set).');
  }

  console.log('[INFO] Prisma CLI and migrations use DATABASE_URL_CONNECTION_STRING (legacy DATABASE_URL fallback).');

  if (classifyHost(databaseDetails.host) === 'supabase-direct') {
    console.warn(
      '[WARN] Connection looks like a Supabase direct host (db.<project-ref>.supabase.co). ' +
        'This can fail in IPv4-only environments unless IPv6 or Supabase IPv4 add-on is available. ' +
        'Use the Supabase Session Pooler shape: aws-0-<region>.pooler.supabase.com.'
    );
  }

  if (databaseDetails.hostType === 'supabase-session-pooler' && databaseDetails.port !== '5432') {
    console.warn(
      '[WARN] Connection uses a Supabase pooler host but not the documented Session Pooler port 5432. ' +
        'This project expects the Session Pooler URL for Prisma CLI/status/apply diagnostics.'
    );
  }

  console.log('[OK] Secrets were not printed.');
}

validate();
