// DiscoveryExplorer — shared result-rendering component for v1/v2 workspaces.
//
// What this controls: search forms, result grids, pagination, local filters,
// raw inspection, export, history, and cross-version links for every discovery
// page. Data fetching always targets `/api/discovery/{version}/{resource}` —
// the version prop selects the endpoint, params come from that version's
// capability entry, and responses render through the shared normalized model
// with the original `apiVersion` badge intact.
// Why shared: identical interaction patterns, zero version leakage (controls
// derive from the capability registry, never hardcoded per page).
// Scope: all /general|videos|channels|playlists|users|live v1/v2 pages.
// URL state: the address bar is the state (refresh/share safe); local filters
// stay client-side and are labelled "retrieved results".
// Future agents: add controls by extending the registry + INPUTS map below.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCapability } from "@/lib/discovery/capability-registry";
import { mergeDiscoveryItems, type ApiVersion, type DiscoveryFailure, type DiscoveryItem, type DiscoveryResource } from "@/lib/discovery/types";
import { ResultCard } from "./result-card";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";

const V1_CATEGORIES = ["news", "sport", "music", "tech", "fun", "people", "animals", "auto", "creation", "kids", "lifestyle", "school", "travel", "tv", "videogames", "webcam"];
const V1_LIVE_OPTIONS = [
  { value: "live_onair", label: "On air now" },
  { value: "live_upcoming", label: "Upcoming" },
  { value: "live_offair", label: "Off air" },
  { value: "live", label: "Any live" },
  { value: "no_live", label: "Exclude live" },
];
const PAGE_SIZES = ["10", "20", "50", "100"];

interface ExplorerProps {
  version: ApiVersion;
  resource: DiscoveryResource;
  pageTitle: string;
  pageDescription: string;
  /** Counterpart route, e.g. "/general-v2" from a v1 page. */
  counterpartPath: string;
}

interface LastMeta {
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  capped: boolean;
  endpoint: string;
}

function modesFor(resource: DiscoveryResource, version: ApiVersion): { value: string; label: string }[] {
  if (version === "v1") {
    switch (resource) {
      case "general": return [{ value: "search", label: "Search" }];
      case "videos": return [{ value: "search", label: "Search" }, { value: "lookup", label: "Look up by ID" }, { value: "related", label: "Related videos" }];
      case "channels": return [{ value: "search", label: "Search channels" }, { value: "lookup", label: "Profile lookup" }, { value: "videos", label: "Videos by profile" }];
      case "playlists": return [{ value: "owner", label: "Playlists by owner" }, { value: "lookup", label: "Playlist lookup" }, { value: "videos", label: "Videos in playlist" }];
      case "users": return [{ value: "search", label: "Search users" }, { value: "lookup", label: "User lookup" }];
      case "live": return [{ value: "search", label: "Live search" }];
    }
  }
  switch (resource) {
    case "general":
    case "videos": return [{ value: "browse", label: "Browse profile videos" }, { value: "lookup", label: "Video lookup" }];
    case "channels": return [{ value: "lookup", label: "Profile lookup" }, { value: "me", label: "My profiles (/me)" }];
    case "playlists": return [{ value: "browse", label: "Playlists by profile" }, { value: "lookup", label: "Playlist lookup" }, { value: "videos", label: "Videos in playlist" }];
    case "users": return [{ value: "lookup", label: "User lookup" }, { value: "me", label: "My identity (/me)" }];
    case "live": return [{ value: "browse", label: "Livestreams by profile" }, { value: "lookup", label: "Livestream lookup" }];
    default: return [{ value: "browse", label: "Browse" }];
  }
}

function serverInputsFor(resource: DiscoveryResource, version: ApiVersion): string[] {
  const cap = getCapability(resource, version);
  const keys = cap.serverFilters.map((f) => f.key);
  const inputs: string[] = [];
  if (version === "v1" && (resource === "general" || resource === "videos" || resource === "live")) inputs.push("q");
  if (version === "v1" && (resource === "channels" || resource === "users")) inputs.push("q");
  if (keys.includes("channel")) inputs.push("channel");
  if (keys.includes("country")) inputs.push("country");
  if (keys.includes("languages")) inputs.push("languages");
  if (keys.includes("language")) inputs.push("language");
  if (keys.includes("tags")) inputs.push("tags");
  if (keys.includes("created_after")) inputs.push("createdAfter", "createdBefore");
  if (keys.includes("longer_than")) inputs.push("longerThan");
  if (keys.includes("shorter_than")) inputs.push("shorterThan");
  if (keys.includes("owners")) inputs.push("owners");
  if (keys.includes("usernames")) inputs.push("usernames");
  if (keys.includes("owner")) inputs.push("owner");
  if (keys.includes("live")) inputs.push("live");
  if (keys.includes("visibility")) inputs.push("visibility");
  if (keys.includes("status")) inputs.push("status");
  if (keys.includes("family_filter")) inputs.push("familyFilter");
  if (keys.includes("localization")) inputs.push("localization");
  if (cap.sorts.length > 0) inputs.push("sort");
  inputs.push("pageSize");
  return inputs;
}

function toCsv(items: DiscoveryItem[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["version", "kind", "id", "title", "url", "owner", "language", "category", "createdAt", "duration", "views"]];
  for (const item of items) {
    rows.push([item.apiVersion, item.kind, item.id, item.title, item.url, item.ownerName, item.language, item.category, item.createdAt, item.duration, item.views].map(esc));
  }
  return rows.map((r) => r.join(",")).join("\n");
}

export function DiscoveryExplorer({ version, resource, pageTitle, pageDescription, counterpartPath }: ExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const capability = useMemo(() => getCapability(resource, version), [resource, version]);
  const modes = useMemo(() => modesFor(resource, version), [resource, version]);
  const inputs = useMemo(() => serverInputsFor(resource, version), [resource, version]);
  const workspace = useDiscoveryWorkspace();

  const [mode, setMode] = useState(() => searchParams.get("mode") ?? modes[0].value);
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of ["q", "id", "owner", "profileId", "channel", "country", "languages", "language", "tags", "createdAfter", "createdBefore", "longerThan", "shorterThan", "owners", "usernames", "live", "visibility", "status", "sort", "pageSize", "familyFilter", "localization"]) {
      const value = searchParams.get(key);
      if (value !== null) initial[key] = value;
    }
    if (!initial.pageSize) initial.pageSize = "20";
    if (!initial.sort && capability.defaultSort) initial.sort = capability.defaultSort;
    if ((resource === "live" && version === "v1") && !initial.live) initial.live = "live_onair";
    return initial;
  });
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [meta, setMeta] = useState<LastMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<DiscoveryFailure | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [meData, setMeData] = useState<unknown>(null);
  const [local, setLocal] = useState({ query: "", language: "", category: "", minDuration: "", hasThumbnail: false });
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const inflightKey = useRef<string | null>(null);

  const set = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  }, []);

  const buildParams = useCallback((page: number) => {
    const params = new URLSearchParams({ mode });
    for (const [key, value] of Object.entries(fields)) {
      if (value !== "" && value !== undefined) params.set(key, value);
    }
    params.set("page", String(page));
    return params;
  }, [fields, mode]);

  const runSearch = useCallback(async (page: number, append: boolean) => {
    // In-flight key guard: prevents double history/counters from React
    // double effects, double clicks, or repeated handlers for one submit.
    const params = buildParams(page);
    const submitKey = `${version}:${resource}:${params.toString()}:${append ? "append" : "submit"}`;
    if (!append) {
      if (inflightKey.current === submitKey) return;
      inflightKey.current = submitKey;
    }
    setLoading(true);
    setFailure(null);
    if (!append) workspace.recordSearchSubmitted(version);
    try {
      const response = await fetch(`/api/discovery/${version}/${resource}?${params.toString()}`);
      const data = (await response.json()) as
        | { ok: true; result?: { items: DiscoveryItem[]; page: number; pageSize: number; total: number | null; hasMore: boolean; capped: boolean; endpoint: string }; data?: unknown }
        | DiscoveryFailure;
      if (!data.ok) {
        setFailure(data as DiscoveryFailure);
        if (!append) { setItems([]); setMeta(null); }
        setHasSearched(true);
        if (!append) workspace.recordSearchOutcome(version, false, 1);
        else workspace.recordApiCalls(version, 1);
        return;
      }
      if ("data" in data && !("result" in data)) {
        // /me-style single payload (channels/users v2).
        setMeData(data.data);
        setItems([]);
        setMeta(null);
        setHasSearched(true);
        if (!append) workspace.recordSearchOutcome(version, true, 1);
        else workspace.recordApiCalls(version, 1);
        return;
      }
      const result = (data as { result: { items: DiscoveryItem[]; page: number; pageSize: number; total: number | null; hasMore: boolean; capped: boolean; endpoint: string } }).result;
      setMeData(null);
      setItems((prev) => (append ? mergeDiscoveryItems(prev, result.items) : result.items));
      setMeta({ page: result.page, pageSize: result.pageSize, total: result.total, hasMore: result.hasMore, capped: result.capped, endpoint: result.endpoint });
      setHasSearched(true);
      router.replace(`?${params.toString()}`, { scroll: false });
      if (!append) {
        workspace.addHistory({
          version, resource,
          label: `${capability.title}: ${fields.q || fields.id || fields.owner || fields.profileId || mode}`,
          params: Object.fromEntries(params.entries()),
          resultCount: result.total ?? result.items.length,
        });
        workspace.recordSearchOutcome(version, true, 1);
      } else {
        workspace.recordApiCalls(version, 1);
      }
    } catch {
      setFailure({ ok: false, error: "Request failed (network).", reason: "network_error", status: 503, apiVersion: version, resource, endpoint: "", remedy: null, retryable: true });
      if (!append) workspace.recordSearchOutcome(version, false, 1);
      else workspace.recordApiCalls(version, 1);
    } finally {
      setLoading(false);
      if (!append) inflightKey.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildParams, capability.title, resource, version]);

  // Auto-run when landing with URL params (preserved state / shared links).
  useEffect(() => {
    const hasQuery = [...searchParams.keys()].length > 0;
    if (hasQuery) void runSearch(Number(searchParams.get("page") ?? 1), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = local.query.trim().toLowerCase();
    const lang = local.language.trim().toLowerCase();
    const cat = local.category.trim().toLowerCase();
    const minDur = local.minDuration === "" ? null : Number(local.minDuration);
    return items.filter((item) => {
      if (q && !`${item.title} ${item.description ?? ""} ${item.ownerName ?? ""} ${item.id}`.toLowerCase().includes(q)) return false;
      if (lang && (item.language ?? "").toLowerCase() !== lang) return false;
      if (cat && (item.category ?? "").toLowerCase() !== cat) return false;
      if (minDur !== null && Number.isFinite(minDur) && (item.duration ?? 0) < minDur * 60) return false;
      if (local.hasThumbnail && !item.thumbnail) return false;
      return true;
    });
  }, [items, local]);

  const counterpartHref = useMemo(() => {
    const params = new URLSearchParams();
    if (fields.q) params.set("q", fields.q);
    if (fields.id) params.set("id", fields.id);
    if (fields.owner) params.set("profileId", fields.owner);
    if (fields.profileId) params.set("profileId", fields.profileId);
    const qs = params.toString();
    return qs ? `${counterpartPath}?${qs}` : counterpartPath;
  }, [counterpartPath, fields]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ version, resource, exportedAt: new Date().toISOString(), count: filtered.length, items: filtered }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dailymotion-${version}-${resource}-results.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, resource, version]);

  const exportCsv = useCallback(() => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dailymotion-${version}-${resource}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, resource, version]);

  const saveCurrentSearch = useCallback(() => {
    workspace.saveSearch({ version, resource, label: `${capability.title}: ${fields.q || fields.id || fields.owner || fields.profileId || mode}`, params: Object.fromEntries(buildParams(1).entries()) });
    setSavedFlash("Search saved to workspace.");
    setTimeout(() => setSavedFlash(null), 2500);
  }, [buildParams, capability.title, fields, mode, resource, version, workspace]);

  const needsId = mode === "lookup" || mode === "related";
  const needsOwner = mode === "owner" || (mode === "videos" && resource !== "videos" && version === "v1");
  const needsPlaylistId = mode === "videos" && resource === "playlists";
  const needsProfile = version === "v2" && mode === "browse";

  const inputClass = "min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold text-[var(--foreground)]";
  const labelClass = "mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]";

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">
            {version === "v1" ? "Legacy API v1" : "API v2"} · {capability.endpoint}
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">{pageTitle}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">{pageDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md border px-3 py-1.5 text-xs font-black uppercase ${version === "v1" ? "border-[var(--primary)] text-[var(--primary)]" : "border-emerald-500 text-emerald-600 dark:text-emerald-400"}`}>
            {version.toUpperCase()}
          </span>
          <a href={counterpartHref} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-black uppercase text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            Open in {version === "v1" ? "v2" : "v1"}
          </a>
        </div>
      </section>

      {!capability.globalSearch && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-4 text-sm leading-6">
          <p className="font-black">No global search in this version.</p>
          <p className="mt-1 text-[var(--muted-foreground)]">{capability.alternativeWorkflow}</p>
        </div>
      )}
      {version === "v2" && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-4 text-sm leading-6 text-[var(--muted-foreground)]">
          API v2 requires authentication (private API key + Bearer token). Without credentials this page reports the exact missing configuration instead of empty results.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[0.38fr_0.62fr]">
        <div className="space-y-5 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
          <div>
            <label className={labelClass} htmlFor="dm-mode">Operation</label>
            <select id="dm-mode" className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
              {modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {needsId && (
            <div>
              <label className={labelClass} htmlFor="dm-id">ID (preserved exactly)</label>
              <input id="dm-id" className={inputClass} value={fields.id ?? ""} onChange={(e) => set("id", e.target.value)} placeholder={resource === "playlists" ? "Playlist ID" : "Video / profile ID"} />
            </div>
          )}
          {needsOwner && (
            <div>
              <label className={labelClass} htmlFor="dm-owner">Owner profile (ID or username)</label>
              <input id="dm-owner" className={inputClass} value={fields.owner ?? ""} onChange={(e) => set("owner", e.target.value)} placeholder="e.g. lequipe" />
            </div>
          )}
          {needsPlaylistId && (
            <div>
              <label className={labelClass} htmlFor="dm-pl">Playlist ID</label>
              <input id="dm-pl" className={inputClass} value={fields.id ?? ""} onChange={(e) => set("id", e.target.value)} placeholder="Playlist ID" />
            </div>
          )}
          {needsProfile && (
            <div>
              <label className={labelClass} htmlFor="dm-profile">Profile ID (v2 is profile-scoped)</label>
              <input id="dm-profile" className={inputClass} value={fields.profileId ?? ""} onChange={(e) => set("profileId", e.target.value)} placeholder="e.g. xiy" />
            </div>
          )}
          {mode === "videos" && resource === "channels" && version === "v1" && (
            <div>
              <label className={labelClass} htmlFor="dm-cowner">Profile (ID or username)</label>
              <input id="dm-cowner" className={inputClass} value={fields.owner ?? ""} onChange={(e) => set("owner", e.target.value)} placeholder="e.g. lequipe" />
            </div>
          )}

          {inputs.includes("q") && !needsId && (
            <div>
              <label className={labelClass} htmlFor="dm-q">Search query (exact, Unicode-safe)</label>
              <input id="dm-q" className={inputClass} value={fields.q ?? ""} onChange={(e) => set("q", e.target.value)} placeholder="Search… (quotes, accents, Arabic, emoji preserved)" />
            </div>
          )}
          {inputs.includes("channel") && (
            <div>
              <label className={labelClass} htmlFor="dm-channel">Category</label>
              <select id="dm-channel" className={inputClass} value={fields.channel ?? ""} onChange={(e) => set("channel", e.target.value)}>
                <option value="">Any category</option>
                {V1_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {inputs.includes("country") && (
              <div>
                <label className={labelClass} htmlFor="dm-country">Country</label>
                <input id="dm-country" className={inputClass} value={fields.country ?? ""} onChange={(e) => set("country", e.target.value)} placeholder="US" />
              </div>
            )}
            {inputs.includes("languages") && (
              <div>
                <label className={labelClass} htmlFor="dm-langs">Languages</label>
                <input id="dm-langs" className={inputClass} value={fields.languages ?? ""} onChange={(e) => set("languages", e.target.value)} placeholder="en,fr" />
              </div>
            )}
          </div>
          {inputs.includes("language") && (
            <div>
              <label className={labelClass} htmlFor="dm-lang">Language</label>
              <input id="dm-lang" className={inputClass} value={fields.language ?? ""} onChange={(e) => set("language", e.target.value)} placeholder="en" />
            </div>
          )}
          {inputs.includes("tags") && (
            <div>
              <label className={labelClass} htmlFor="dm-tags">Tags</label>
              <input id="dm-tags" className={inputClass} value={fields.tags ?? ""} onChange={(e) => set("tags", e.target.value)} placeholder="comma-separated" />
            </div>
          )}
          {(inputs.includes("createdAfter") || inputs.includes("createdBefore")) && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="dm-after">Created after</label>
                <input id="dm-after" type="date" className={inputClass} value={fields.createdAfter ?? ""} onChange={(e) => set("createdAfter", e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="dm-before">Created before</label>
                <input id="dm-before" type="date" className={inputClass} value={fields.createdBefore ?? ""} onChange={(e) => set("createdBefore", e.target.value)} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {inputs.includes("longerThan") && (
              <div>
                <label className={labelClass} htmlFor="dm-longer">Min duration (min)</label>
                <input id="dm-longer" type="number" min={0} className={inputClass} value={fields.longerThan ?? ""} onChange={(e) => set("longerThan", e.target.value)} />
              </div>
            )}
            {inputs.includes("shorterThan") && (
              <div>
                <label className={labelClass} htmlFor="dm-shorter">Max duration (min)</label>
                <input id="dm-shorter" type="number" min={0} className={inputClass} value={fields.shorterThan ?? ""} onChange={(e) => set("shorterThan", e.target.value)} />
              </div>
            )}
          </div>
          {inputs.includes("owners") && (
            <div>
              <label className={labelClass} htmlFor="dm-owners">Owners (comma-separated)</label>
              <input id="dm-owners" className={inputClass} value={fields.owners ?? ""} onChange={(e) => set("owners", e.target.value)} />
            </div>
          )}
          {inputs.includes("usernames") && (
            <div>
              <label className={labelClass} htmlFor="dm-unames">Usernames</label>
              <input id="dm-unames" className={inputClass} value={fields.usernames ?? ""} onChange={(e) => set("usernames", e.target.value)} />
            </div>
          )}
          {inputs.includes("live") && (
            <div>
              <label className={labelClass} htmlFor="dm-live">Live status</label>
              <select id="dm-live" className={inputClass} value={fields.live ?? "live_onair"} onChange={(e) => set("live", e.target.value)}>
                {V1_LIVE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {inputs.includes("visibility") && (
            <div>
              <label className={labelClass} htmlFor="dm-vis">Visibility</label>
              <select id="dm-vis" className={inputClass} value={fields.visibility ?? ""} onChange={(e) => set("visibility", e.target.value)}>
                <option value="">Any</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="password">Password</option>
              </select>
            </div>
          )}
          {inputs.includes("status") && (
            <div>
              <label className={labelClass} htmlFor="dm-status">Livestream status</label>
              <input id="dm-status" className={inputClass} value={fields.status ?? ""} onChange={(e) => set("status", e.target.value)} placeholder="e.g. live" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {inputs.includes("sort") && (
              <div>
                <label className={labelClass} htmlFor="dm-sort">Sort</label>
                <select id="dm-sort" className={inputClass} value={fields.sort ?? capability.defaultSort} onChange={(e) => set("sort", e.target.value)}>
                  {capability.sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass} htmlFor="dm-ps">Page size</label>
              <select id="dm-ps" className={inputClass} value={fields.pageSize ?? "20"} onChange={(e) => set("pageSize", e.target.value)}>
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {inputs.includes("familyFilter") && (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={fields.familyFilter !== "false"} onChange={(e) => set("familyFilter", e.target.checked ? "" : "false")} />
              Family filter (explicit content hidden)
            </label>
          )}
          {inputs.includes("localization") && (
            <div>
              <label className={labelClass} htmlFor="dm-loc">Localization</label>
              <input id="dm-loc" className={inputClass} value={fields.localization ?? ""} onChange={(e) => set("localization", e.target.value)} placeholder="e.g. fr_FR" />
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={loading} onClick={() => void runSearch(1, false)} className="min-h-11 flex-1 rounded-md bg-[var(--primary)] px-4 text-sm font-black text-white disabled:opacity-60">
              {loading ? "Searching…" : "Search"}
            </button>
            <button type="button" onClick={saveCurrentSearch} className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm font-bold">
              Save search
            </button>
          </div>
          {savedFlash && <p className="text-xs font-bold text-emerald-600">{savedFlash}</p>}

          <details className="rounded-md border border-[var(--border)] p-3 text-xs leading-5 text-[var(--muted-foreground)]">
            <summary className="cursor-pointer font-black uppercase">Local filters (retrieved results only)</summary>
            <div className="mt-3 grid gap-2">
              <input className={inputClass} value={local.query} onChange={(e) => setLocal((p) => ({ ...p, query: e.target.value }))} placeholder="Filter retrieved results…" />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputClass} value={local.language} onChange={(e) => setLocal((p) => ({ ...p, language: e.target.value }))} placeholder="Language" />
                <input className={inputClass} value={local.category} onChange={(e) => setLocal((p) => ({ ...p, category: e.target.value }))} placeholder="Category" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" min={0} className={inputClass} value={local.minDuration} onChange={(e) => setLocal((p) => ({ ...p, minDuration: e.target.value }))} placeholder="Min minutes" />
                <label className="flex items-center gap-2 font-semibold">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={local.hasThumbnail} onChange={(e) => setLocal((p) => ({ ...p, hasThumbnail: e.target.checked }))} />
                  Has thumbnail
                </label>
              </div>
              <button type="button" onClick={() => setLocal({ query: "", language: "", category: "", minDuration: "", hasThumbnail: false })} className="min-h-9 rounded-md border border-[var(--border)] text-xs font-black uppercase">
                Reset local filters
              </button>
            </div>
          </details>
        </div>

        <div className="space-y-4">
          {failure && (
            <div className="rounded-md border border-red-500/50 bg-red-500/10 p-4 text-sm leading-6" role="alert">
              <p className="font-black">Request failed ({failure.reason})</p>
              <p className="mt-1">{failure.error}</p>
              {failure.remedy && <p className="mt-1 font-semibold">{failure.remedy}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void runSearch(meta?.page ?? 1, false)} className="min-h-10 rounded-md bg-[var(--primary)] px-4 text-xs font-black uppercase text-white">
                  Retry
                </button>
                <a href={counterpartHref} className="inline-flex min-h-10 items-center rounded-md border border-[var(--border)] px-4 text-xs font-black uppercase">
                  Try {version === "v1" ? "v2" : "v1"} instead
                </a>
              </div>
            </div>
          )}

          {meData !== null && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
              <h2 className="font-black">Authenticated identity (/me)</h2>
              <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-[var(--surface-container-low)] p-3 text-xs">{JSON.stringify(meData, null, 2)}</pre>
            </div>
          )}

          {(hasSearched || items.length > 0) && meData === null && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs font-bold text-[var(--muted-foreground)]">
              <span>
                Retrieved <strong className="text-[var(--foreground)]">{filtered.length}</strong>
                {meta?.total !== null && meta?.total !== undefined ? <> of <strong className="text-[var(--foreground)]">{meta.total}</strong> reported</> : " (total not reported)"}
                {meta?.hasMore ? " · more pages available" : " · end of results"}
                {meta?.capped ? " · result-window cap reached — narrow with date filters" : ""}
              </span>
              <span className="flex gap-2">
                <button type="button" onClick={exportJson} className="rounded-md border border-[var(--border)] px-2 py-1 uppercase">JSON</button>
                <button type="button" onClick={exportCsv} className="rounded-md border border-[var(--border)] px-2 py-1 uppercase">CSV</button>
              </span>
            </div>
          )}

          {!hasSearched && (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
              <p className="font-black">No search has been run</p>
              <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground)]">Configure the {version.toUpperCase()} operation and press Search. No placeholder data is rendered.</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((item) => (
              <ResultCard
                key={`${item.apiVersion}:${item.kind}:${item.id}`}
                item={item}
                saved={workspace.isItemSaved(item.apiVersion, item.kind, item.id)}
                onToggleSave={() => {
                  if (workspace.isItemSaved(item.apiVersion, item.kind, item.id)) workspace.removeItem(item.apiVersion, item.kind, item.id);
                  else workspace.saveItem(item);
                }}
              />
            ))}
          </div>

          {hasSearched && filtered.length === 0 && !failure && meData === null && (
            <div className="rounded-lg border border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
              No results matched. {items.length > 0 ? "Local filters hide all retrieved records — reset them." : "The endpoint returned an empty set."}
            </div>
          )}

          {meta?.hasMore && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={loading} onClick={() => void runSearch(meta.page + 1, false)} className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm font-bold disabled:opacity-60">
                {loading ? "Loading…" : `Next page (${meta.page + 1})`}
              </button>
              <button type="button" disabled={loading} onClick={() => void runSearch(meta.page + 1, true)} className="min-h-11 rounded-md bg-[var(--primary)] px-4 text-sm font-black text-white disabled:opacity-60">
                Load more (append)
              </button>
            </div>
          )}
          {meta && <p className="text-xs text-[var(--muted-foreground)]">Endpoint: <code>{meta.endpoint}</code> · page {meta.page} · {meta.pageSize}/page</p>}
        </div>
      </div>
    </div>
  );
}
