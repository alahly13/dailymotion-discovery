"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileArchive,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import { getLocalDatabase, LOCAL_STORES } from "@/lib/local-first/indexeddb-store";
import type { StorageOverviewResult } from "@/lib/storage/storage-explorer-service";
import type { LegacyMigrationPreview } from "@/lib/persistence/supabase-to-r2-migration";

/**
 * Storage & Manifest Explorer + Disaster Recovery Center (`/storage`).
 *
 * Exposes Cloudflare R2 Worker status, active dataset generations, SHA-256 verification,
 * full untrimmed ZIP backup exports, offline IndexedDB JSON backup/restore, interrupted
 * sync repair, and non-destructive Supabase Storage -> R2 migration tooling.
 */
export default function StorageExplorerPage() {
  const merged = useMergedDataset();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<StorageOverviewResult | null>(null);
  const [migrationPreview, setMigrationPreview] = useState<LegacyMigrationPreview | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    verifiedDatasets: number;
    failedDatasets: number;
    error?: string;
    results: Array<{ datasetSlug: string; generationId: string | null; ok: boolean; verifiedParts: number; failedParts: number; reason?: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setBusy(true);
    try {
      const session = (await (await fetch("/api/admin/session")).json()) as { authenticated?: boolean };
      if (session.authenticated !== true) {
        setAdmin(false);
        return;
      }
      setAdmin(true);
      const [ovRes, migRes] = await Promise.all([
        fetch("/api/storage/overview", { cache: "no-store" }),
        fetch("/api/admin/storage-migration", { cache: "no-store" }),
      ]);
      if (ovRes.ok) setOverview((await ovRes.json()) as StorageOverviewResult);
      if (migRes.ok) {
        const migJson = (await migRes.json()) as { preview?: LegacyMigrationPreview };
        if (migJson.preview) setMigrationPreview(migJson.preview);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadAll();
    });
    return () => {
      active = false;
    };
  }, [loadAll]);

  async function runIntegrityVerify() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/storage/verify", { method: "POST" });
      const data = await res.json();
      setVerifyResult(data);
      setNotice(data.ok ? "All R2 manifests & parts verified cleanly." : data.error || "Verification reported mismatches.");
    } finally {
      setBusy(false);
    }
  }

  async function runSupabaseMigration(dryRun: boolean) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/storage-migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const json = (await res.json()) as { copiedCount?: number; verifiedCount?: number; failedCount?: number; dryRun?: boolean; preview?: LegacyMigrationPreview };
      if (json.preview) setMigrationPreview(json.preview);
      setNotice(
        json.dryRun
          ? `Dry-run completed cleanly: ${json.preview?.pendingCopyCount ?? 0} Supabase document(s) ready for non-destructive archival copy to R2.`
          : `Archived ${json.copiedCount ?? 0} Supabase object(s) to R2 cleanly (${json.failedCount ?? 0} failures). Original Supabase objects remain untouched.`
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadLocalBackupJson() {
    const bundle = {
      formatVersion: "2026.1",
      source: "dailymotion_discovery_local_v1",
      exportedAt: new Date().toISOString(),
      datasets: {
        savedItems: merged.savedItems,
        collections: merged.collections,
        collectionItems: merged.collectionItems,
        savedSearches: merged.savedSearches,
        searchHistory: merged.searchHistory,
        researchNotes: merged.researchNotes,
      },
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dailymotion-local-recovery-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportRecoveryJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        datasets?: {
          savedItems?: unknown[];
          collections?: unknown[];
          collectionItems?: unknown[];
          savedSearches?: unknown[];
          searchHistory?: unknown[];
          researchNotes?: unknown[];
        };
      };
      const ds = parsed.datasets;
      if (!ds) throw new Error("Missing datasets wrapper in recovery JSON.");
      const db = getLocalDatabase();
      if (Array.isArray(ds.savedItems)) await db.putMany(LOCAL_STORES.SAVED_ITEMS, ds.savedItems);
      if (Array.isArray(ds.collections)) await db.putMany(LOCAL_STORES.COLLECTIONS, ds.collections);
      if (Array.isArray(ds.collectionItems)) await db.putMany(LOCAL_STORES.COLLECTION_ITEMS, ds.collectionItems);
      if (Array.isArray(ds.savedSearches)) await db.putMany(LOCAL_STORES.SAVED_SEARCHES, ds.savedSearches);
      if (Array.isArray(ds.searchHistory)) await db.putMany(LOCAL_STORES.SEARCH_HISTORY, ds.searchHistory);
      if (Array.isArray(ds.researchNotes)) await db.putMany(LOCAL_STORES.RESEARCH_NOTES, ds.researchNotes);
      await merged.refresh();
      setNotice("Imported recovery JSON into local IndexedDB. Click 'Save All to Cloud' to commit to R2 + Postgres.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to parse recovery JSON.");
    }
    e.target.value = "";
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">
            Cloudflare R2 + Manifest Explorer + Recovery
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">Storage & Integrity Center</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted-foreground)]">
            Inspect active immutable Cloudflare R2 generations, verify SHA-256 checksums via the Worker API, export
            full untrimmed ZIP/JSON backups, and manage non-destructive Supabase archive migrations.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || merged.syncing || admin === false}
            onClick={() => void merged.saveAll()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-black uppercase text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Save All Now ({merged.pendingCount} pending)
          </button>
          <a
            href="/api/storage/export"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase hover:border-[var(--primary)]"
          >
            <FileArchive className="h-4 w-4" aria-hidden="true" /> Download Cloud ZIP Backup
          </a>
        </div>
      </section>

      {notice && (
        <div className="rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-4 py-3 text-xs font-bold">
          {notice}
        </div>
      )}

      {admin === false && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs font-semibold">
          Sign in on{" "}
          <Link href="/settings" className="font-black underline">
            Settings / Admin Session
          </Link>{" "}
          to inspect server R2 generations and run Worker integrity checks. Offline local backup/restore below works without sign-in.
        </div>
      )}

      {/* Health & Status Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">R2 Worker Status</p>
          <p className="mt-1 flex items-center gap-1.5 text-lg font-black">
            <HardDrive className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
            {overview ? (overview.workerConfigured ? (overview.workerHealth?.ok ? "Online & Bound" : "Configured / Offline") : "Not Configured") : "—"}
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">Bucket: {overview?.bucketName ?? "dailymotion-discovery-private"}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">PostgreSQL Registry</p>
          <p className="mt-1 flex items-center gap-1.5 text-lg font-black">
            <Database className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
            {overview ? (overview.dbReachable ? "Connected" : "Unreachable") : "—"}
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">Owner scope: {overview?.ownerId ?? "admin"}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">R2 Objects / Bytes</p>
          <p className="mt-1 text-lg font-black">{overview?.r2ObjectCount ?? 0} objects</p>
          <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{overview?.r2TotalBytes ?? 0} bytes stored</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">Local Outbox / Journals</p>
          <p className="mt-1 text-lg font-black">{merged.pendingCount} pending</p>
          <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
            {merged.interruptedJournals.length} interrupted journal(s)
          </p>
        </div>
      </div>

      {/* Dataset Generations Table */}
      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Canonical R2 Dataset Generations</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Each Save All publishes immutable SHA-256 verified parts under `generations/&lt;id&gt;/` before flipping `version.json`.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void loadAll()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-bold"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Refresh
            </button>
            <button
              type="button"
              disabled={busy || admin === false}
              onClick={() => void runIntegrityVerify()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase hover:border-[var(--primary)] disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" /> Verify R2 SHA-256
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[10px] font-black uppercase text-[var(--muted-foreground)]">
                <th className="py-2 pr-3">Dataset</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Active Generation</th>
                <th className="py-2 pr-3">Records</th>
                <th className="py-2 pr-3">Aggregate SHA-256</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(overview?.datasets ?? []).map((ds) => (
                <tr key={ds.datasetSlug}>
                  <td className="py-2.5 pr-3 font-black">{ds.datasetSlug}</td>
                  <td className="py-2.5 pr-3">{ds.source}</td>
                  <td className="py-2.5 pr-3 font-mono text-[11px]">{ds.activeGenerationId ?? "—"}</td>
                  <td className="py-2.5 pr-3 font-bold">{ds.recordCount}</td>
                  <td className="py-2.5 pr-3 font-mono text-[11px]">
                    {ds.activeAggregateSha ? `${ds.activeAggregateSha.slice(0, 18)}…` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {verifyResult && (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3 text-xs">
            <p className="font-black">
              Integrity Check: {verifyResult.verifiedDatasets} verified · {verifyResult.failedDatasets} failed
            </p>
            {verifyResult.results.map((r) => (
              <p key={r.datasetSlug} className="mt-1 flex items-center gap-1.5">
                {r.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
                )}
                <span>
                  {r.datasetSlug} ({r.generationId}): {r.verifiedParts} parts verified {r.reason ? `— ${r.reason}` : ""}
                </span>
              </p>
            ))}
          </div>
        )}
      </section>

      {/* Local Disaster Recovery + Non-Destructive Supabase Archive Migration */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-lg font-black">Offline IndexedDB Disaster Recovery</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Export an untrimmed full JSON bundle directly from browser IndexedDB or import a previous backup file cleanly.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={downloadLocalBackupJson}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase hover:border-[var(--primary)]"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export Offline JSON
            </button>
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase hover:border-[var(--primary)]">
              <Upload className="h-4 w-4" aria-hidden="true" /> Import Recovery JSON
              <input type="file" accept=".json,application/json" onChange={(e) => void handleImportRecoveryJson(e)} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => {
                void merged.coordinator.recoverInterruptedSyncs().then((res) => {
                  setNotice(`Recovered ${res.recoveredCount} interrupted journal(s); ${res.pendingOpsCount} outbox operation(s) queued.`);
                });
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-bold"
            >
              Repair Interrupted Journals
            </button>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-lg font-black">Legacy Supabase Storage → R2 Archive</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Non-destructive audit &amp; copy utility from `application-data` into R2 `legacy-supabase-archive/`. Existing
            Supabase objects are NEVER deleted.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded border border-[var(--border)] bg-[var(--surface-container-low)] p-2">
              <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">Registered</p>
              <p className="mt-1 font-black">{migrationPreview?.totalRegisteredDocuments ?? 0}</p>
            </div>
            <div className="rounded border border-[var(--border)] bg-[var(--surface-container-low)] p-2">
              <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">Archived</p>
              <p className="mt-1 font-black text-emerald-600 dark:text-emerald-400">
                {migrationPreview?.alreadyArchivedInR2 ?? 0}
              </p>
            </div>
            <div className="rounded border border-[var(--border)] bg-[var(--surface-container-low)] p-2">
              <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">Pending Copy</p>
              <p className="mt-1 font-black">{migrationPreview?.pendingCopyCount ?? 0}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || admin === false}
              onClick={() => void runSupabaseMigration(true)}
              className="min-h-9 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase disabled:opacity-50"
            >
              Dry-Run Audit
            </button>
            <button
              type="button"
              disabled={busy || admin === false || !migrationPreview?.workerConfigured}
              onClick={() => void runSupabaseMigration(false)}
              className="min-h-9 rounded-md bg-primary px-3 text-xs font-black uppercase text-primary-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              Copy Verified Archive to R2
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
