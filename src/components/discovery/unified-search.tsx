// UnifiedSearch — World-Class Search Workspace (2026)
//
// What this controls:
// 1. Prominent wide search input with instant clear, quick-submit, and query transformations.
// 2. Collapsible API Filters toolbar strictly governing outgoing network requests.
// 3. 12-column grid workspace with independent collapsible Local Filters panel.
// 4. Real-time resource counters (Videos, Channels, Playlists, Livestreams, Users).
// 5. Automatic Search Snapshot persistence into IndexedDB (full raw JSON, ZERO media binaries).
// 6. Offline historical replay mode with ZERO API requests and ZERO Gemini requests.
//
// Scope: /search workspace.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  History,
  Library,
  Radio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tv,
  UsersRound,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  V1_MANDATORY_FIELDS,
  V1_VIDEO_FIELD_OPTIONS,
  V1_VIDEO_SORTS,
  V2_MANDATORY_FIELDS,
  V2_VIDEO_FIELD_OPTIONS,
  V2_VIDEO_SORTS,
  buildSearchCacheKey,
  resolveFields,
  resolveSort,
  schemaFor,
  type ParamDef,
  type ParamGroup,
} from "@/lib/discovery/param-schema";
import { mergeDiscoveryItems, type ApiVersion, type DiscoveryFailure, type DiscoveryItem } from "@/lib/discovery/types";
import { CountrySelector } from "./country-selector";
import {
  DEFAULT_DISCOVERY_LOCAL_FILTERS,
  applyDiscoveryResultPipeline,
  type LocalFilterState,
} from "@/lib/filters/discovery-result-filters";
import { DiscoveryLocalFilterPanel } from "./discovery-local-filter-panel";
import { ApiErrorAlert } from "./api-error-alert";
import { classifyDiscoveryItem, discoveryCompositeKey } from "@/lib/resources/dailymotion-resource-taxonomy";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import { ResultCard } from "./result-card";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";
import { captureSearchSnapshot, replaySearchSnapshot } from "@/lib/search-history/search-snapshot-service";

const GROUPS: { key: ParamGroup; label: string }[] = [
  { key: "basic", label: "Basic Filters" },
  { key: "safety", label: "Content & Safety" },
  { key: "localization", label: "Localization" },
  { key: "sorting", label: "Sorting & Results" },
  { key: "advanced", label: "Advanced" },
];

interface ResultsMeta {
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  capped: boolean;
  endpoint: string;
}

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const labelClass =
  "mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]";

function ParamControl({ def, value, onChange }: { def: ParamDef; value: string; onChange: (value: string) => void }) {
  const id = `usearch-${def.key}`;
  if (def.key === "country" || def.key === "localization") {
    return (
      <CountrySelector
        value={value}
        onChange={onChange}
        mode="api"
        label={def.label}
        placeholder="Any country / localization..."
        helperText={def.key === "country" ? "API regional context parameter (ams_country / country)" : "V1 regional localization"}
      />
    );
  }
  if (def.control === "select") {
    return (
      <div>
        <label className={labelClass} htmlFor={id} title={def.description}>{def.label}</label>
        <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          {(def.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  if (def.control === "number") {
    return (
      <div>
        <label className={labelClass} htmlFor={id} title={def.description}>{def.label}</label>
        <input id={id} type="number" min={def.min ?? 0} max={def.max} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (def.control === "date") {
    return (
      <div>
        <label className={labelClass} htmlFor={id} title={def.description}>{def.label}</label>
        <input id={id} type="date" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (def.control === "boolean3") {
    return (
      <div>
        <span className={labelClass} id={`${id}-label`} title={def.description}>{def.label}</span>
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-3 gap-1 rounded-md border border-[var(--border)] p-1">
          {[
            { v: "", label: "Auto" },
            { v: "true", label: "On" },
            { v: "false", label: "Off" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={value === o.v}
              onClick={() => onChange(o.v)}
              className={`min-h-8 rounded px-2 text-[11px] font-black uppercase transition cursor-pointer ${
                value === o.v ? "bg-primary text-primary-foreground shadow-xs font-bold" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      <label className={labelClass} htmlFor={id} title={def.description}>{def.label}</label>
      <input id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} placeholder={def.label} />
    </div>
  );
}

export function UnifiedSearch() {
  const workspace = useDiscoveryWorkspace();
  const merged = useMergedDataset();
  const [version, setVersion] = useState<ApiVersion>(workspace.lastSearchVersion ?? "v1");
  const [resourceType, setResourceType] = useState<string>("general");
  const [query, setQuery] = useState("");
  const [profileId, setProfileId] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [localFilters, setLocalFilters] = useState<LocalFilterState>(DEFAULT_DISCOVERY_LOCAL_FILTERS);
  const [isApiFiltersOpen, setIsApiFiltersOpen] = useState(false);
  const [isLocalFiltersOpen, setIsLocalFiltersOpen] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkCollectionId, setBulkCollectionId] = useState("");
  const [saveFlash, setSaveFlash] = useState<string | null>(null);
  const [fieldSelection, setFieldSelection] = useState<string[] | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [meta, setMeta] = useState<ResultsMeta | null>(null);
  const [failure, setFailure] = useState<DiscoveryFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [activeTabKind, setActiveTabKind] = useState<string>("ALL");
  const inflightKey = useRef<string | null>(null);

  // Restore local filter collapse state from localStorage
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("dm_search_local_filters_open");
      if (saved !== null) {
        setIsLocalFiltersOpen(saved === "true");
      }
    } catch {
      // Non-fatal
    }
  }, []);

  const toggleLocalFilters = () => {
    setIsLocalFiltersOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("dm_search_local_filters_open", String(next));
      } catch {
        // Non-fatal
      }
      return next;
    });
  };

  // Hydrate URL search parameters cleanly on mount, including offline replay (`replay=snapshotId`)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if ([...sp.keys()].length === 0) return;
    let active = true;

    void (async () => {
      // Check offline replay parameter first
      const replaySnapId = sp.get("replay") || sp.get("snapshotId");
      if (replaySnapId) {
        try {
          const replayResult = await replaySearchSnapshot(replaySnapId);
          if (replayResult && active) {
            setVersion(replayResult.snapshot.apiVersion);
            setQuery(replayResult.snapshot.query);
            setItems(replayResult.items);
            setHasSearched(true);
            setIsReplayMode(true);
            setNotice(
              `Historical Snapshot Offline Replay (${replayResult.items.length} items loaded with ZERO API calls).`
            );
            return;
          }
        } catch {
          // Replay failed; fall back to standard URL hydration
        }
      }

      if (!active) return;
      const vParam = sp.get("v");
      if (vParam === "v1" || vParam === "v2") setVersion(vParam);
      const typeParam = sp.get("type");
      if (typeParam) {
        if (typeParam === "video" || typeParam === "videos") setResourceType("videos");
        else if (typeParam === "channel" || typeParam === "channels") setResourceType("channels");
        else if (typeParam === "playlist" || typeParam === "playlists") setResourceType("playlists");
        else if (typeParam === "user" || typeParam === "users") setResourceType("users");
        else if (typeParam === "live") setResourceType("live");
        else setResourceType(typeParam);
      }
      if (sp.has("q")) setQuery(sp.get("q") ?? "");
      if (sp.has("profileId")) setProfileId(sp.get("profileId") ?? "");
      const hydrated: Record<string, string> = {};
      for (const [k, val] of sp.entries()) {
        if (!["v", "q", "type", "profileId", "page", "mode", "fields", "snapshotType", "snapshotId", "replay"].includes(k) && val) {
          hydrated[k] = val;
        }
      }
      if (Object.keys(hydrated).length > 0) setFilters(hydrated);
    })();

    return () => {
      active = false;
    };
  }, []);

  const schema = useMemo(() => schemaFor(version), [version]);
  const defaults = workspace.versionDefaults[version];
  const fieldOptions = version === "v1" ? V1_VIDEO_FIELD_OPTIONS : V2_VIDEO_FIELD_OPTIONS;
  const mandatoryFields = version === "v1" ? V1_MANDATORY_FIELDS : V2_MANDATORY_FIELDS;

  const getValue = useCallback((def: ParamDef): string => {
    if (filters[def.key] !== undefined) return filters[def.key];
    if (def.key === "pageSize") return defaults.pageSize;
    if (def.key === "sort") return defaults.sort;
    if (def.key === "localization" && version === "v1") return defaults.localization || "detect";
    if (def.key === "familyFilter" && defaults.familyFilter !== null) return String(defaults.familyFilter);
    return def.default ?? "";
  }, [defaults, filters, version]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  function switchVersion(next: ApiVersion) {
    if (next === version) return;
    setVersion(next);
    workspace.setLastSearchVersion(next);
    setFilters({});
    setFieldSelection(null);
    setItems([]);
    setMeta(null);
    setFailure(null);
    setNotice(null);
    setHasSearched(false);
    setIsReplayMode(false);
    try {
      const sp = new URLSearchParams(window.location.search);
      sp.set("v", next);
      window.history.replaceState(null, "", `?${sp.toString()}`);
    } catch {
      // Non-fatal
    }
  }

  // Count active API filters that deviate from default
  const activeApiFiltersCount = useMemo(() => {
    return Object.entries(filters).filter(([k, v]) => v && v.trim().length > 0 && k !== "pageSize").length;
  }, [filters]);

  const runSearch = useCallback(async (page: number, append: boolean) => {
    const submitKey = `${version}:${query}:${profileId}:${JSON.stringify(filters)}:${fieldSelection?.join(",") ?? ""}:${page}:${append}`;
    if (!append) {
      if (inflightKey.current === submitKey) return;
      inflightKey.current = submitKey;
    }
    setLoading(true);
    setFailure(null);
    setNotice(null);
    setIsReplayMode(false);
    if (!append) workspace.recordSearchSubmitted(version);
    try {
      const params = new URLSearchParams();
      params.set("mode", version === "v1" ? "search" : "browse");
      if (version === "v1") {
        if (query !== "") params.set("q", query);
      } else {
        if (!profileId.trim()) {
          setFailure({
            ok: false,
            error: "Enter a profile ID — v2 has no global search.",
            reason: "user_input_error",
            status: 400,
            apiVersion: "v2",
            resource: "general",
            endpoint: "GET /profiles/{profile_id}/videos",
            remedy: "Collect profile IDs via GET /v2/me once authenticated.",
            retryable: false,
          });
          setLoading(false);
          return;
        }
        params.set("profileId", profileId.trim());
      }
      let sortNotice: string | null = null;
      for (const def of schema) {
        if (def.control === "fields") continue;
        if (def.key === "pageSize") {
          const size = Math.min(Math.max(Number(getValue(def)) || 20, 1), 100);
          params.set("pageSize", String(size));
          continue;
        }
        if (def.key === "sort") {
          const resolved = resolveSort(version, getValue(def) || undefined, query.trim().length > 0);
          params.set("sort", resolved.sort);
          sortNotice = resolved.notice;
          continue;
        }
        const value = getValue(def);
        if (value !== "") params.set(def.key, value);
      }

      const resolvedFields = resolveFields(version, fieldSelection);
      if (resolvedFields) params.set("fields", resolvedFields.join(","));
      params.set("page", String(page));

      const endpointResource = resourceType === "general" ? "general" : resourceType;
      const response = await fetch(`/api/discovery/${version}/${endpointResource}?${params.toString()}`);
      const data = (await response.json()) as
        | { ok: true; result: { items: DiscoveryItem[]; page: number; pageSize: number; total: number | null; hasMore: boolean; capped: boolean; endpoint: string } }
        | DiscoveryFailure;

      if (!data.ok) {
        setFailure(data);
        if (!append) { setItems([]); setMeta(null); }
        setHasSearched(true);
        if (!append) workspace.recordSearchOutcome(version, false, 1);
        else workspace.recordApiCalls(version, 1);
        return;
      }

      if (sortNotice) setNotice(sortNotice);
      const newItems = data.result.items;
      setItems((prev) => (append ? mergeDiscoveryItems(prev, newItems) : newItems));
      setMeta({
        page: data.result.page,
        pageSize: data.result.pageSize,
        total: data.result.total,
        hasMore: data.result.hasMore,
        capped: data.result.capped,
        endpoint: data.result.endpoint,
      });
      setHasSearched(true);

      const shareParams = new URLSearchParams(params);
      shareParams.set("v", version);
      if (resourceType !== "general") shareParams.set("type", resourceType);
      window.history.replaceState(null, "", `?${shareParams.toString()}`);

      if (!append) {
        const effective = Object.fromEntries(params.entries());
        // 1. Record in Zustand history store
        workspace.addHistory({
          version,
          resource: "general",
          label: `Search (${version.toUpperCase()}): ${query || profileId || "filters"}`,
          params: { ...effective, cacheKey: buildSearchCacheKey(version, "general", version === "v1" ? "search" : "browse", effective) },
          resultCount: data.result.total ?? newItems.length,
        });

        // 2. Automatically capture full raw JSON snapshot into IndexedDB for zero-API offline replay
        void captureSearchSnapshot({
          query: query || profileId,
          route: "/search",
          apiVersion: version,
          resourceType: "ALL",
          mode: version === "v1" ? "search" : "browse",
          apiParams: effective,
          localFilters: localFilters as unknown as Record<string, unknown>,
          rawResponse: data.result,
          items: newItems,
          pageIndex: page,
          totalResults: data.result.total ?? newItems.length,
        });

        workspace.recordSearchOutcome(version, true, 1);
      } else {
        workspace.recordApiCalls(version, 1);
      }
    } catch {
      setFailure({
        ok: false,
        error: "Request failed (network).",
        reason: "network_error",
        status: 503,
        apiVersion: version,
        resource: "general",
        endpoint: "",
        remedy: null,
        retryable: true,
      });
      if (!append) workspace.recordSearchOutcome(version, false, 1);
      else workspace.recordApiCalls(version, 1);
    } finally {
      setLoading(false);
      if (!append) inflightKey.current = null;
    }
  }, [fieldSelection, filters, localFilters, profileId, query, schema, version, workspace]);

  // Apply local filters in memory (Zero API calls)
  const visibleItems = useMemo(() => {
    const filtered = applyDiscoveryResultPipeline(items, localFilters);
    if (activeTabKind === "ALL") return filtered;
    return filtered.filter((item) => {
      const taxonomy = classifyDiscoveryItem(item);
      if (activeTabKind === "VIDEO") return taxonomy === "VIDEO";
      if (activeTabKind === "CHANNEL") return taxonomy === "CHANNEL" || taxonomy === "PROFILE" || taxonomy === "USER";
      if (activeTabKind === "PLAYLIST") return taxonomy === "PLAYLIST";
      if (activeTabKind === "LIVE") return taxonomy === "LIVESTREAM";
      return true;
    });
  }, [items, localFilters, activeTabKind]);

  // Resource type distribution counts
  const countsByKind = useMemo(() => {
    let videos = 0;
    let channels = 0;
    let playlists = 0;
    let live = 0;
    let users = 0;

    for (const item of items) {
      const tax = classifyDiscoveryItem(item);
      if (tax === "VIDEO") videos++;
      else if (tax === "CHANNEL" || tax === "PROFILE") channels++;
      else if (tax === "PLAYLIST") playlists++;
      else if (tax === "LIVESTREAM") live++;
      else if (tax === "USER") users++;
    }

    return { total: items.length, videos, channels, playlists, live, users };
  }, [items]);

  // Smart Query Transforms
  const handleTrimSpaces = () => {
    setQuery((q) => q.trim().replace(/\s+/g, " "));
  };

  const handleShuffleWords = () => {
    setQuery((q) => {
      const words = q.trim().split(/\s+/);
      if (words.length <= 1) return q;
      return words.reverse().join(" ");
    });
  };

  function saveCurrentSearch() {
    const label = `Search (${version.toUpperCase()}): ${query.trim() || profileId.trim() || "filters"}`;
    workspace.saveSearch({
      version,
      resource: "general",
      label,
      params: { q: query, profileId, ...filters },
    });
    void merged.coordinator.saveSearchPreset({
      name: label,
      apiVersion: version,
      resource: "general",
      mode: version === "v1" ? "search" : "browse",
      query: query.trim() || profileId.trim(),
      apiParams: { q: query, profileId, ...filters },
      localFilters: localFilters as unknown as Record<string, unknown>,
      tags: [version],
      pinned: false,
      cachedSnapshot: items.length > 0
        ? { capturedAt: new Date().toISOString(), totalFetched: items.length, items: items.slice(0, 150) }
        : undefined,
    });
    setSaveFlash("Saved preset to IndexedDB");
    setTimeout(() => setSaveFlash(null), 2500);
  }

  function toggleSelectKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveSelectedItems() {
    const chosen = visibleItems.filter((i) => selectedKeys.has(discoveryCompositeKey(i.apiVersion, i.kind, i.id)));
    if (chosen.length === 0) return;
    await merged.coordinator.saveItemsBatch(chosen);
    for (const item of chosen) {
      if (!workspace.isItemSaved(item.apiVersion, item.kind, item.id)) workspace.saveItem(item);
    }
    setSaveFlash(`Saved ${chosen.length} selected items to Saved Items`);
    setTimeout(() => setSaveFlash(null), 2200);
  }

  async function addSelectedToCollection() {
    if (!bulkCollectionId) return;
    const chosen = visibleItems.filter((i) => selectedKeys.has(discoveryCompositeKey(i.apiVersion, i.kind, i.id)));
    if (chosen.length === 0) return;
    for (const item of chosen) {
      await merged.coordinator.addItemToCollection(bulkCollectionId, item);
    }
    setSaveFlash(`Added ${chosen.length} items to collection`);
    setTimeout(() => setSaveFlash(null), 2200);
  }

  function exportResults(format: "json" | "csv") {
    if (visibleItems.length === 0) return;
    const content =
      format === "json"
        ? JSON.stringify(visibleItems, null, 2)
        : [
            "id,apiVersion,kind,title,ownerName,duration,views,language,createdAt,url",
            ...visibleItems.map((i) =>
              [
                i.id,
                i.apiVersion,
                i.kind,
                `"${i.title.replaceAll('"', '""')}"`,
                `"${(i.ownerName ?? "").replaceAll('"', '""')}"`,
                i.duration ?? "",
                i.views ?? "",
                i.language ?? "",
                i.createdAt ?? "",
                i.url ?? "",
              ].join(",")
            ),
          ].join("\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dailymotion-${version}-search.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleField(value: string) {
    if (mandatoryFields.includes(value)) return;
    setFieldSelection((prev) => {
      const base = prev ?? [];
      return base.includes(value) ? base.filter((f) => f !== value) : [...base, value];
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Offline Replay Banner (if replaying historical search) ────────── */}
      {isReplayMode && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-4 text-sky-400">
          <div className="flex items-center gap-2.5">
            <History className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-xs font-black uppercase tracking-wider">
                Historical Snapshot Offline Replay
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Loaded directly from IndexedDB without querying Dailymotion or Gemini (0 API calls used).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void runSearch(1, false)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-black text-primary-foreground cursor-pointer hover:opacity-90 shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Run Live Search Again
          </button>
        </div>
      )}

      {/* ── Wide Search Input & API Options ──────────────────────────────── */}
      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 shadow-xs">
        {/* Version Selector Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-1">
            <button
              type="button"
              onClick={() => switchVersion("v1")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                version === "v1" ? "bg-primary text-primary-foreground shadow-xs" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              V1 — Legacy
            </button>
            <button
              type="button"
              onClick={() => switchVersion("v2")}
              className={`rounded-md px-3.5 py-1.5 text-xs font-black transition cursor-pointer ${
                version === "v2" ? "bg-primary text-primary-foreground shadow-xs" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              V2 — Current
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsApiFiltersOpen((p) => !p)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition cursor-pointer ${
                isApiFiltersOpen || activeApiFiltersCount > 0
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>API Parameters</span>
              {activeApiFiltersCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.2 text-[10px] font-black text-primary-foreground">
                  {activeApiFiltersCount}
                </span>
              )}
              {isApiFiltersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            <button
              type="button"
              onClick={saveCurrentSearch}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)] cursor-pointer"
              title="Save current search preset into IndexedDB"
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Save Preset</span>
            </button>
          </div>
        </div>

        {/* Full-Width Prominent Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(1, false);
          }}
          className="relative flex items-center"
        >
          <Search className="pointer-events-none absolute left-4 h-5 w-5 text-[var(--muted-foreground)]" />
          <input
            id="unified-search-bar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              version === "v1"
                ? "Search public Dailymotion videos, channels, playlists... (Unicode & exact terms supported)"
                : "Enter query terms (for V2, catalog is scoped by profile ID)"
            }
            className="h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] pl-12 pr-28 text-sm font-semibold transition focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            autoComplete="off"
          />

          <div className="absolute right-2 flex items-center gap-1.5">
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-container-high)] hover:text-[var(--foreground)] cursor-pointer"
                aria-label="Clear query"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground shadow-xs transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
            >
              <Search className="h-3.5 w-3.5" />
              <span>{loading ? "Searching…" : "Search"}</span>
            </button>
          </div>
        </form>

        {/* Profile ID Input for V2 */}
        {version === "v2" && (
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs font-bold text-[var(--muted-foreground)] shrink-0">Profile ID:</span>
            <input
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              placeholder="e.g. xiy, user handle, or channel ID"
              className="h-9 w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-semibold"
            />
          </div>
        )}

        {/* Smart Query Transform Quick Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">
            Query Tools:
          </span>
          <button
            type="button"
            onClick={handleTrimSpaces}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
          >
            Trim Spaces
          </button>
          <button
            type="button"
            onClick={handleShuffleWords}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
          >
            Shuffle Words
          </button>
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-md border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-red-500 cursor-pointer"
            >
              Clear Text
            </button>
          )}
          {saveFlash && (
            <span className="ml-auto text-xs font-bold text-emerald-500" role="status">
              ✓ {saveFlash}
            </span>
          )}
        </div>

        {/* Quick API Filters Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[var(--border)]/60 text-xs">
          {/* Resource Type */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">Resource:</span>
            <select
              aria-label="Resource Type"
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--foreground)] cursor-pointer"
            >
              <option value="general">All Resources</option>
              <option value="videos">Videos</option>
              <option value="channels">Channels / Profiles</option>
              <option value="playlists">Playlists</option>
              <option value="users">Users</option>
              <option value="live">Live / Streams</option>
            </select>
          </div>

          {/* Category */}
          {version === "v1" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">Category:</span>
              <select
                aria-label="Category"
                value={filters.channel ?? ""}
                onChange={(e) => setFilter("channel", e.target.value)}
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--foreground)] cursor-pointer"
              >
                <option value="">Any Category</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]">Sort:</span>
            <select
              aria-label="Sort"
              value={filters.sort ?? (version === "v1" ? "relevance" : "-created_at")}
              onChange={(e) => setFilter("sort", e.target.value)}
              className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--foreground)] cursor-pointer"
            >
              {(version === "v1" ? V1_VIDEO_SORTS : V2_VIDEO_SORTS).map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Collapsible API Parameters Panel (strictly outbound network parameters) */}
        {isApiFiltersOpen && (
          <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)]/50 p-4 mt-3">
            {GROUPS.filter((g) => g.key !== "advanced").map((group) => {
              const inGroup = schema.filter((d) => d.group === group.key);
              if (inGroup.length === 0) return null;
              return (
                <fieldset key={group.key}>
                  <legend className="px-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                    {group.label}
                  </legend>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {inGroup.map((def) => (
                      <ParamControl key={def.key} def={def} value={getValue(def)} onChange={(v) => setFilter(def.key, v)} />
                    ))}
                  </div>
                </fieldset>
              );
            })}

            {/* Advanced Response Fields Toggle */}
            <details
              open={advancedOpen}
              onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)]"
            >
              <summary className="cursor-pointer px-3.5 py-2.5 text-xs font-black uppercase tracking-[0.14em]">
                Advanced Outbound Fields & Parameters
              </summary>
              <div className="grid gap-3 border-t border-[var(--border)] p-3.5 sm:grid-cols-2 lg:grid-cols-4">
                {schema.filter((d) => d.group === "advanced").map((def) => (
                  <ParamControl key={def.key} def={def} value={getValue(def)} onChange={(v) => setFilter(def.key, v)} />
                ))}
                <div className="sm:col-span-2">
                  <span className={labelClass}>Response Fields (id + title always kept)</span>
                  <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-[var(--border)] p-2 sm:grid-cols-2">
                    {fieldOptions.map((o) => {
                      const locked = mandatoryFields.includes(o.value);
                      const checked = locked || (fieldSelection ?? []).includes(o.value);
                      return (
                        <label
                          key={o.value}
                          className={`flex items-center gap-2 rounded px-2 py-1 text-xs font-semibold ${
                            locked ? "opacity-70" : "cursor-pointer hover:bg-[var(--surface-container-high)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[var(--primary)]"
                            checked={checked}
                            disabled={locked}
                            onChange={() => toggleField(o.value)}
                          />
                          <span>{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}
      </section>

      {/* Notices & Failure Callouts */}
      {notice && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3 text-xs font-bold" role="status">
          {notice}
        </p>
      )}

      {failure && (
        <ApiErrorAlert
          error={{
            error: failure.error,
            reason: failure.reason,
            remedy: failure.remedy,
            status: failure.status,
            apiVersion: version,
            endpoint: failure.endpoint,
            retryable: failure.retryable,
          }}
          onRetry={() => void runSearch(meta?.page ?? 1, false)}
          onSwitchVersion={(target) => switchVersion(target)}
        />
      )}

      {/* ── 12-Column Results Workspace ──────────────────────────────────── */}
      {hasSearched && !failure && (
        <div className="grid grid-cols-12 gap-5 items-start">
          {/* Left Side: Results Workspace (col-span-12 or col-span-8/9) */}
          <div className={isLocalFiltersOpen ? "col-span-12 xl:col-span-8 2xl:col-span-9 space-y-4" : "col-span-12 space-y-4"}>
            {/* Header Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-xs">
              {/* Resource Distribution Tabs */}
              <div className="flex flex-wrap items-center gap-1.5" role="tablist">
                <button
                  type="button"
                  onClick={() => setActiveTabKind("ALL")}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                    activeTabKind === "ALL"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <span>All</span>
                  <span className="text-[10px] opacity-80">({countsByKind.total})</span>
                </button>
                {countsByKind.videos > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTabKind("VIDEO")}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      activeTabKind === "VIDEO"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <Tv className="h-3 w-3" />
                    <span>Videos</span>
                    <span className="text-[10px] opacity-80">({countsByKind.videos})</span>
                  </button>
                )}
                {countsByKind.channels > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTabKind("CHANNEL")}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      activeTabKind === "CHANNEL"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <UsersRound className="h-3 w-3" />
                    <span>Channels</span>
                    <span className="text-[10px] opacity-80">({countsByKind.channels})</span>
                  </button>
                )}
                {countsByKind.playlists > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTabKind("PLAYLIST")}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      activeTabKind === "PLAYLIST"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <Library className="h-3 w-3" />
                    <span>Playlists</span>
                    <span className="text-[10px] opacity-80">({countsByKind.playlists})</span>
                  </button>
                )}
                {countsByKind.live > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTabKind("LIVE")}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                      activeTabKind === "LIVE"
                        ? "bg-red-600 text-white shadow-xs"
                        : "bg-[var(--surface-container-low)] text-red-500 hover:text-red-600"
                    }`}
                  >
                    <Radio className="h-3 w-3" />
                    <span>Live</span>
                    <span className="text-[10px] opacity-80">({countsByKind.live})</span>
                  </button>
                )}
              </div>

              {/* Action Buttons: Toggle Local Filters & Export */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleLocalFilters}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition cursor-pointer ${
                    isLocalFiltersOpen
                      ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]"
                      : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                  title={isLocalFiltersOpen ? "Hide Local Filters panel" : "Show Local Filters panel"}
                >
                  <Filter className="h-3.5 w-3.5" />
                  <span>{isLocalFiltersOpen ? "Hide Filters" : "Show Filters"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => exportResults("json")}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                  title="Export results to JSON"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>JSON</span>
                </button>

                <button
                  type="button"
                  onClick={() => exportResults("csv")}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                  title="Export results to CSV"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>CSV</span>
                </button>
              </div>
            </div>

            {/* Bulk Selection Bar */}
            {visibleItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3.5 py-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedKeys.size === visibleItems.length) setSelectedKeys(new Set());
                    else setSelectedKeys(new Set(visibleItems.map((i) => discoveryCompositeKey(i.apiVersion, i.kind, i.id))));
                  }}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 py-1 text-xs font-bold hover:border-[var(--primary)] cursor-pointer"
                >
                  {selectedKeys.size === visibleItems.length ? "Deselect All" : "Select All Visible"}
                </button>

                {selectedKeys.size > 0 && (
                  <>
                    <span className="text-[var(--primary)] font-black">{selectedKeys.size} selected</span>
                    <button
                      type="button"
                      onClick={() => void saveSelectedItems()}
                      className="rounded-md bg-primary px-3 py-1 font-black uppercase text-primary-foreground shadow-xs cursor-pointer hover:opacity-90"
                    >
                      Save Selected
                    </button>
                    {merged.collections.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label="Target collection"
                          value={bulkCollectionId}
                          onChange={(e) => setBulkCollectionId(e.target.value)}
                          className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1 text-xs font-bold"
                        >
                          <option value="">Choose collection...</option>
                          {merged.collections.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!bulkCollectionId}
                          onClick={() => void addSelectedToCollection()}
                          className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 py-1 font-bold disabled:opacity-50 cursor-pointer"
                        >
                          + Collection
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedKeys(new Set())}
                      className="ml-auto text-xs text-[var(--muted-foreground)] hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Results Grid with Type-Aware Result Cards */}
            {visibleItems.length === 0 ? (
              <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] p-8 text-center bg-[var(--card)]/50">
                <Search className="h-10 w-10 text-[var(--muted-foreground)]/50 mb-3" />
                <p className="font-bold text-base">No items match your local filters</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)] max-w-sm">
                  {items.length} items were fetched, but none match the current filter criteria.
                </p>
                <button
                  type="button"
                  onClick={() => setLocalFilters(DEFAULT_DISCOVERY_LOCAL_FILTERS)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-1.5 text-xs font-bold cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Local Filters
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3">
                {visibleItems.map((item) => {
                  const cKey = discoveryCompositeKey(item.apiVersion, item.kind, item.id);
                  const isSavedLocal = merged.savedKeys.has(cKey) || workspace.isItemSaved(item.apiVersion, item.kind, item.id);
                  return (
                    <ResultCard
                      key={cKey}
                      item={item}
                      saved={isSavedLocal}
                      favorite={merged.favoriteKeys.has(cKey)}
                      collections={merged.collections.map((c) => ({ id: c.id, name: c.name }))}
                      selectable
                      selected={selectedKeys.has(cKey)}
                      onToggleSelect={() => toggleSelectKey(cKey)}
                      onToggleFavorite={() => {
                        if (!isSavedLocal) {
                          void merged.coordinator.toggleSaveItem(item).then(() =>
                            merged.coordinator.setSavedItemFavorite(cKey, true)
                          );
                        } else {
                          void merged.coordinator.setSavedItemFavorite(cKey, !merged.favoriteKeys.has(cKey));
                        }
                      }}
                      onAddToCollection={(colId) => void merged.coordinator.addItemToCollection(colId, item)}
                      onToggleSave={() => {
                        void merged.coordinator.toggleSaveItem(item);
                        if (workspace.isItemSaved(item.apiVersion, item.kind, item.id)) {
                          workspace.removeItem(item.apiVersion, item.kind, item.id);
                        } else {
                          workspace.saveItem(item);
                        }
                      }}
                    />
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {meta?.hasMore && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                <span className="text-xs text-[var(--muted-foreground)]">
                  Page {meta.page} {meta.total ? `of approx. ${Math.ceil(meta.total / meta.pageSize)}` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void runSearch(meta.page + 1, false)}
                    className="min-h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold hover:border-[var(--primary)] disabled:opacity-50 cursor-pointer"
                  >
                    Next Page ({meta.page + 1})
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void runSearch(meta.page + 1, true)}
                    className="min-h-9 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground shadow-xs hover:opacity-95 disabled:opacity-50 cursor-pointer"
                  >
                    Load More (Append)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Side: Dedicated Collapsible Local Filters Panel */}
          {isLocalFiltersOpen && (
            <div className="col-span-12 xl:col-span-4 2xl:col-span-3">
              <div className="sticky top-16 space-y-3">
                <DiscoveryLocalFilterPanel
                  value={localFilters}
                  onChange={setLocalFilters}
                  totalLoaded={items.length}
                  filteredCount={visibleItems.length}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State before any search is run */}
      {!hasSearched && (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] p-8 text-center bg-[var(--card)]/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface-container-high)] text-[var(--primary)] mb-3">
            <Search className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-black">Search Dailymotion Metadata Terminal</h2>
          <p className="mt-1.5 max-w-md text-xs leading-5 text-[var(--muted-foreground)]">
            Type any keywords or select your API parameters above. Full API responses are automatically snapshotted in IndexedDB for offline replay.
          </p>
        </div>
      )}
    </div>
  );
}
