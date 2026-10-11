#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadProjectEnv } from "./load-project-env.mjs";
import { applyPrismaCommandConnectionDefaults } from "./prisma-command-env.mjs";

loadProjectEnv();

const prismaCliPath = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');

function runCommand(command, args, options = {}) {
  const { retryOnP1001 = false, retryMessage, ...spawnOptions } = options;
  let result = spawnCommand(command, args, spawnOptions);

  // The guarded apply flow targets Supabase Session Pooler through Prisma's
  // migration engine. A single P1001 can occur after the lightweight preflight
  // succeeds, so retry only the same engine command once and then fail closed.
  if (retryOnP1001 && commandFailed(result) && /P1001/.test(commandOutput(result))) {
    console.warn(retryMessage || `[WARN] Retrying ${command} ${args.join(' ')} once after P1001 reachability failure.`);
    result = spawnCommand(command, args, spawnOptions);
  }

  writeOutput(result.stdout, process.stdout);
  writeOutput(result.stderr, process.stderr);

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(`[ERROR] Command not found: ${command}`);
      console.error('Next step: ensure dependencies are installed (`npm install`) and Prisma CLI is available.');
    } else {
      console.error(`[ERROR] Failed to run ${command} ${args.join(' ')}:`, result.error.message);
    }
    process.exit(1);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

function runPrismaCommand(args, options = {}) {
  runCommand(process.execPath, [prismaCliPath, ...args], options);
}

function resolveCommand(command) {
  if (process.platform !== 'win32') return command;
  if (command === 'npx') return 'npx.cmd';
  if (command === 'npm') return 'npm.cmd';
  return command;
}

function spawnCommand(command, args, options = {}) {
  return spawnSync(resolveCommand(command), args, {
    encoding: 'utf8',
    env: process.env,
    ...options,
  });
}

function commandOutput(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

function commandFailed(result) {
  return Boolean(result.error) || (typeof result.status === 'number' && result.status !== 0);
}

function redact(text = '') {
  return String(text)
    .replace(/(postgres(?:ql)?:\/\/)[^\s'"`<>]+/gi, '$1[REDACTED_URL]')
    .replace(/(DATABASE_URL=)([^\s]+)/gi, '$1[REDACTED]');
}

function writeOutput(text, stream = process.stdout) {
  if (text) stream.write(redact(text));
}

function parseMeta(raw) {
  try {
    const url = new URL(raw);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) return null;
    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname || '(missing-host)',
      port: url.port || '(default)',
      database: url.pathname?.replace(/^\//, '') || '(unknown)',
    };
  } catch {
    return null;
  }
}

function isProductionLikeHost(host = '') {
  return /(prod|production|live|primary|pooler\.supabase\.com|supabase\.com|supabase\.co)/i.test(host);
}

function validateEnv() {
  const canonical = process.env.DATABASE_URL_CONNECTION_STRING?.trim() || "";
  const legacy = !canonical ? process.env.DATABASE_URL?.trim() || "" : "";
  const databaseUrl = canonical || legacy;
  const dbMeta = parseMeta(databaseUrl);

  if (!dbMeta) {
    console.error('[ERROR] DATABASE_URL_CONNECTION_STRING must be a valid postgres:// or postgresql:// URL.');
    console.error('Run `npm run db:validate` for details.');
    process.exit(1);
  }

  console.log('[INFO] Database target summary (sanitized):');
  console.log(`- host=${dbMeta.host}, port=${dbMeta.port}, database=${dbMeta.database}, protocol=${dbMeta.protocol}`);
  console.log(`- Prisma CLI/migrations connection=${canonical ? "DATABASE_URL_CONNECTION_STRING" : "DATABASE_URL (deprecated fallback)"}`);
  if (!canonical) {
    console.warn('[WARN] Using deprecated DATABASE_URL fallback. Migrate to DATABASE_URL_CONNECTION_STRING.');
  }

  if (isProductionLikeHost(dbMeta.host) || process.env.VERCEL_ENV === 'production') {
    console.warn('[WARN] Production-like database target detected.');
    if (process.env.CONFIRM_DB_APPLY !== 'true') {
      console.error('[ERROR] Refusing to run without explicit confirmation.');
      console.error('Re-run with: CONFIRM_DB_APPLY=true npm run db:apply');
      process.exit(1);
    }
  }
}

function printConnectionTroubleshooting() {
  console.error('Troubleshooting checklist:');
  console.error('- Use the Supabase Session Pooler URL for DATABASE_URL_CONNECTION_STRING in Vercel/Codespaces/GitHub Actions.');
  console.error('- Verify Supabase password and project reference are correct.');
  console.error('- Avoid Supabase direct hosts for this workflow; they can fail with P1001 in IPv4-limited environments.');
}

function hasCommittedMigrationFiles() {
  const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
  if (!fs.existsSync(migrationsDir)) return false;

  return fs.readdirSync(migrationsDir, { withFileTypes: true }).some((entry) => {
    if (!entry.isDirectory()) return false;
    return fs.existsSync(path.join(migrationsDir, entry.name, 'migration.sql'));
  });
}

function validateMigrationHistory() {
  // db:apply is the production-impacting path. It must only deploy reviewed
  // Prisma migration files owned by this repo, never infer schema changes from
  // schema.prisma or rely on db push/reset-style behavior.
  if (hasCommittedMigrationFiles()) return;

  console.error('[ERROR] No committed Prisma migration files were found under prisma/migrations.');
  console.error('Create and review a baseline migration history before running db:apply against the real database.');
  console.error('Do not use prisma migrate reset or prisma db push as the production repair path.');
  process.exit(1);
}

function main() {
  console.log('[INFO] Running migration preflight checks...');
  runCommand('node', ['scripts/db-validate-env.mjs']);
  applyPrismaCommandConnectionDefaults();
  validateEnv();
  validateMigrationHistory();

  console.log('[INFO] Checking migration status...');
  runCommand('node', ['scripts/db-status.mjs', '--skip-validation', '--allow-status-failure'], {
    retryOnP1001: true,
    retryMessage: '[WARN] Retrying guarded migration status check once after P1001 reachability failure.',
  });

  console.log('[INFO] Applying pending migrations (prisma migrate deploy)...');
  runPrismaCommand(['migrate', 'deploy'], {
    retryOnP1001: true,
    retryMessage: '[WARN] Retrying prisma migrate deploy once after P1001 reachability failure.',
  });

  console.log('[INFO] Regenerating Prisma client...');
  runPrismaCommand(['generate']);

  console.log('[INFO] Re-checking migration status...');
  runCommand('node', ['scripts/db-status.mjs', '--skip-validation'], {
    retryOnP1001: true,
    retryMessage: '[WARN] Retrying final migration status check once after P1001 reachability failure.',
  });

  console.log('[OK] Database migration apply workflow completed successfully.');
}

try {
  main();
} catch (error) {
  console.error('[ERROR] Migration workflow failed.');
  console.error(error instanceof Error ? error.message : String(error));
  printConnectionTroubleshooting();
  process.exit(1);
}
