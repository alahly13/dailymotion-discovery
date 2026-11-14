// Link Explorer Workspace — Universal Dailymotion URL & Identifier Discovery Center
//
// What this controls: Unified URL and ID analysis workspace supporting any Dailymotion link,
// handle, video ID, playlist ID, or livestream with automatic detection, manual override,
// API v1 vs v2 switching, deep channel crawler bridging, and IndexedDB snapshots.
// Scope: Link Explorer (/link-explorer).

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  Compass,
  Copy,
  ExternalLink,
  Eye,
  FileCode2,
  Globe,
  Layers,
  Library,
  Link as LinkIcon,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Tv,
  User,
  UsersRound,
  X,
} from "lucide-react";
import type { ApiVersion, DiscoveryItem } from "@/lib/discovery/types";
import {
  analyzeDailymotionUrlOrId,
  type DailymotionAnalyzedLink,
  type DailymotionResourceKind,
} from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import {
  resolveLinkExplorerInput,
  type LinkExplorerResolution,
} from "@/lib/link-explorer/link-explorer-service";
import { ResultCard, formatDuration, formatViews } from "@/components/discovery/result-card";
import { AddToPlaylistModal } from "@/components/playlists/add-to-playlist-modal";
import { RawJsonDrawer } from "@/components/discovery/raw-json-drawer";
import { ApiErrorAlert } from "@/components/discovery/api-error-alert";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import { discoveryCompositeKey } from "@/lib/resources/dailymotion-resource-taxonomy";
import { cn } from "@/lib/utils/cn";
import { useSynchronizedApiVersion } from "@/lib/navigation/version-sync";
import {
  captureSearchSnapshot,
  getLatestRestorableSearchSnapshot,
} from "@/lib/search-history/search-snapshot-service";
import { captureLinkSubmission } from "@/lib/saved-titles/capture-service";

const EXAMPLE_CHIPS: Array<{ label: string; value: string; kind: DailymotionResourceKind }> = [
  { label: "Video: x8n8x8", value: "https://www.dailymotion.com/video/x8n8x8", kind: "video" },
  { label: "Short: dai.ly/x8n8x8", value: "https://dai.ly/x8n8x8", kind: "video" },
  { label: "Channel: @lemonde", value: "https://www.dailymotion.com/lemonde", kind: "channel" },
  { label: "Playlist: x88apm", value: "https://www.dailymotion.com/playlist/x88apm", kind: "playlist" },
  { label: "Live: x6m7w8", value: "https://www.dailymotion.com/live/x6m7w8", kind: "livestream" },
];

export function LinkExplorerWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const workspace = useDiscoveryWorkspace();
  const merged = useMergedDataset();

  const initialVersion = (searchParams.get("v") as ApiVersion) || "v1";
  const initialUrl = searchParams.get("url") || searchParams.get("id") || "";

  const [version, setVersion] = useSynchronizedApiVersion(initialVersion);
  const [input, setInput] = useState(initialUrl || "");
  const [overrideKind, setOverrideKind] = useState<DailymotionResourceKind | "auto">("auto");
  const [analyzedPreview, setAnalyzedPreview] = useState<DailymotionAnalyzedLink | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [resolution, setResolution] = useState<LinkExplorerResolution | null>(null);
  const [rawDrawerOpen, setRawDrawerOpen] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [restoredFromHistory, setRestoredFromHistory] = useState(false);

  // Sync real-time detection preview when input changes
  useEffect(() => {
    if (input.trim()) {
      setAnalyzedPreview(analyzeDailymotionUrlOrId(input));
    } else {
      setAnalyzedPreview(null);
    }
  }, [input]);

  // Execute resolution ONLY if URL or ID param was explicitly provided in the address
  useEffect(() => {
    if (initialUrl.trim()) {
      void executeResolution(initialUrl.trim(), initialVersion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVersionChange = (nextVersion: ApiVersion) => {
    // Strictly update the active API version without auto-triggering network queries or search
    setVersion(nextVersion);
    setRestoredFromHistory(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("v", nextVersion);
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  async function executeResolution(targetInput: string, targetVersion: ApiVersion) {
    const clean = targetInput.trim();
    if (!clean) return;
    void captureLinkSubmission(clean, targetVersion, analyzedPreview ?? undefined);
    setLoading(true);
    setRestoredFromHistory(false);
    setCurrentPage(1);
    try {
      const selectedKind = overrideKind === "auto" ? undefined : overrideKind;
      const res = await resolveLinkExplorerInput(targetInput.trim(), targetVersion, selectedKind, 1);
      setResolution(res);

      if (res.ok && res.items.length > 0) {
        void captureSearchSnapshot({
          workspace: "link_explorer",
          query: targetInput.trim(),
          route: "/link-explorer",
          apiVersion: targetVersion,
          resourceType: selectedKind ? selectedKind.toUpperCase() : (res.effectiveKind ? res.effectiveKind.toUpperCase() : "ALL"),
          mode: targetVersion === "v1" ? "search" : "browse",
          apiParams: { url: targetInput.trim() },
          rawResponse: res,
          items: res.items,
          pageIndex: 1,
          hasMore: res.hasMore,
          totalResults: res.items.length,
        });
      }

      // Update URL query parameters seamlessly
      const params = new URLSearchParams(searchParams.toString());
      params.set("url", targetInput.trim());
      params.set("v", targetVersion);
      startTransition(() => {
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    if (!resolution?.analyzed || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = currentPage + 1;
      const selectedKind = overrideKind === "auto" ? undefined : overrideKind;
      const res = await resolveLinkExplorerInput(input.trim(), version, selectedKind, nextPage);
      if (res.ok && res.items.length > 0) {
        setResolution((prev) => {
          if (!prev) return res;
          return {
            ...prev,
            items: [...prev.items, ...res.items],
            hasMore: res.hasMore,
            page: nextPage,
          };
        });
        setCurrentPage(nextPage);
      } else {
        setResolution((prev) => (prev ? { ...prev, hasMore: false } : prev));
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeResolution(input, version);
  };

  const handleChipClick = (value: string) => {
    setInput(value);
    void executeResolution(value, version);
  };

  const handleCopyCanonical = () => {
    const url = resolution?.analyzed?.canonicalUrl || analyzedPreview?.canonicalUrl;
    if (url) {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }
  };

  const effectiveKind =
    overrideKind !== "auto"
      ? overrideKind
      : resolution?.effectiveKind || analyzedPreview?.kind || "video";

  return (
    <div className="space-y-6">
      {/* Top Header & Version Switcher Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <LinkIcon className="h-6 w-6 text-primary" />
              Link Explorer
            </h1>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              Universal Discovery
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Analyze any Dailymotion URL or identifier without scraping. Deep-fetch videos, channels, playlists, and livestreams.
          </p>
        </div>

        {/* Version Switcher Tabs */}
        <div className="flex items-center rounded-lg border border-border bg-surface p-1 shadow-xs">
          <button
            type="button"
            onClick={() => handleVersionChange("v1")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
              version === "v1"
                ? "bg-emerald-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
            )}
          >
            V1 — Legacy
          </button>
          <button
            type="button"
            onClick={() => handleVersionChange("v2")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
              version === "v2"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
            )}
          >
            V2 — Current
          </button>
        </div>
      </div>

      {/* Restored From History Banner */}
      {restoredFromHistory && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-emerald-600 dark:text-emerald-400">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">
                Restored from local search history · Zero API Calls
              </p>
              <p className="text-xs text-muted-foreground">
                Previous Link Explorer resolution loaded directly from IndexedDB without querying Dailymotion.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void executeResolution(input, version)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-emerald-600 dark:bg-emerald-500 px-3 text-xs font-black text-white cursor-pointer hover:opacity-90 shadow-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-analyze Link
          </button>
        </div>
      )}

      {/* Universal Search Form */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Input with Clear Button */}
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste Dailymotion URL, video ID (x8n8x8), channel (@handle), playlist ID..."
                className="w-full h-11 rounded-lg border border-border bg-surface px-4 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-2xs font-mono"
              />
              {input && (
                <button
                  type="button"
                  onClick={() => setInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
                  title="Clear input"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Resource Type Override Dropdown */}
            <div className="w-full md:w-56 shrink-0">
              <select
                value={overrideKind}
                onChange={(e) => setOverrideKind(e.target.value as DailymotionResourceKind | "auto")}
                className="w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary focus:border-transparent cursor-pointer font-medium"
              >
                <option value="auto">Auto-Detect Type</option>
                <option value="video">Force Video (x...)</option>
                <option value="channel">Force Channel / Profile</option>
                <option value="playlist">Force Playlist</option>
                <option value="livestream">Force Livestream</option>
                <option value="user">Force User</option>
              </select>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resolving...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Analyze & Explore
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Example Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50 text-xs">
          <span className="font-semibold text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-500" />
            Examples:
          </span>
          {EXAMPLE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleChipClick(chip.value)}
              className="rounded-md border border-border/70 bg-surface px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-surface-muted hover:border-border transition-colors cursor-pointer font-mono text-[11px]"
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Detection & Strategy Banner */}
      {analyzedPreview && (
        <div className="rounded-xl border border-border bg-surface-raised/40 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Detected Resource:
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize",
                  effectiveKind === "video" && "bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20",
                  effectiveKind === "channel" && "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20",
                  effectiveKind === "playlist" && "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
                  effectiveKind === "livestream" && "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20",
                  effectiveKind === "user" && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
                  effectiveKind === "search" && "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20",
                  effectiveKind === "unsupported" && "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                )}
              >
                {effectiveKind}
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                ID: {analyzedPreview.identifier}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {analyzedPreview.canonicalUrl && (
                <button
                  type="button"
                  onClick={handleCopyCanonical}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  {copiedUrl ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copiedUrl ? "Copied" : "Copy URL"}
                </button>
              )}

              {resolution && (
                <button
                  type="button"
                  onClick={() => setRawDrawerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-surface text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <FileCode2 className="h-3 w-3" />
                  Raw JSON
                </button>
              )}
            </div>
          </div>

          {/* Canonical API strategy description with active track highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-muted-foreground bg-surface p-2.5 rounded-lg border border-border/50">
            <div className={cn("p-2 rounded-md transition-all", version === "v1" ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200" : "border border-transparent")}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-sans font-medium text-foreground">API v1 Strategy</span>
                {version === "v1" && (
                  <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                    Active Track
                  </span>
                )}
              </div>
              {analyzedPreview.apiPathV1 ? (
                <code className="text-emerald-600 dark:text-emerald-400">{analyzedPreview.apiPathV1}</code>
              ) : (
                "None"
              )}
            </div>
            <div className={cn("p-2 rounded-md transition-all", version === "v2" ? "border border-indigo-500/40 bg-indigo-500/10 text-indigo-950 dark:text-indigo-200" : "border border-transparent")}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-sans font-medium text-foreground">API v2 Strategy</span>
                {version === "v2" && (
                  <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                    Active Track
                  </span>
                )}
              </div>
              {analyzedPreview.apiPathV2 ? (
                <code className="text-indigo-600 dark:text-indigo-400">{analyzedPreview.apiPathV2}</code>
              ) : (
                <span className="text-muted-foreground italic">No global v2 endpoint (profile-scoped only)</span>
              )}
            </div>
          </div>

          {/* Notice when current version differs from resolution version */}
          {resolution && resolution.version !== version && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Active API version switched to <strong className="uppercase">{version}</strong>. The results below were fetched from API <strong className="uppercase">{resolution.version}</strong>.
                </span>
              </div>
              <button
                type="button"
                onClick={() => void executeResolution(input, version)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all cursor-pointer shrink-0 shadow-2xs"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-analyze on {version.toUpperCase()}
              </button>
            </div>
          )}

          {/* Warnings if any */}
          {analyzedPreview.warnings && analyzedPreview.warnings.length > 0 && (
            <div className="space-y-1">
              {analyzedPreview.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{w.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error / Redirect State */}
      {resolution && !resolution.ok && (
        resolution.reason === "keyword_search_redirect" ? (
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400">
                <Search className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-foreground">
                  Keyword Search Query Detected
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {resolution.error}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={`/global-search?q=${encodeURIComponent(resolution.analyzed.identifier)}&v=${version}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-all cursor-pointer shadow-sm"
              >
                <Search className="h-3.5 w-3.5" />
                Search &ldquo;{resolution.analyzed.identifier}&rdquo; in Global Search &rarr;
              </Link>
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setResolution(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-all cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <ApiErrorAlert
            error={resolution.normalized || {
              error: resolution.error,
              reason: resolution.reason,
              status: resolution.status,
              apiVersion: resolution.version,
              remedy: resolution.reason === "auth_missing" ? "Dailymotion API v2 requires client credentials. Configure PRIVATE_DAILYMOTION_API_KEY_V2 in Settings." : null,
            }}
            onRetry={() => void executeResolution(input, version)}
            onSwitchVersion={(target) => {
              setVersion(target);
              const params = new URLSearchParams(searchParams.toString());
              params.set("v", target);
              router.replace(`/link-explorer?${params.toString()}`);
            }}
          />
        )
      )}

      {/* Initial Empty / Guide State */}
      {!resolution && !loading && (
        <div className="rounded-xl border border-border/60 bg-card/40 p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LinkIcon className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-foreground">
            Direct Link & Resource Inspector
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            Paste any Dailymotion video link, short URL, channel handle, playlist URL, or video ID above to fetch its exact live metadata and browse its catalog.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs">
            <span className="text-muted-foreground">Looking to search by keywords?</span>
            <Link
              href="/global-search"
              className="font-bold text-primary hover:underline inline-flex items-center gap-1"
            >
              Go to Global Search <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Resolution Workspace Display */}
      {resolution && resolution.ok && (
        <div className="space-y-6">
          {/* Main Item Highlight (Video / Channel / Playlist / Live) */}
          {resolution.item && (() => {
            const mainItem = resolution.item;
            const cKey = discoveryCompositeKey(mainItem.apiVersion, mainItem.kind, mainItem.id);
            const isSaved = merged.savedKeys.has(cKey) || workspace.isItemSaved(mainItem.apiVersion, mainItem.kind, mainItem.id);

            return (
              <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {effectiveKind === "video" && <Tv className="h-6 w-6" />}
                      {(effectiveKind === "channel" || effectiveKind === "profile" || effectiveKind === "user") && (
                        <UsersRound className="h-6 w-6" />
                      )}
                      {effectiveKind === "playlist" && <Library className="h-6 w-6" />}
                      {effectiveKind === "livestream" && <Radio className="h-6 w-6 text-red-500 animate-pulse" />}
                      {effectiveKind === "search" && <Search className="h-6 w-6 text-teal-500" />}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground line-clamp-1">
                        {mainItem.title || resolution.analyzed.displayLabel}
                      </h2>
                      <p className="text-xs text-muted-foreground flex items-center gap-2 font-mono">
                        <span>ID: {mainItem.id}</span>
                        {(mainItem.ownerName || mainItem.ownerId) && (
                          <span>Owner: {mainItem.ownerName || mainItem.ownerId}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Action for Channels: Deep Fetch in Channel Explorer */}
                    {(effectiveKind === "channel" || effectiveKind === "profile" || effectiveKind === "user") && (
                      <Link
                        href={`/channel-explorer?channel=${encodeURIComponent(resolution.analyzed.identifier)}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-95 transition-all shadow-2xs"
                      >
                        <Compass className="h-3.5 w-3.5" />
                        Deep Fetch Crawler
                      </Link>
                    )}

                    {/* Save Item Action */}
                    <button
                      type="button"
                      onClick={() => {
                        void merged.coordinator.toggleSaveItem(mainItem);
                        if (workspace.isItemSaved(mainItem.apiVersion, mainItem.kind, mainItem.id)) {
                          workspace.removeItem(mainItem.apiVersion, mainItem.kind, mainItem.id);
                        } else {
                          workspace.saveItem(mainItem);
                        }
                      }}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer",
                        isSaved
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-surface-muted"
                      )}
                    >
                      {isSaved ? (
                        <>
                          <BookmarkCheck className="h-3.5 w-3.5" />
                          Saved
                        </>
                      ) : (
                        <>
                          <Bookmark className="h-3.5 w-3.5" />
                          Save
                        </>
                      )}
                    </button>

                    {/* Add to Playlist Action */}
                    <AddToPlaylistModal
                      item={mainItem}
                      onAdded={() => {}}
                    />

                    {/* External Link */}
                    {resolution.analyzed.canonicalUrl && (
                      <a
                        href={resolution.analyzed.canonicalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-surface-muted transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open on Dailymotion
                      </a>
                    )}
                  </div>
                </div>

                {/* Video Thumbnail & Metadata Details */}
                {effectiveKind === "video" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-surface-muted border border-border">
                      {mainItem.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mainItem.thumbnail}
                          alt={mainItem.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <Tv className="h-10 w-10 opacity-30" />
                        </div>
                      )}
                      {mainItem.duration !== null && (
                        <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-0.5 text-xs font-mono font-medium text-white">
                          {formatDuration(mainItem.duration)}
                        </span>
                      )}
                    </div>

                    <div className="md:col-span-2 space-y-3">
                      <p className="text-sm text-foreground/90 whitespace-pre-line line-clamp-4">
                        {mainItem.description || "No description provided for this video."}
                      </p>
                      <div className="flex flex-wrap gap-4 text-xs font-medium text-muted-foreground pt-2 border-t border-border/50">
                        <span>{formatViews(mainItem.views)}</span>
                        {mainItem.createdAt && (
                          <span>Published: {new Date(mainItem.createdAt).toLocaleDateString()}</span>
                        )}
                        {mainItem.category && <span>Category: {mainItem.category}</span>}
                        {mainItem.country && <span>Country: {mainItem.country}</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Related Items or Video Catalog Grid */}
          {(resolution.items.length > 0 || (resolution.relatedItems && resolution.relatedItems.length > 0)) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  {effectiveKind === "video"
                    ? "Related Videos"
                    : effectiveKind === "search"
                    ? `Search Results for "${resolution.analyzed.identifier}" (${resolution.items.length} items)`
                    : `${resolution.analyzed.displayLabel} Catalog (${resolution.items.length} items)`}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {(resolution.items.length > 0 ? resolution.items : resolution.relatedItems || []).map((cardItem) => {
                  const cKey = discoveryCompositeKey(cardItem.apiVersion, cardItem.kind, cardItem.id);
                  const isSaved = merged.savedKeys.has(cKey) || workspace.isItemSaved(cardItem.apiVersion, cardItem.kind, cardItem.id);

                  return (
                    <ResultCard
                      key={cKey}
                      item={cardItem}
                      saved={isSaved}
                      favorite={merged.favoriteKeys.has(cKey)}
                      collections={merged.collections.map((c) => ({ id: c.id, name: c.name }))}
                      onToggleFavorite={() => {
                        if (!isSaved) {
                          void merged.coordinator.toggleSaveItem(cardItem).then(() =>
                            merged.coordinator.setSavedItemFavorite(cKey, true)
                          );
                        } else {
                          void merged.coordinator.setSavedItemFavorite(cKey, !merged.favoriteKeys.has(cKey));
                        }
                      }}
                      onAddToCollection={(collId) => void merged.coordinator.addItemToCollection(collId, cardItem)}
                      onToggleSave={() => {
                        void merged.coordinator.toggleSaveItem(cardItem);
                        if (workspace.isItemSaved(cardItem.apiVersion, cardItem.kind, cardItem.id)) {
                          workspace.removeItem(cardItem.apiVersion, cardItem.kind, cardItem.id);
                        } else {
                          workspace.saveItem(cardItem);
                        }
                      }}
                    />
                  );
                })}
              </div>

              {/* Load More Pagination for Multi-Page Catalogs */}
              {resolution.hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => void handleLoadMore()}
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-black text-primary-foreground hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer shadow-xs"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading Next Page...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Load More Videos (Page {currentPage + 1})
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Raw JSON Drawer */}
      {resolution && (
        <RawJsonDrawer
          open={rawDrawerOpen}
          onClose={() => setRawDrawerOpen(false)}
          title={`Raw API Resolution: ${resolution.analyzed.identifier}`}
          payload={resolution}
        />
      )}
    </div>
  );
}
