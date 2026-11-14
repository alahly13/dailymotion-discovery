// CloudSyncPanel — local-first IndexedDB Outbox + Cloudflare R2 + PostgreSQL sync panel (admin only).
//
// Displays real pending outbox counts, interrupted-sync recovery banners, verified
// SaveReceipt stages (LOCAL_SAVED -> QUEUED_FOR_SYNC -> R2_VERIFIED -> CLOUD_COMMITTED),
// and triggers two-phase Save All or Cloud Hydrate without claiming synced early.

"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudDownload, CloudUpload, Database, HardDrive, RefreshCw } from "lucide-react";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import { formatSaveReceiptStageLabel, type SaveReceipt } from "@/lib/sync/save-receipt";
import type { StorageOverviewResult } from "@/lib/storage/storage-explorer-service";

export function CloudSyncPanel() {
  const merged = useMergedDataset();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<StorageOverviewResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<SaveReceipt | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const session = (await (await fetch("/api/admin/session")).json()) as { authenticated?: boolean };
      if (session.authenticated !== true) {
        setAdmin(false);
        return;
      }
      setAdmin(true);
      const res = await fetch("/api/sync/status", { cache: "no-store" });
      if (res.ok) {
        setOverview((await res.json()) as StorageOverviewResult);
      }
    } catch {
      setAdmin((prev) => prev ?? false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadStatus();
    });
    return () => {
      active = false;
    };
  }, [loadStatus]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (merged.pendingCount > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [merged.pendingCount]);

  async function handleSaveAll() {
    setStatusMessage(null);
    const receipt = await merged.saveAll();
    setActiveReceipt(receipt);
    setStatusMessage(
      receipt.stage === "CLOUD_COMMITTED"
        ? `Committed (${receipt.targetBackend}) · cleared ${receipt.counts.pendingOperationsCleared} queued ops.`
        : receipt.errorMessage || "Sync failed — all drafts kept safely in IndexedDB outbox."
    );
    void loadStatus();
  }

  async function handleHydrate() {
    setStatusMessage(null);
    try {
      const result = await merged.hydrateCloud();
      setStatusMessage(`Hydrated ${result.mergedCount} merged records from ${result.payload.source}.`);
      void loadStatus();
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Hydration failed.");
    }
  }

  const displayedReceipt = activeReceipt ?? merged.lastReceipt;

  return (
    <section
      aria-label="Cloud synchronization and R2 status"
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--primary)]">
            Local-First IndexedDB + Cloudflare R2 Sync
          </p>
          <h2 className="mt-1 text-xl font-black">Workspace Persistence & Outbox</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Changes commit immediately to browser IndexedDB (`dailymotion_discovery_local_v1`) and queue in an
            outbox until verified by the Cloudflare Worker and database registry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={merged.hydrating || admin === false}
            onClick={() => void handleHydrate()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase hover:border-[var(--primary)] disabled:opacity-50"
          >
            <CloudDownload className="h-4 w-4" aria-hidden="true" />
            {merged.hydrating ? "Hydrating..." : "Pull Cloud State"}
          </button>
          <button
            type="button"
            disabled={merged.syncing || admin === false}
            onClick={() => void handleSaveAll()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-black uppercase text-primary-foreground hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            {merged.syncing ? "Verifying & Committing..." : `Save All to Cloud (${merged.pendingCount} pending)`}
          </button>
        </div>
      </div>

      {admin === false && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold">
          Sign in on{" "}
          <Link href="/settings" className="font-black underline">
            Settings / Admin Session
          </Link>{" "}
          to enable Cloudflare R2 & PostgreSQL synchronization. Local IndexedDB saves continue working offline.
        </div>
      )}

      {merged.interruptedJournals.length > 0 && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <span>
            Detected {merged.interruptedJournals.length} interrupted sync session(s). Your queued changes were safely
            preserved in IndexedDB outbox — click <strong>Save All to Cloud</strong> to complete verification.
          </span>
        </div>
      )}

      {/* Local & Cloud Telemetry Grid */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3">
          <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">Saved Items</p>
          <p className="mt-1 text-xl font-black">{merged.savedItems.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3">
          <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">Collections</p>
          <p className="mt-1 text-xl font-black">{merged.collections.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3">
          <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">Saved Presets</p>
          <p className="mt-1 text-xl font-black">{merged.savedSearches.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3">
          <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">Search History</p>
          <p className="mt-1 text-xl font-black">{merged.searchHistory.length}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3">
          <p className="text-[10px] font-black uppercase text-[var(--muted-foreground)]">Outbox Queue</p>
          <p className={`mt-1 text-xl font-black ${merged.pendingCount > 0 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"}`}>
            {merged.pendingCount}
          </p>
        </div>
      </div>

      {/* Infrastructure & Receipt Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <HardDrive className="h-3.5 w-3.5" aria-hidden="true" />
            R2 Worker:{" "}
            <strong className={overview?.workerHealth?.ok ? "text-emerald-600 dark:text-emerald-400" : ""}>
              {overview ? (overview.workerConfigured ? (overview.workerHealth?.ok ? "Healthy" : "Unreachable") : "Not configured") : "—"}
            </strong>
          </span>
          <span className="inline-flex items-center gap-1">
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            Postgres:{" "}
            <strong className={overview?.dbReachable ? "text-emerald-600 dark:text-emerald-400" : ""}>
              {overview ? (overview.dbReachable ? "Connected" : "Unavailable") : "—"}
            </strong>
          </span>
          {displayedReceipt && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--primary)]" aria-hidden="true" />
              Last Receipt: <strong>{formatSaveReceiptStageLabel(displayedReceipt.stage)}</strong>
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadStatus()}
            className="inline-flex items-center gap-1 font-bold hover:text-[var(--foreground)]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" /> Refresh Status
          </button>
          <Link href="/storage" className="font-black text-[var(--primary)] hover:underline">
            Open Storage & Manifest Explorer →
          </Link>
        </div>
      </div>

      {statusMessage && (
        <p className="mt-2 text-xs font-bold text-[var(--foreground)]" aria-live="polite">
          {statusMessage}
        </p>
      )}
    </section>
  );
}
