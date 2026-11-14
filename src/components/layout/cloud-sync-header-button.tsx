"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Cloud, CloudUpload, Loader2, RefreshCw } from "lucide-react";
import { executeUnifiedR2CloudSync, type UnifiedSyncResult } from "@/lib/sync/unified-cloud-sync";
import { cn } from "@/lib/utils/cn";

export function CloudSyncHeaderButton() {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<UnifiedSyncResult | null>(null);
  const [showToast, setShowToast] = useState(false);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setShowToast(false);

    try {
      const result = await executeUnifiedR2CloudSync();
      setLastResult(result);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 5000);
    } catch (err) {
      setLastResult({
        ok: false,
        error: err instanceof Error ? err.message : "Sync encountered an unexpected error.",
        savedTitlesCount: 0,
        workspaceSynced: false,
        syncedAt: new Date().toISOString(),
      });
      setShowToast(true);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        title="Synchronize all owner-scoped datasets, Saved Titles, and workspace history to Cloudflare R2"
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition shadow-xs cursor-pointer select-none",
          syncing
            ? "border-sky-500/50 bg-sky-500/10 text-sky-400 opacity-90 cursor-wait"
            : lastResult?.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              : lastResult && !lastResult.ok
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                : "border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 hover:border-sky-500/60"
        )}
      >
        {syncing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400 shrink-0" />
            <span className="hidden sm:inline">Syncing to R2...</span>
            <span className="sm:hidden">Syncing...</span>
          </>
        ) : lastResult?.ok ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Cloud Synced</span>
            <span className="sm:hidden">Synced</span>
          </>
        ) : lastResult && !lastResult.ok ? (
          <>
            <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Retry R2 Sync</span>
            <span className="sm:hidden">Retry</span>
          </>
        ) : (
          <>
            <CloudUpload className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span className="hidden sm:inline font-black tracking-tight">Sync to Cloudflare R2</span>
            <span className="sm:hidden">Sync R2</span>
          </>
        )}
      </button>

      {/* Ephemeral Feedback Toast */}
      {showToast && lastResult && (
        <div
          role="status"
          className={cn(
            "absolute right-0 top-10 z-50 w-72 rounded-xl border p-3 shadow-2xl backdrop-blur-xl text-xs transition-all animate-in fade-in slide-in-from-top-2",
            lastResult.ok
              ? "border-emerald-500/30 bg-[var(--surface)] text-emerald-400 dark:bg-black/95"
              : "border-amber-500/30 bg-[var(--surface)] text-amber-400 dark:bg-black/95"
          )}
        >
          <div className="flex items-start gap-2.5">
            {lastResult.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            )}
            <div className="flex-1 space-y-1">
              <p className="font-bold text-[var(--foreground)]">
                {lastResult.ok ? "R2 Cloud Sync Verified" : "Sync Notice"}
              </p>
              <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                {lastResult.ok
                  ? "All owner-scoped modifications, Saved Titles, and workspace datasets committed to Cloudflare R2 bucket."
                  : lastResult.error || "Unable to reach R2 Worker. Local data is safely retained in IndexedDB."}
              </p>
              <p className="text-[10px] text-[var(--muted-foreground)] font-mono">
                {new Date(lastResult.syncedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
