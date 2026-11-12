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
  // DATABASE_URL is primary; the documented backup applies only when the
  // primary is missing (warn loudly, never silently). Values never printed.
  const primary = process.env.DATABASE_URL?.trim() || '';
  const backup = !primary ? process.env.SUPABASE_DATABASE_URL_CONNECTION_STRING?.trim() || '' : '';
  const databaseUrl = primary || backup;
  const usingBackup = !primary && !!backup;

  if (isBlankOrPlaceholder(databaseUrl)) {
    console.error('[ERROR] Missing required environment variable: DATABASE_URL');
    console.error('Set DATABASE_URL in Vercel, GitHub Codespaces, GitHub Actions, your local shell, or a root .env file.');
    process.exit(1);
  }

  if (!looksLikePostgres(databaseUrl)) {
    console.error('[ERROR] DATABASE_URL must be a postgres:// or postgresql:// URL.');
    console.error('If your password contains reserved characters such as #, @, ?, /, or $, percent-encode them before pasting the URL.');
    process.exit(1);
  }

  console.log('[OK] Required database environment is present and valid.');

  const databaseDetails = sanitizeMeta(databaseUrl);
  console.log(
    `- connection (${usingBackup ? "backup SUPABASE_DATABASE_URL_CONNECTION_STRING" : "primary DATABASE_URL"}): protocol=${databaseDetails.protocol}, host=${databaseDetails.host}, port=${databaseDetails.port}, database=${databaseDetails.database}, host_type=${databaseDetails.hostType}, query_params=${databaseDetails.queryParams}`
  );

  if (usingBackup) {
    console.warn('[WARN] DATABASE_URL is missing; using backup SUPABASE_DATABASE_URL_CONNECTION_STRING. Set DATABASE_URL as the primary connection.');
  }

  console.log('[INFO] Prisma CLI and migrations use DATABASE_URL (primary).');

  if (classifyHost(databaseDetails.host) === 'supabase-direct') {
    console.warn(
      '[WARN] Connection looks like a Supabase direct host (db.<project-ref>.supabase.co). ' +
        'Direct connections need working IPv6 egress — verify with `npm run db:diagnose`.'
    );
  }

  if (databaseDetails.hostType === 'supabase-session-pooler' && databaseDetails.port !== '5432') {
    console.warn(
      '[WARN] Connection uses a Supabase pooler host but not the documented Session Pooler port 5432.'
    );
  }

  console.log('[OK] Secrets were not printed.');
}

validate();
