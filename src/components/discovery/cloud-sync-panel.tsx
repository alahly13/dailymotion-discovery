// CloudSyncPanel — one-click Save of local drafts to Supabase (admin only).
//
// What this controls: pending-count display, batch commit, retry, server
// state, and honest saved-vs-pending status. Browser state is the DRAFT
// layer (survives refresh via localStorage); nothing is shown as synced
// until POST /api/cloud/batch-commit confirms. Same idempotency key is
// reused across retries of one logical batch (no duplicates).
// Scope: /workspace. Future agents: collections UI feeds `collections` here.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";
import type { BatchCommitResult } from "@/lib/persistence/batch-save/commit";

interface SyncState {
  ok: boolean;
  savedCount?: number;
  historyCount?: number;
  historyByVersion?: { v1: number; v2: number };
  collectionCount?: number;
  lastCommit?: { idempotencyKey: string; status: string; completedAt: string | null } | null;
  error?: string;
}

export function CloudSyncPanel() {
  const workspace = useDiscoveryWorkspace();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [server, setServer] = useState<SyncState | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BatchCommitResult | null>(null);

  const refreshServer = useCallback(async () => {
    try {
      const session = (await (await fetch("/api/admin/session")).json()) as { authenticated?: boolean };
      setAdmin(session.authenticated === true);
      if (session.authenticated !== true) {
        setServer(null);
        return;
      }
      const state = (await (await fetch("/api/cloud/sync-state")).json()) as SyncState;
      setServer(state.ok ? state : { ok: false, error: state.error ?? "Sync state unavailable." });
    } catch {
      setAdmin(null);
      setServer(null);
    }
  }, []);

  useEffect(() => {
    void refreshServer();
  }, [refreshServer]);

  // Warn before leaving with unsaved drafts (data lives only in this browser).
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (useDiscoveryWorkspace.getState().dirtyOps > 0) event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setResult(null);
    try {
      const state = useDiscoveryWorkspace.getState();
      const idempotencyKey = state.ensureBatchKey();
      const body = {
        idempotencyKey,
        savedTitles: state.savedItems.map(({ item }) => ({
          platform: "dailymotion",
          platformVideoId: item.id,
          resourceType: item.kind,
          title: item.title,
          url: item.url,
          thumbnailUrl: item.thumbnail,
          description: item.description,
          durationSeconds: item.duration,
          language: item.language,
          ownerName: item.ownerName,
          apiVersion: item.apiVersion,
        })),
        collections: [],
        history: state.history.map((h) => ({
          id: h.id,
          apiVersion: h.version,
          query: h.params.q ?? h.label,
          resource: h.resource,
          mode: h.params.mode ?? "search",
          params: h.params,
          sort: h.params.sort,
          pageSize: Number(h.params.pageSize) || null,
          status: "completed" as const,
          resultCount: h.resultCount,
          submittedAt: new Date(h.createdAt).toISOString(),
        })),
        includeSnapshot: true,
      };
      const response = await fetch("/api/cloud/batch-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as BatchCommitResult;
      setResult(data);
      if (data.ok) {
        state.markSynced();
        await refreshServer();
      }
    } catch {
      setResult({ ok: false, idempotencyKey: "", replayed: false, savedUpserts: 0, historyAppended: 0, snapshotPath: null, snapshotChecksum: null, error: "Save request failed (network)." });
    } finally {
      setSaving(false);
    }
  }, [refreshServer, saving]);

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5" aria-label="Cloud sync">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-black">Sync to Supabase</h2>
        <span className={`rounded px-2 py-0.5 text-[11px] font-black uppercase ${workspace.dirtyOps > 0 ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>
          {workspace.dirtyOps > 0 ? `${workspace.dirtyOps} pending` : "No pending changes"}
        </span>
        <span className="ml-auto text-xs text-[var(--muted-foreground)]">
          Last sync: {workspace.lastSyncedAt ? new Date(workspace.lastSyncedAt).toLocaleString() : "never"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted-foreground)]">
        Local edits are drafts in this browser until Save confirms. Server data:{" "}
        {server?.ok ? `${server.savedCount} saved titles, ${server.historyCount} history (${server.historyByVersion?.v1} v1 / ${server.historyByVersion?.v2} v2), ${server.collectionCount} collections` : "unavailable"}.
        {server?.lastCommit ? ` Last commit ${server.lastCommit.status} at ${server.lastCommit.completedAt ? new Date(server.lastCommit.completedAt).toLocaleString() : "—"}.` : ""}
      </p>
      {admin === false && (
        <p className="mt-2 text-sm">Admin sign-in required to sync. <a href="/admin/login" className="font-bold text-[var(--primary)] hover:underline">Log in</a></p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || admin === false || workspace.dirtyOps === 0}
          aria-busy={saving}
          className="min-h-11 rounded-md bg-[var(--primary)] px-5 text-sm font-black text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save to Supabase"}
        </button>
        {workspace.dirtyOps > 0 && (
          <button type="button" onClick={() => workspace.acknowledgePending()} title="Resets the pending counter only — local data is kept" className="min-h-11 rounded-md border border-[var(--border)] px-4 text-xs font-black uppercase">
            Dismiss pending flag
          </button>
        )}
      </div>
      {result && (
        <div className={`mt-3 rounded-md border p-3 text-xs leading-5 ${result.ok ? "border-emerald-500/50 bg-emerald-500/10" : "border-red-500/50 bg-red-500/10"}`} aria-live="polite">
          {result.ok ? (
            <p><strong>Saved{result.replayed ? " (replayed, no duplicates)" : ""}:</strong> {result.savedUpserts} titles, {result.historyAppended} history rows{result.snapshotPath ? `, snapshot ${result.snapshotPath}` : ""}.</p>
          ) : (
            <>
              <p className="font-bold">Save failed: {result.error}</p>
              {result.remedy && <p>{result.remedy}</p>}
              <button type="button" onClick={() => void save()} className="mt-2 min-h-9 rounded-md bg-[var(--primary)] px-3 font-black text-white">
                Retry (same batch key — safe)
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
