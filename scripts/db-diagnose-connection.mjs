#!/usr/bin/env node
// db:diagnose-connection — layered PostgreSQL connectivity diagnostics.
// Layers (each reported independently, sanitized, bounded timeouts):
//   1. config resolution (canonical var, no values printed)
//   2. DNS resolution (address families per answer)
//   3. local IP stack (IPv6 availability on this machine)
//   4. TCP connect to port 5432 per resolved address
//   5. PostgreSQL authentication + read-only SELECT 1 (pg driver)
//   6. Prisma query (db execute SELECT 1)
//   7. Prisma migrate status (read-only)
// A pass at one layer is never presented as proof of a later layer.
// Read-only: no migrations, no DDL, no data changes.

import dns from "node:dns/promises";
import net from "node:net";
import os from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadProjectEnv } from "./load-project-env.mjs";
import { applyPrismaCommandConnectionDefaults } from "./prisma-command-env.mjs";

loadProjectEnv();

const TCP_TIMEOUT_MS = 8000;
const PG_TIMEOUT_MS = 10000;

function sanitizeHost(url) {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: Number(parsed.port || 5432), database: parsed.pathname.replace(/^\//, "") || "postgres", protocol: parsed.protocol };
  } catch {
    return null;
  }
}

function resolveConnectionString() {
  const canonical = process.env.DATABASE_URL_CONNECTION_STRING?.trim() || "";
  const legacy = !canonical ? process.env.DATABASE_URL?.trim() || "" : "";
  return { value: canonical || legacy, source: canonical ? "DATABASE_URL_CONNECTION_STRING" : "DATABASE_URL (deprecated fallback)" };
}

async function layerDns(host) {
  // NOTE: node:dns.lookup (getaddrinfo) is unreliable for IPv6-only hosts on
  // some Windows resolvers — query AAAA/A explicitly instead.
  const [v6, v4] = await Promise.all([
    dns.resolve6(host).catch((error) => ({ __error: error.code || "DNS_FAILED" })),
    dns.resolve4(host).catch((error) => ({ __error: error.code || "DNS_FAILED" })),
  ]);
  const answers = [];
  if (Array.isArray(v6)) for (const address of v6) answers.push({ address, family: "IPv6" });
  if (Array.isArray(v4)) for (const address of v4) answers.push({ address, family: "IPv4" });
  const errors = {
    ...(Array.isArray(v6) ? {} : { AAAA: v6.__error }),
    ...(Array.isArray(v4) ? {} : { A: v4.__error }),
  };
  return { ok: answers.length > 0, answers, errors };
}

function layerLocalStack() {
  const interfaces = os.networkInterfaces();
  let ipv4 = 0;
  let ipv6 = 0;
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.internal) continue;
      if (addr.family === "IPv4") ipv4 += 1;
      if (addr.family === "IPv6") ipv6 += 1;
    }
  }
  return { externalIpv4: ipv4, externalIpv6: ipv6, ipv6Available: ipv6 > 0 };
}

function tcpConnect(address, port) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    const done = (ok, error) => {
      socket.destroy();
      resolve({ address, ok, latencyMs: Date.now() - started, error: error || null });
    };
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once("connect", () => done(true, null));
    socket.once("timeout", () => done(false, "TCP_TIMEOUT"));
    socket.once("error", (error) => done(false, error.code || "TCP_ERROR"));
    socket.connect(port, address);
  });
}

async function layerPgAuth(connectionString, hostaddr) {
  const { Client } = await import("pg");
  // hostaddr bypasses Node's getaddrinfo (unreliable for IPv6-only hosts on
  // some Windows resolvers) so this layer tests TCP+auth, not Node DNS.
  const client = new Client({ connectionString, hostaddr: hostaddr || undefined, connectionTimeoutMillis: PG_TIMEOUT_MS, query_timeout: PG_TIMEOUT_MS });
  const started = Date.now();
  try {
    await client.connect();
    await client.query("SELECT 1 AS connection_ok");
    return { ok: true, latencyMs: Date.now() - started, error: null };
  } catch (error) {
    const code = error?.code || "PG_ERROR";
    // Sanitize: pg messages can echo host/db but never the password.
    // ENOTFOUND here typically mirrors the Node getaddrinfo quirk (see DNS
    // layer): the AAAA answer exists but this resolver won't use it. The TCP
    // layer result against the resolved IP is the authoritative signal.
    return { ok: false, latencyMs: Date.now() - started, error: code };
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

function runPrisma(args, input) {
  const cli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  const command = process.platform === "win32" ? "node" : process.execPath;
  const result = spawnSync(command, [cli, ...args], { encoding: "utf8", env: process.env, input, timeout: 60000 });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`
    .replace(/(postgres(?:ql)?:\/\/)[^\s'"`<>]+/gi, "$1[REDACTED_URL]");
  return { status: typeof result.status === "number" ? result.status : 1, output };
}

async function main() {
  const report = { layers: {}, pass: false };
  const { value: connectionString, source } = resolveConnectionString();
  if (!connectionString) {
    console.log(JSON.stringify({ ok: false, error: "Missing DATABASE_URL_CONNECTION_STRING (and no legacy fallback)." }));
    process.exit(1);
  }
  const meta = sanitizeHost(connectionString);
  if (!meta || (meta.protocol !== "postgres:" && meta.protocol !== "postgresql:")) {
    console.log(JSON.stringify({ ok: false, error: "Connection string is not a valid postgres URL." }));
    process.exit(1);
  }
  report.source = source;
  report.host = meta.host;
  report.port = meta.port;
  report.database = meta.database;
  report.hostType = /\.pooler\.supabase\.com$/i.test(meta.host) ? "pooler" : /^db\.[a-z0-9-]+\.supabase\.co$/i.test(meta.host) ? "direct" : "other";

  const dnsResult = await layerDns(meta.host);
  report.layers.dns = dnsResult;
  report.layers.localStack = layerLocalStack();

  // Control probe: well-known IPv6/IPv4 endpoints prove whether THIS machine
  // has working IPv6 egress at all (vs a host-specific routing problem).
  let controlV6 = null;
  try {
    const g = await dns.resolve6("google.com");
    if (Array.isArray(g) && g[0]) {
      controlV6 = await tcpConnect(g[0], 443);
    }
  } catch {
    controlV6 = { address: null, ok: false, error: "CONTROL_DNS_FAILED" };
  }
  report.layers.egressControl = { ipv6Internet: controlV6 };

  const tcpResults = [];
  for (const answer of dnsResult.answers) {
    tcpResults.push(await tcpConnect(answer.address, meta.port));
  }
  report.layers.tcp = tcpResults;

  const pgResult = await layerPgAuth(
    connectionString,
    dnsResult.answers.length > 0 ? dnsResult.answers[0].address : null
  );
  report.layers.postgresAuth = pgResult;

  applyPrismaCommandConnectionDefaults();
  const prismaQuery = runPrisma(["db", "execute", "--stdin"], "SELECT 1;");
  report.layers.prismaQuery = { ok: prismaQuery.status === 0, outputTail: prismaQuery.output.trim().split("\n").slice(-4).join("\n") };

  let migrateStatus = { ok: false, outputTail: "skipped" };
  if (report.layers.prismaQuery.ok) {
    const ms = runPrisma(["migrate", "status"]);
    migrateStatus = { ok: ms.status === 0, outputTail: ms.output.trim().split("\n").slice(-12).join("\n") };
  }
  report.layers.migrateStatus = migrateStatus;

  report.pass = pgResult.ok && report.layers.prismaQuery.ok;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

await main();
