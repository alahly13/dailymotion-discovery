// /playlists — Application-Managed Personal Playlists Workspace (2026)
//
// What this controls:
// 1. Creation and management of user-created playlists (distinct from Dailymotion platform playlists).
// 2. Full Playlist CRUD: Create, rename, edit description, view item count, timestamps, confirm destructive deletion.
// 3. Multi-resource support: Videos, Channels, Profiles, Users, Dailymotion Playlists, Livestreams.
// 4. Item management: Remove individual/bulk items, reorder items (up/down/position), move to another playlist.
// 5. In-playlist search and sorting (Custom position, title, date, duration, views).
// 6. Relational Postgres truth + local-first IndexedDB persistence with outbox sync.
//
// Scope: /playlists.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileCode2,
  FolderKanban,
  FolderPlus,
  Library,
  ListMusic,
  ListOrdered,
  Loader2,
  MoveRight,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Tv,
  X,
} from "lucide-react";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import type { LocalCollectionItemRecord, LocalCollectionRecord } from "@/lib/local-first/indexeddb-store";
import { RawJsonDrawer } from "@/components/discovery/raw-json-drawer";
import { canonicalDailymotionUrl, RESOURCE_TYPE_META } from "@/lib/resources/dailymotion-resource-taxonomy";
import { formatDuration, formatViews } from "@/components/discovery/result-card";

export default function PlaylistsPage() {
  const merged = useMergedDataset();

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistSearch, setPlaylistSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [itemSort, setItemSort] = useState<"position" | "title" | "newest" | "oldest" | "views" | "duration">("position");

  // New Playlist Form State
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Edit Playlist State
  const [editingPlaylist, setEditingPlaylist] = useState<LocalCollectionRecord | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Delete Confirmation State
  const [deletingPlaylist, setDeletingPlaylist] = useState<LocalCollectionRecord | null>(null);

  // Bulk Selection State
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set());
  const [bulkMoveTargetId, setBulkMoveTargetId] = useState<string>("");

  // Raw JSON Inspection State
  const [rawTarget, setRawTarget] = useState<{ title: string; payload: unknown } | null>(null);

  // User notification banner
  const [statusBanner, setStatusBanner] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showStatus = (text: string, type: "success" | "error" = "success") => {
    setStatusBanner({ text, type });
    setTimeout(() => setStatusBanner(null), 3000);
  };

  // Resolve currently active playlist
  const activePlaylist = useMemo(() => {
    if (merged.collections.length === 0) return null;
    if (selectedPlaylistId) {
      const found = merged.collections.find((c) => c.id === selectedPlaylistId);
      if (found) return found;
    }
    return merged.collections[0];
  }, [merged.collections, selectedPlaylistId]);

  // Filter playlists list by search text
  const filteredPlaylists = useMemo(() => {
    const q = playlistSearch.trim().toLowerCase();
    if (!q) return merged.collections;
    return merged.collections.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q))
    );
  }, [merged.collections, playlistSearch]);

  // Count items per playlist
  const itemCountsByPlaylist = useMemo(() => {
    const map = new Map<string, number>();
    for (const ci of merged.collectionItems) {
      map.set(ci.collectionId, (map.get(ci.collectionId) ?? 0) + 1);
    }
    return map;
  }, [merged.collectionItems]);

  // Resolve items for the active playlist with search & sort
  const activePlaylistItems = useMemo(() => {
    if (!activePlaylist) return [];
    const needle = itemSearch.trim().toLowerCase();

    const rawList = merged.collectionItems.filter((ci) => ci.collectionId === activePlaylist.id);

    // Apply text search
    const filtered = rawList.filter((ci) => {
      if (!needle) return true;
      const text = `${ci.snapshot.title} ${ci.snapshot.ownerName ?? ""} ${ci.note ?? ""} ${ci.itemKey}`.toLowerCase();
      return text.includes(needle);
    });

    // Apply sort
    return filtered.sort((a, b) => {
      if (itemSort === "position") return a.position - b.position;
      if (itemSort === "title") return a.snapshot.title.localeCompare(b.snapshot.title);
      if (itemSort === "newest") return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      if (itemSort === "oldest") return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      if (itemSort === "views") return (b.snapshot.views ?? 0) - (a.snapshot.views ?? 0);
      if (itemSort === "duration") return (b.snapshot.duration ?? 0) - (a.snapshot.duration ?? 0);
      return 0;
    });
  }, [activePlaylist, merged.collectionItems, itemSearch, itemSort]);

  // Create Playlist Handler
  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const created = await merged.coordinator.createCollection({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      setNewName("");
      setNewDesc("");
      setIsCreating(false);
      setSelectedPlaylistId(created.id);
      showStatus(`Created playlist "${created.name}".`);
    } catch {
      showStatus("Failed to create playlist.", "error");
    }
  };

  // Edit Playlist Handler
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlaylist || !editName.trim()) return;
    try {
      await merged.coordinator.updateCollection(editingPlaylist.id, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      setEditingPlaylist(null);
      showStatus("Playlist details updated.");
    } catch {
      showStatus("Failed to update playlist.", "error");
    }
  };

  // Delete Playlist Handler
  const handleConfirmDelete = async () => {
    if (!deletingPlaylist) return;
    try {
      const name = deletingPlaylist.name;
      await merged.coordinator.deleteCollection(deletingPlaylist.id);
      setDeletingPlaylist(null);
      setSelectedPlaylistId(null);
      showStatus(`Deleted playlist "${name}". Saved items remain preserved in your library.`);
    } catch {
      showStatus("Failed to delete playlist.", "error");
    }
  };

  // Reorder Item Handler (Move Up / Down)
  const handleReorder = async (itemKey: string, direction: "up" | "down") => {
    if (!activePlaylist) return;
    try {
      await merged.coordinator.reorderCollectionItem(activePlaylist.id, itemKey, direction);
    } catch {
      showStatus("Could not reorder item.", "error");
    }
  };

  // Remove Single Item Handler
  const handleRemoveItem = async (itemKey: string) => {
    if (!activePlaylist) return;
    try {
      await merged.coordinator.removeItemFromCollection(activePlaylist.id, itemKey);
      showStatus("Removed item from playlist.");
    } catch {
      showStatus("Could not remove item.", "error");
    }
  };

  // Bulk Remove Items Handler
  const handleBulkRemove = async () => {
    if (!activePlaylist || selectedItemKeys.size === 0) return;
    try {
      for (const itemKey of selectedItemKeys) {
        await merged.coordinator.removeItemFromCollection(activePlaylist.id, itemKey);
      }
      setSelectedItemKeys(new Set());
      showStatus(`Removed ${selectedItemKeys.size} items from playlist.`);
    } catch {
      showStatus("Failed to remove selected items.", "error");
    }
  };

  // Bulk Move Items Handler
  const handleBulkMove = async () => {
    if (!activePlaylist || !bulkMoveTargetId || selectedItemKeys.size === 0) return;
    try {
      for (const itemKey of selectedItemKeys) {
        await merged.coordinator.moveOrCopyCollectionItem({
          sourceCollectionId: activePlaylist.id,
          targetCollectionId: bulkMoveTargetId,
          itemKey,
          mode: "move",
        });
      }
      const targetName = merged.collections.find((c) => c.id === bulkMoveTargetId)?.name ?? "target playlist";
      setSelectedItemKeys(new Set());
      setBulkMoveTargetId("");
      showStatus(`Moved ${selectedItemKeys.size} items to "${targetName}".`);
    } catch {
      showStatus("Failed to move items.", "error");
    }
  };

  // Export Playlist to JSON or CSV
  const handleExport = (format: "json" | "csv") => {
    if (!activePlaylist) return;
    const filenameBase = activePlaylist.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "playlist";
    let content = "";
    let mime = "application/json";

    if (format === "json") {
      content = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          playlist: {
            id: activePlaylist.id,
            name: activePlaylist.name,
            description: activePlaylist.description,
            createdAt: activePlaylist.createdAt,
            updatedAt: activePlaylist.updatedAt,
          },
          itemCount: activePlaylistItems.length,
          items: activePlaylistItems.map((ci) => ({
            position: ci.position + 1,
            itemKey: ci.itemKey,
            apiVersion: ci.apiVersion,
            resourceType: ci.resourceType,
            title: ci.snapshot.title,
            ownerName: ci.snapshot.ownerName,
            url: ci.snapshot.url,
            thumbnail: ci.snapshot.thumbnail,
            duration: ci.snapshot.duration,
            views: ci.snapshot.views,
            note: ci.note,
            provenance: ci.provenance || ci.snapshot.provenance,
          })),
        },
        null,
        2
      );
    } else {
      mime = "text/csv";
      const rows = activePlaylistItems.map((ci) =>
        [
          ci.position + 1,
          `"${ci.itemKey.replaceAll('"', '""')}"`,
          ci.apiVersion,
          ci.resourceType,
          `"${(ci.snapshot.title || "").replaceAll('"', '""')}"`,
          `"${(ci.snapshot.ownerName || "").replaceAll('"', '""')}"`,
          ci.snapshot.duration ?? "",
          ci.snapshot.views ?? "",
          `"${(ci.note || "").replaceAll('"', '""')}"`,
          `"${(ci.snapshot.url || "").replaceAll('"', '""')}"`,
        ].join(",")
      );
      content = `\uFEFFPosition,ItemKey,ApiVersion,ResourceType,Title,Owner,DurationSeconds,ViewsTotal,Note,Url\r\n${rows.join("\r\n")}`;
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      {/* Page Title & Context Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">
            Workspace · Library
          </p>
          <h1 className="mt-1 text-3xl font-black sm:text-4xl flex items-center gap-3">
            <ListMusic className="h-8 w-8 text-[var(--primary)]" />
            Application-Managed Playlists
          </h1>
          <p className="mt-1.5 max-w-3xl text-xs sm:text-sm text-[var(--muted-foreground)]">
            Create, curate, reorder, and manage your own custom playlists across videos, channels, users, and livestreams.
            Distinct from Dailymotion provider playlists. Persisted in IndexedDB and synchronized with PostgreSQL.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-black uppercase text-primary-foreground shadow-xs hover:opacity-90 transition cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>New Playlist</span>
        </button>
      </div>

      {/* Status Alert Banner */}
      {statusBanner && (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-lg p-3 text-xs font-bold border animate-in fade-in-0 ${
            statusBanner.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400"
          }`}
        >
          {statusBanner.type === "success" ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{statusBanner.text}</span>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-12 gap-6 items-start">
        {/* Left Column: Playlist Index Sidebar (4 cols on lg, 3 on 2xl) */}
        <aside className="col-span-12 lg:col-span-4 2xl:col-span-3 space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                Your Playlists ({merged.collections.length})
              </h2>
            </div>

            {/* Playlist Search Filter */}
            <div className="relative">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={playlistSearch}
                onChange={(e) => setPlaylistSearch(e.target.value)}
                placeholder="Filter playlists..."
                className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] pl-8 pr-2.5 text-xs font-medium text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            {/* Playlists List */}
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
              {filteredPlaylists.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--muted-foreground)] space-y-2">
                  <p>No playlists found.</p>
                  <button
                    type="button"
                    onClick={() => setIsCreating(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Create one now</span>
                  </button>
                </div>
              ) : (
                filteredPlaylists.map((playlist) => {
                  const isSelected = activePlaylist?.id === playlist.id;
                  const count = itemCountsByPlaylist.get(playlist.id) ?? 0;
                  return (
                    <button
                      key={playlist.id}
                      type="button"
                      onClick={() => {
                        setSelectedPlaylistId(playlist.id);
                        setSelectedItemKeys(new Set());
                      }}
                      className={`w-full text-left rounded-lg p-3 transition border cursor-pointer ${
                        isSelected
                          ? "border-primary bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] shadow-xs"
                          : "border-transparent bg-[var(--surface-container-low)] hover:border-[var(--border)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs truncate ${isSelected ? "font-black text-primary" : "font-bold text-[var(--foreground)]"}`}>
                          {playlist.name}
                        </span>
                        <span className="rounded-full bg-[var(--surface-container-high)] px-2 py-0.5 text-[10px] font-bold shrink-0">
                          {count} {count === 1 ? "item" : "items"}
                        </span>
                      </div>
                      {playlist.description && (
                        <p className="mt-1 text-[11px] text-[var(--muted-foreground)] line-clamp-2">
                          {playlist.description}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* Right Column: Active Playlist Workspace (8 cols on lg, 9 on 2xl) */}
        <main className="col-span-12 lg:col-span-8 2xl:col-span-9 space-y-4">
          {!activePlaylist ? (
            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] p-8 text-center bg-[var(--card)]/40 space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-container-high)] text-primary">
                <ListMusic className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-black">No Playlist Selected</h2>
              <p className="max-w-md text-xs text-[var(--muted-foreground)]">
                Create a playlist or select one from the sidebar to view, manage, and reorder its items.
              </p>
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground shadow-xs hover:opacity-90 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create Playlist</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Playlist Header Card */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-[var(--foreground)]">{activePlaylist.name}</h2>
                      <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
                        {activePlaylistItems.length} {activePlaylistItems.length === 1 ? "resource" : "resources"}
                      </span>
                    </div>
                    {activePlaylist.description ? (
                      <p className="text-xs text-[var(--muted-foreground)] max-w-2xl">{activePlaylist.description}</p>
                    ) : (
                      <p className="text-xs italic text-[var(--muted-foreground)]">No description provided.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-[var(--muted-foreground)] font-mono">
                      <span>Created: {new Date(activePlaylist.createdAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>Updated: {new Date(activePlaylist.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Playlist Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlaylist(activePlaylist);
                        setEditName(activePlaylist.name);
                        setEditDesc(activePlaylist.description || "");
                      }}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold hover:border-primary transition cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit Details</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExport("json")}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold hover:bg-[var(--surface-container-high)] cursor-pointer"
                      title="Export playlist as JSON"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>JSON</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExport("csv")}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold hover:bg-[var(--surface-container-high)] cursor-pointer"
                      title="Export playlist as CSV"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>CSV</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingPlaylist(activePlaylist)}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 transition cursor-pointer"
                      title="Delete this playlist"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* In-Playlist Search & Sort Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3 text-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                      <input
                        type="text"
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder="Search within this playlist..."
                        className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] pl-8 pr-2.5 text-xs font-medium text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      />
                    </div>
                    {itemSearch && (
                      <button
                        type="button"
                        onClick={() => setItemSearch("")}
                        className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                      Sort:
                    </span>
                    <select
                      value={itemSort}
                      onChange={(e) => setItemSort(e.target.value as typeof itemSort)}
                      className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--foreground)] cursor-pointer"
                    >
                      <option value="position">Custom Order (Position)</option>
                      <option value="title">Title (A → Z)</option>
                      <option value="newest">Recently Added</option>
                      <option value="oldest">First Added</option>
                      <option value="views">Most Views</option>
                      <option value="duration">Longest Duration</option>
                    </select>
                  </div>
                </div>

                {/* Bulk Actions Bar */}
                {activePlaylistItems.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedItemKeys.size === activePlaylistItems.length) {
                          setSelectedItemKeys(new Set());
                        } else {
                          setSelectedItemKeys(new Set(activePlaylistItems.map((i) => i.itemKey)));
                        }
                      }}
                      className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 py-1 text-xs font-bold hover:border-primary cursor-pointer"
                    >
                      {selectedItemKeys.size === activePlaylistItems.length ? "Deselect All" : "Select All"}
                    </button>

                    {selectedItemKeys.size > 0 && (
                      <>
                        <span className="text-primary font-black">{selectedItemKeys.size} selected</span>

                        <button
                          type="button"
                          onClick={() => void handleBulkRemove()}
                          className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Remove Selected</span>
                        </button>

                        {merged.collections.filter((c) => c.id !== activePlaylist.id).length > 0 && (
                          <div className="flex items-center gap-1.5 ml-auto">
                            <select
                              value={bulkMoveTargetId}
                              onChange={(e) => setBulkMoveTargetId(e.target.value)}
                              className="h-7 rounded border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold"
                            >
                              <option value="">Move to playlist...</option>
                              {merged.collections
                                .filter((c) => c.id !== activePlaylist.id)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              disabled={!bulkMoveTargetId}
                              onClick={() => void handleBulkMove()}
                              className="inline-flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50 cursor-pointer"
                            >
                              <MoveRight className="h-3 w-3" />
                              <span>Move</span>
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Items List */}
              {activePlaylistItems.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] p-8 text-center bg-[var(--card)]/40 space-y-2">
                  <p className="font-bold text-sm">This playlist is currently empty</p>
                  <p className="text-xs text-[var(--muted-foreground)] max-w-sm">
                    Discover resources in Global Search or Link Explorer and click <strong>&quot;+ Playlist&quot;</strong> on any result card to add them here.
                  </p>
                  <Link
                    href="/global-search"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Go to Global Search</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activePlaylistItems.map((ci, idx) => {
                    const isSelected = selectedItemKeys.has(ci.itemKey);
                    const openUrl = canonicalDailymotionUrl(ci.snapshot.kind, ci.snapshot.id, ci.snapshot.url);
                    const isFirst = idx === 0;
                    const isLast = idx === activePlaylistItems.length - 1;

                    return (
                      <div
                        key={ci.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 rounded-xl border p-3.5 transition bg-[var(--card)] shadow-2xs ${
                          isSelected ? "border-primary bg-primary/5" : "border-[var(--border)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                        {/* Left: Checkbox + Reorder Controls + Position Badge */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedItemKeys((prev) => {
                                const next = new Set(prev);
                                if (next.has(ci.itemKey)) next.delete(ci.itemKey);
                                else next.add(ci.itemKey);
                                return next;
                              });
                            }}
                            className="h-4 w-4 rounded accent-primary cursor-pointer"
                          />

                          {/* Position Badge */}
                          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--surface-container-high)] text-[11px] font-black font-mono">
                            {idx + 1}
                          </span>

                          {/* Reorder Buttons (Only enabled when custom order active) */}
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              disabled={isFirst || itemSort !== "position"}
                              onClick={() => void handleReorder(ci.itemKey, "up")}
                              title="Move up in playlist"
                              className="rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)] disabled:opacity-20 cursor-pointer"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={isLast || itemSort !== "position"}
                              onClick={() => void handleReorder(ci.itemKey, "down")}
                              title="Move down in playlist"
                              className="rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)] disabled:opacity-20 cursor-pointer"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {/* Middle: Thumbnail + Metadata */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {ci.snapshot.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ci.snapshot.thumbnail}
                              alt=""
                              className="h-14 w-24 rounded-lg object-cover shrink-0 border border-[var(--border)]"
                            />
                          ) : (
                            <div className="flex h-14 w-24 items-center justify-center rounded-lg bg-[var(--surface-container-high)] text-[var(--muted-foreground)] shrink-0">
                              <Tv className="h-5 w-5" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-primary">
                                {ci.resourceType}
                              </span>
                              <span className="rounded bg-[var(--surface-container-high)] px-1.5 py-0.5 text-[9px] font-bold font-mono text-[var(--muted-foreground)]">
                                {ci.apiVersion.toUpperCase()}
                              </span>
                              {ci.snapshot.duration !== null && (
                                <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                                  {formatDuration(ci.snapshot.duration)}
                                </span>
                              )}
                              {ci.snapshot.views !== null && (
                                <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                                  {formatViews(ci.snapshot.views)}
                                </span>
                              )}
                            </div>

                            <p className="truncate text-xs font-bold text-[var(--foreground)]" title={ci.snapshot.title}>
                              {ci.snapshot.title}
                            </p>

                            {ci.snapshot.ownerName && (
                              <p className="truncate text-[11px] text-[var(--muted-foreground)]">
                                {ci.snapshot.ownerName}
                              </p>
                            )}

                            {ci.note && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                                Note: {ci.note}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {openUrl && (
                            <a
                              href={openUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              title="Open on Dailymotion"
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold text-primary hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Open</span>
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(openUrl || ci.snapshot.id)}
                            title="Copy link"
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setRawTarget({ title: ci.snapshot.title, payload: ci.snapshot.raw ?? ci })}
                            title="Inspect raw JSON"
                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                          >
                            <FileCode2 className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleRemoveItem(ci.itemKey)}
                            title="Remove from playlist"
                            className="inline-flex h-8 items-center justify-center rounded-md border border-red-500/20 p-2 text-red-500 hover:bg-red-500/10 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Create Playlist Modal ────────────────────────────────────────── */}
      {isCreating && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0"
        >
          <div className="relative w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-black flex items-center gap-2">
                <ListMusic className="h-5 w-5 text-primary" />
                Create New Playlist
              </h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="rounded-md p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreatePlaylist(e)} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                  Playlist Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Investigation Clips, Top Sports Highlights"
                  className="min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                  Description (Optional)
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="What is this playlist for?"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-3 text-xs font-medium text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="min-h-9 rounded-lg border border-[var(--border)] px-4 text-xs font-bold hover:bg-[var(--surface-container-high)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="min-h-9 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground shadow-xs hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  Create Playlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Playlist Modal ──────────────────────────────────────────── */}
      {editingPlaylist && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0"
        >
          <div className="relative w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-base font-black flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-primary" />
                Edit Playlist Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingPlaylist(null)}
                className="rounded-md p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveEdit(e)} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                  Playlist Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wider text-[var(--muted-foreground)]">
                  Description
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-3 text-xs font-medium text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setEditingPlaylist(null)}
                  className="min-h-9 rounded-lg border border-[var(--border)] px-4 text-xs font-bold hover:bg-[var(--surface-container-high)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!editName.trim()}
                  className="min-h-9 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground shadow-xs hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm Delete Modal ─────────────────────────────────────────── */}
      {deletingPlaylist && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0"
        >
          <div className="relative w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black">Delete Playlist?</h3>
                <p className="text-xs text-[var(--muted-foreground)]">&quot;{deletingPlaylist.name}&quot;</p>
              </div>
            </div>

            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Are you sure you want to delete this playlist? This will remove the playlist and its item groupings.
              <strong> The original saved items and videos will NOT be deleted</strong> and will remain in your Saved Library.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setDeletingPlaylist(null)}
                className="min-h-9 rounded-lg border border-[var(--border)] px-4 text-xs font-bold hover:bg-[var(--surface-container-high)] cursor-pointer"
              >
                Keep Playlist
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="min-h-9 rounded-lg bg-red-600 px-4 text-xs font-black text-white hover:bg-red-700 shadow-xs cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Raw JSON Drawer ──────────────────────────────────────────────── */}
      <RawJsonDrawer
        open={rawTarget !== null}
        onClose={() => setRawTarget(null)}
        title={rawTarget?.title ?? "Playlist Item"}
        payload={rawTarget?.payload ?? {}}
      />
    </div>
  );
}
