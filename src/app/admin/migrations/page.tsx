// /admin/migrations — schema + data migration diagnostics (admin only).
// Reports real state: known/applied/pending schema migrations, data runs,
// connectivity, storage. Never fabricates. No SQL execution, no auto-apply.

"use client";

import { useEffect, useState } from "react";

interface SchemaState {
  reachable: boolean;
  error: string | null;
  known: string[];
  applied: { name: string; finishedAt: string | null }[];
  pending: string[];
}

interface StatusResponse {
  ok: boolean;
  checkedAt: string;
  database: { connectionSource: string } & SchemaState;
  dataMigrations: { runs: { migrationKey: string; status: string; updatedAt: string }[]; error: string | null };
  storage: { bucketExists: boolean | null; bucketPrivate: boolean | null; error: string | null };
  error?: string;
}

export default function AdminMigrationsPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/session").then((r) => r.json()).then((s) => setAdmin(s.authenticated === true)).catch(() => setAdmin(false));
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const data = (await (await fetch("/api/admin/migrations/status")).json()) as StatusResponse;
      setStatus(data.ok ? data : null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (admin) void refresh();
  }, [admin]);

  if (admin === false) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-black">Migration diagnostics</h1>
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">Admin sign-in required. <a href="/admin/login" className="font-bold text-[var(--primary)] hover:underline">Log in</a></p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Administration</p>
          <h1 className="mt-2 text-3xl font-black">Migration diagnostics</h1>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || !admin} className="ml-auto min-h-10 rounded-md border border-[var(--border)] px-4 text-xs font-black uppercase disabled:opacity-60">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!status ? (
        <p className="text-sm text-[var(--muted-foreground)]">{admin === null ? "Checking session…" : "Loading diagnostics…"}</p>
      ) : (
        <>
          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="font-black">Database connectivity</h2>
            <p className="mt-1 text-sm">Connection: <code>{status.database.connectionSource}</code> · Reachable: <strong>{status.database.reachable ? "yes" : "no"}</strong></p>
            {status.database.error && <p className="mt-1 text-sm text-amber-600">{status.database.error}</p>}
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Checked at {new Date(status.checkedAt).toLocaleString()}</p>
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="font-black">Prisma schema migrations</h2>
            <p className="mt-1 text-sm">Known: {status.database.known.length} · Applied: {status.database.applied.length} · Pending: {status.database.pending.length}</p>
            {status.database.pending.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {status.database.pending.map((name) => <li key={name}><code>{name}</code> — pending apply (guarded CLI/CI only, never auto-applied)</li>)}
              </ul>
            )}
            {status.database.applied.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer font-bold">Applied migrations</summary>
                <ul className="mt-1 list-disc pl-5 text-xs text-[var(--muted-foreground)]">
                  {status.database.applied.map((m) => <li key={m.name}><code>{m.name}</code>{m.finishedAt ? ` — ${new Date(m.finishedAt).toLocaleString()}` : ""}</li>)}
                </ul>
              </details>
            )}
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="font-black">Application data migrations</h2>
            {status.dataMigrations.error ? (
              <p className="mt-1 text-sm text-amber-600">{status.dataMigrations.error}</p>
            ) : status.dataMigrations.runs.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">No data migration runs recorded. Registry: <code>scripts/data-migrations/registry.ts</code>.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {status.dataMigrations.runs.map((run) => (
                  <li key={run.migrationKey}><code>{run.migrationKey}</code> — {run.status} (updated {new Date(run.updatedAt).toLocaleString()})</li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
            <h2 className="font-black">Supabase Storage</h2>
            <p className="mt-1 text-sm">
              Bucket: {status.storage.bucketExists === null ? "unknown" : status.storage.bucketExists ? "exists" : "missing"} ·
              Private: {status.storage.bucketPrivate === null ? "unknown" : status.storage.bucketPrivate ? "yes" : "NO — review"}
            </p>
            {status.storage.error && <p className="mt-1 text-sm text-amber-600">{status.storage.error}</p>}
          </section>
        </>
      )}
    </div>
  );
}
