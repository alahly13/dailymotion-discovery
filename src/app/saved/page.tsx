"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowRight, BookmarkMinus, Cloud, Database, FolderPlus, Search, Star, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";

interface CloudCollection {
  id: string;
  name: string;
  description: string | null;
  _count?: { savedVideos: number };
}

interface CloudSavedRow {
  id: string;
  videoId: string;
  collectionId: string | null;
  favorite: boolean;
  apiVersion: string | null;
  savedAt: string;
  video: {
    id: string;
    platform: string;
    platformVideoId: string;
    resourceType: string;
    title: string;
    url: string | null;
    thumbnailUrl: string | null;
    description: string | null;
    durationSeconds: number | null;
    language: string | null;
    ownerName: string | null;
    channelName: string | null;
  };
}

export default function SavedPage() {
  const workspace = useDiscoveryWorkspace();
  const merged = useMergedDataset();
  const [search, setSearch] = useState("");
  const [versionFilter, setVersionFilter] = useState<"all" | "v1" | "v2">("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string>("all");

  const [admin, setAdmin] = useState<boolean | null>(null);
  const [cloudCollections, setCloudCollections] = useState<CloudCollection[]>([]);
  const [cloudTitles, setCloudTitles] = useState<CloudSavedRow[]>([]);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [busyAction, setBusyAction] = useState(false);

  const loadCloudLibrary = useCallback(async () => {
    setLoadingCloud(true);
    setCloudError(null);
    try {
      const session = (await (await fetch("/api/admin/session")).json()) as { authenticated?: boolean };
      if (session.authenticated !== true) {
        setAdmin(false);
        setCloudCollections([]);
        setCloudTitles([]);
        return;
      }
      setAdmin(true);
      const [colRes, titlesRes] = await Promise.all([
        fetch("/api/cloud/collections"),
        fetch("/api/cloud/saved-titles"),
      ]);
      const colData = (await colRes.json()) as { ok?: boolean; collections?: CloudCollection[]; error?: string };
      const titlesData = (await titlesRes.json()) as { ok?: boolean; items?: CloudSavedRow[]; error?: string };
      if (!colRes.ok || !colData.ok || !titlesRes.ok || !titlesData.ok) {
        setCloudError(colData.error ?? titlesData.error ?? "Cloud saved library is temporarily unavailable.");
        return;
      }
      setCloudCollections(colData.collections ?? []);
      setCloudTitles(titlesData.items ?? []);
    } catch {
      setCloudError("Could not reach cloud library routes.");
    } finally {
      setLoadingCloud(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const session = (await (await fetch("/api/admin/session")).json()) as { authenticated?: boolean };
        if (!active) return;
        if (session.authenticated !== true) {
          setAdmin(false);
          return;
        }
        setAdmin(true);
        const [colRes, titlesRes] = await Promise.all([
          fetch("/api/cloud/collections"),
          fetch("/api/cloud/saved-titles"),
        ]);
        const colData = (await colRes.json()) as { ok?: boolean; collections?: CloudCollection[]; error?: string };
        const titlesData = (await titlesRes.json()) as { ok?: boolean; items?: CloudSavedRow[]; error?: string };
        if (!active) return;
        if (!colRes.ok || !colData.ok || !titlesRes.ok || !titlesData.ok) {
          setCloudError(colData.error ?? titlesData.error ?? "Cloud saved library unavailable.");
          return;
        }
        setCloudCollections(colData.collections ?? []);
        setCloudTitles(titlesData.items ?? []);
      } catch {
        if (active) setCloudError("Cloud library check failed.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function createNewCollection() {
    if (!newCollectionName.trim() || busyAction) return;
    setBusyAction(true);
    setCloudError(null);
    try {
      const response = await fetch("/api/cloud/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCollectionName.trim() }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        setCloudError(data.error ?? "Failed to create collection.");
        return;
      }
      setNewCollectionName("");
      await loadCloudLibrary();
    } finally {
      setBusyAction(false);
    }
  }

  async function removeCloudCollection(id: string) {
    if (busyAction) return;
    setBusyAction(true);
    try {
      await fetch(`/api/cloud/collections/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (selectedCollection === id) setSelectedCollection("all");
      await loadCloudLibrary();
    } finally {
      setBusyAction(false);
    }
  }

  async function updateCloudSavedRow(savedVideoId: string, patch: { favorite?: boolean; collectionId?: string | null }) {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const res = await fetch("/api/cloud/saved-titles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedVideoId, ...patch }),
      });
      if (res.ok) await loadCloudLibrary();
    } finally {
      setBusyAction(false);
    }
  }

  async function deleteCloudSavedRow(savedVideoId: string) {
    if (busyAction) return;
    setBusyAction(true);
    try {
      const res = await fetch(`/api/cloud/saved-titles?id=${encodeURIComponent(savedVideoId)}`, { method: "DELETE" });
      if (res.ok) await loadCloudLibrary();
    } finally {
      setBusyAction(false);
    }
  }

  const needle = search.trim().toLowerCase();

  const filteredCloudTitles = useMemo(() => {
    return cloudTitles.filter((row) => {
      if (versionFilter !== "all" && row.apiVersion !== versionFilter) return false;
      if (favoritesOnly && !row.favorite) return false;
      if (selectedCollection === "none" && row.collectionId !== null) return false;
      if (selectedCollection !== "all" && selectedCollection !== "none" && row.collectionId !== selectedCollection) return false;
      if (needle) {
        const hay = `${row.video.title} ${row.video.platformVideoId} ${row.video.ownerName ?? ""} ${row.video.channelName ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [cloudTitles, favoritesOnly, needle, selectedCollection, versionFilter]);

  const workspaceSavedItems = workspace.savedItems;
  const filteredLocalItems = useMemo(() => {
    const byKey = new Map<string, { item: (typeof workspaceSavedItems)[number]["item"]; savedAt: string }>();
    for (const entry of workspaceSavedItems) {
      byKey.set(`${entry.item.apiVersion}:${entry.item.kind}:${entry.item.id}`, {
        item: entry.item,
        savedAt: new Date(entry.savedAt).toISOString(),
      });
    }
    for (const rec of merged.savedItems) {
      byKey.set(rec.compositeKey, { item: rec.snapshot, savedAt: rec.savedAt });
    }
    return Array.from(byKey.values()).filter(({ item }) => {
      if (versionFilter !== "all" && item.apiVersion !== versionFilter) return false;
      if (favoritesOnly && !merged.favoriteKeys.has(`${item.apiVersion}:${item.kind}:${item.id}`)) return false;
      if (needle) {
        const hay = `${item.title} ${item.id} ${item.ownerName ?? ""} ${item.category ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [favoritesOnly, merged.favoriteKeys, merged.savedItems, needle, versionFilter, workspaceSavedItems]);

  return (
    <div className="space-y-8">
      <section className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Saved / Library</p>
          <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">Saved Library & Collections</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-foreground)]">
            Manage browser-saved items alongside persisted PostgreSQL titles, favorite flags, and collections.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/channels"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-black text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
          >
            Open Saved Channels
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/collections"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-4 text-sm font-bold hover:border-[var(--border-strong)]"
          >
            Collections ({merged.collections.length})
          </Link>
          <Link
            href="/saved-searches"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-4 text-sm font-bold hover:border-[var(--border-strong)]"
          >
            Presets ({merged.savedSearches.length})
          </Link>
          <Link
            href="/workspace"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-4 text-sm font-bold hover:border-[var(--border-strong)]"
          >
            Workspace Sync ({merged.pendingCount})
          </Link>
        </div>
      </section>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
              <Archive className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-black">Library Filter</h2>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                Browser saved: <strong>{workspace.savedItems.length}</strong>
                {admin ? ` · Cloud saved: ${cloudTitles.length} · Collections: ${cloudCollections.length}` : " · Sign in as admin to manage Postgres collections"}
              </p>
            </div>
          </div>
          {admin === false ? (
            <Link href="/admin/login" className="text-xs font-black uppercase text-[var(--primary)] hover:underline">
              Admin sign-in for cloud sync
            </Link>
          ) : (
            <Button type="button" variant="ghost" onClick={() => void loadCloudLibrary()} disabled={loadingCloud}>
              <Cloud className="h-4 w-4" aria-hidden="true" />
              {loadingCloud ? "Refreshing..." : "Refresh Cloud"}
            </Button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--muted-foreground)]" aria-hidden="true" />
            <Input
              className="pl-9"
              placeholder="Filter saved titles by title, ID, owner, or channel..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-1">
            {(["all", "v1", "v2"] as const).map((ver) => (
              <button
                key={ver}
                type="button"
                onClick={() => setVersionFilter(ver)}
                className={`min-h-9 rounded px-3 text-xs font-black uppercase ${versionFilter === ver ? "bg-primary text-primary-foreground shadow-xs" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
              >
                {ver}
              </button>
            ))}
          </div>
          {admin ? (
            <button
              type="button"
              onClick={() => setFavoritesOnly((prev) => !prev)}
              aria-pressed={favoritesOnly}
              className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-xs font-black uppercase ${
                favoritesOnly
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)]"
              }`}
            >
              <Star className="h-4 w-4" aria-hidden="true" />
              Favorites
            </button>
          ) : null}
        </div>
        {cloudError ? <p className="text-xs font-bold text-amber-600">{cloudError}</p> : null}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-4">
          <Card className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">Collections</h2>
            <div className="space-y-1.5">
              {[
                { id: "all", label: "All Cloud Saves", count: cloudTitles.length },
                { id: "none", label: "Uncategorized", count: cloudTitles.filter((t) => !t.collectionId).length },
              ].map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setSelectedCollection(col.id)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-bold ${
                    selectedCollection === col.id
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-[var(--surface-container-low)] text-[var(--foreground)] hover:bg-[var(--surface-container-high)]"
                  }`}
                >
                  <span>{col.label}</span>
                  <span>{col.count}</span>
                </button>
              ))}
              {cloudCollections.map((col) => (
                <div key={col.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCollection(col.id)}
                    className={`flex flex-1 items-center justify-between rounded-md px-3 py-2 text-left text-xs font-bold ${
                      selectedCollection === col.id
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-[var(--surface-container-low)] text-[var(--foreground)] hover:bg-[var(--surface-container-high)]"
                    }`}
                  >
                    <span className="truncate">{col.name}</span>
                    <span>{col._count?.savedVideos ?? 0}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete collection ${col.name}`}
                    onClick={() => void removeCloudCollection(col.id)}
                    className="rounded-md border border-[var(--border)] p-2 text-[var(--muted-foreground)] hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
            {admin ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void createNewCollection();
                }}
                className="space-y-2 border-t border-[var(--border)] pt-3"
              >
                <Input
                  placeholder="New collection name..."
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                />
                <Button type="submit" variant="secondary" className="w-full" disabled={busyAction || !newCollectionName.trim()}>
                  <FolderPlus className="h-4 w-4" aria-hidden="true" />
                  Create Collection
                </Button>
              </form>
            ) : null}
          </Card>

          <Card>
            <Database className="h-5 w-5 text-[var(--primary)]" aria-hidden="true" />
            <h2 className="mt-3 text-base font-black">Saved Channel Catalogs</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">
              Combined source manifests, page attempts, and deep-fetch checkpoints live under Channels.
            </p>
            <Link href="/channels" className="mt-3 inline-flex items-center gap-1.5 text-xs font-black text-[var(--primary)] hover:underline">
              Browse channels
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Card>
        </aside>

        <div className="space-y-6">
          {admin && filteredCloudTitles.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-lg font-black">Cloud Persisted Titles ({filteredCloudTitles.length})</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {filteredCloudTitles.map((row) => (
                  <Card key={row.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {row.video.url ? (
                          <a href={row.video.url} target="_blank" rel="noreferrer noopener" className="line-clamp-2 font-black hover:underline">
                            {row.video.title}
                          </a>
                        ) : (
                          <h3 className="line-clamp-2 font-black">{row.video.title}</h3>
                        )}
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          {(row.apiVersion ?? "v1").toUpperCase()} · {row.video.platformVideoId}
                          {row.video.ownerName ? ` · ${row.video.ownerName}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Toggle favorite"
                        onClick={() => void updateCloudSavedRow(row.id, { favorite: !row.favorite })}
                        className={`rounded-md border p-2 ${row.favorite ? "border-amber-500/60 bg-amber-500/15 text-amber-500" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}
                      >
                        <Star className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Collection assignment"
                        value={row.collectionId ?? ""}
                        onChange={(e) => void updateCloudSavedRow(row.id, { collectionId: e.target.value || null })}
                        className="min-h-9 flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-semibold"
                      >
                        <option value="">Uncategorized</option>
                        {cloudCollections.map((col) => (
                          <option key={col.id} value={col.id}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void deleteCloudSavedRow(row.id)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-3 text-xs font-bold text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Remove
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-lg font-black">Browser Draft Saved Items ({filteredLocalItems.length})</h2>
            {filteredLocalItems.length === 0 ? (
              <Card className="text-sm text-[var(--muted-foreground)]">
                No matching browser-saved items. Save items from Search, AI Search, Channel Explorer, or Pull from Supabase on{" "}
                <Link href="/workspace" className="font-bold text-[var(--primary)] hover:underline">
                  /workspace
                </Link>
                .
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredLocalItems.map(({ item, savedAt }) => (
                  <Card key={`${item.apiVersion}:${item.kind}:${item.id}`} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer noopener" className="line-clamp-2 font-black hover:underline">
                            {item.title}
                          </a>
                        ) : (
                          <h3 className="line-clamp-2 font-black">{item.title}</h3>
                        )}
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          <strong className="text-[var(--primary)]">{item.apiVersion.toUpperCase()}</strong> · {item.kind} · {item.id} · {new Date(savedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${item.title}`}
                        onClick={() => {
                          workspace.removeItem(item.apiVersion, item.kind, item.id);
                          void merged.coordinator.toggleSaveItem(item);
                        }}
                        className="rounded-md border border-[var(--border)] p-2 text-[var(--muted-foreground)] hover:text-red-500"
                      >
                        <BookmarkMinus className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                    {item.description ? <p className="line-clamp-2 text-xs text-[var(--muted-foreground)]">{item.description}</p> : null}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
