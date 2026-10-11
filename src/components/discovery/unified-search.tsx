// UnifiedSearch — version-selectable Search page (Task B §3).
//
// What this controls: the /search experience — full-width bar, V1/V2
// selector, dynamic filter panel from the param-schema registry, results.
// Why it exists: one prominent entry point where the version selector drives
// which parameter schema renders; the selected version is preserved across
// failures (never silent fallback) and remembered via the workspace store.
// Precedence: explicit UI choices → per-version saved defaults → safe
// registry defaults → omit unsupported. Cache keys separate every combination.
// Scope: /search only. Dedicated v1/v2 pages keep their curated explorers.
// Future agents: add params in param-schema.ts — this panel follows.

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  V1_MANDATORY_FIELDS,
  V1_VIDEO_FIELD_OPTIONS,
  V2_MANDATORY_FIELDS,
  V2_VIDEO_FIELD_OPTIONS,
  buildSearchCacheKey,
  resolveFields,
  resolveSort,
  schemaFor,
  type ParamDef,
  type ParamGroup,
} from "@/lib/discovery/param-schema";
import { mergeDiscoveryItems, type ApiVersion, type DiscoveryFailure, type DiscoveryItem } from "@/lib/discovery/types";
import { ResultCard } from "./result-card";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";

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

const inputClass = "min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]";
const labelClass = "mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]";

function ParamControl({ def, value, onChange }: { def: ParamDef; value: string; onChange: (value: string) => void }) {
  const id = `usearch-${def.key}`;
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
    // Tri-state: "" (Auto/omit = API default ON = safe), "true", "false".
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
              className={`min-h-9 rounded px-2 text-xs font-black uppercase ${value === o.v ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
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
  const [version, setVersion] = useState<ApiVersion>(workspace.lastSearchVersion ?? "v1");
  const [query, setQuery] = useState("");
  const [profileId, setProfileId] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fieldSelection, setFieldSelection] = useState<string[] | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [meta, setMeta] = useState<ResultsMeta | null>(null);
  const [failure, setFailure] = useState<DiscoveryFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inflightKey = useRef<string | null>(null);

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
  }

  const runSearch = useCallback(async (page: number, append: boolean) => {
    // Duplicate-submit guard (double clicks/effects): one history entry + counters per submit.
    const submitKey = `${version}:${query}:${profileId}:${JSON.stringify(filters)}:${fieldSelection?.join(",") ?? ""}:${page}:${append}`;
    if (!append) {
      if (inflightKey.current === submitKey) return;
      inflightKey.current = submitKey;
    }
    setLoading(true);
    setFailure(null);
    setNotice(null);
    if (!append) workspace.recordSearchSubmitted(version);
    try {
      const params = new URLSearchParams();
      params.set("mode", version === "v1" ? "search" : "browse");
      if (version === "v1") {
        if (query !== "") params.set("q", query); // exact preservation
      } else {
        if (!profileId.trim()) {
          setFailure({ ok: false, error: "Enter a profile ID — v2 has no global search.", reason: "user_input_error", status: 400, apiVersion: "v2", resource: "general", endpoint: "GET /profiles/{profile_id}/videos", remedy: "Collect profile IDs via GET /v2/me once authenticated.", retryable: false });
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
      // family_filter tri-state: "" = omit (safe). Preserve real "false".
      if (version === "v1") {
        const ff = getValue(schema.find((d) => d.key === "familyFilter")!);
        void ff; // already set above generically; kept explicit for clarity
      }
      const resolvedFields = resolveFields(version, fieldSelection);
      if (resolvedFields) params.set("fields", resolvedFields.join(","));
      params.set("page", String(page));

      const response = await fetch(`/api/discovery/${version}/general?${params.toString()}`);
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
      setItems((prev) => (append ? mergeDiscoveryItems(prev, data.result.items) : data.result.items));
      setMeta({ page: data.result.page, pageSize: data.result.pageSize, total: data.result.total, hasMore: data.result.hasMore, capped: data.result.capped, endpoint: data.result.endpoint });
      setHasSearched(true);
      if (!append) {
        const effective = Object.fromEntries(params.entries());
        workspace.addHistory({
          version, resource: "general",
          label: `Search (${version.toUpperCase()}): ${query || profileId || "filters"}`,
          params: { ...effective, cacheKey: buildSearchCacheKey(version, "general", version === "v1" ? "search" : "browse", effective) },
          resultCount: data.result.total ?? data.result.items.length,
        });
        workspace.recordSearchOutcome(version, true, 1);
      } else {
        workspace.recordApiCalls(version, 1);
      }
    } catch {
      setFailure({ ok: false, error: "Request failed (network).", reason: "network_error", status: 503, apiVersion: version, resource: "general", endpoint: "", remedy: null, retryable: true });
      if (!append) workspace.recordSearchOutcome(version, false, 1);
      else workspace.recordApiCalls(version, 1);
    } finally {
      setLoading(false);
      if (!append) inflightKey.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldSelection, filters, profileId, query, schema, version]);

  const familyValue = getValue(schema.find((d) => d.key === "familyFilter") ?? { key: "familyFilter", default: null } as ParamDef);

  function toggleField(value: string) {
    if (mandatoryFields.includes(value)) return; // mandatory locked
    setFieldSelection((prev) => {
      const base = prev ?? [];
      return base.includes(value) ? base.filter((f) => f !== value) : [...base, value];
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Unified search</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Search Dailymotion</h1>
      </div>

      {/* Version selector — declares which integration receives the request. */}
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="API version">
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 sm:max-w-md" role="radiogroup" aria-label="API version">
          {(["v1", "v2"] as ApiVersion[]).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={version === v}
              onClick={() => switchVersion(v)}
              className={`min-h-11 rounded-md px-4 text-sm font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] ${version === v ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              {v === "v1" ? "V1 Legacy / Partner" : "V2"}
            </button>
          ))}
        </div>
        <p className="text-xs font-bold text-[var(--muted-foreground)]" aria-live="polite">
          Next search → <strong className="text-[var(--foreground)]">{version === "v1" ? "Legacy API v1" : "API v2"}</strong>
          {version === "v2" ? " (authenticated, profile-scoped)" : " (public global search)"}
        </p>
      </div>

      {/* Full-width prominent search bar. */}
      <form onSubmit={(e) => { e.preventDefault(); void runSearch(1, false); }} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="unified-q" className="sr-only">Search query</label>
        <input
          id="unified-q"
          className="min-h-13 w-full flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-base font-semibold"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={version === "v1" ? "Search public Dailymotion videos… (exact, Unicode-safe)" : "Query is informational for v2 — profile ID below selects the catalog"}
          autoComplete="off"
        />
        {version === "v2" && (
          <>
            <label htmlFor="unified-profile" className="sr-only">Profile ID</label>
            <input
              id="unified-profile"
              className="min-h-13 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-base font-semibold sm:max-w-56"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              placeholder="Profile ID (e.g. xiy)"
              autoComplete="off"
            />
          </>
        )}
        <button type="submit" disabled={loading} className="min-h-13 rounded-lg bg-[var(--primary)] px-8 text-base font-black text-white disabled:opacity-60">
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {/* Dynamic filter panel from the version schema. */}
      <section aria-label="Search filters" className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5">
        {GROUPS.filter((g) => g.key !== "advanced").map((group) => {
          const inGroup = schema.filter((d) => d.group === group.key);
          if (inGroup.length === 0) return null;
          return (
            <fieldset key={group.key}>
              <legend className="px-1 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted-foreground)]">{group.label}</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {inGroup.map((def) => (
                  <ParamControl key={def.key} def={def} value={getValue(def)} onChange={(v) => setFilter(def.key, v)} />
                ))}
              </div>
            </fieldset>
          );
        })}

        {version === "v2" && (
          <p className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-3 text-xs leading-5 text-[var(--muted-foreground)]">
            v2 has no <code>localization</code> or <code>family_filter</code> parameters. Use <code>is_explicit</code> above instead of family filtering (different semantics), and language/country result fields instead of localization.
          </p>
        )}
        {version === "v1" && familyValue === "false" && (
          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs leading-5" role="alert">
            <strong>Warning:</strong> family filter is OFF — results may include explicit content. The API default is ON; this opt-out is sent only because you selected Off.
          </p>
        )}

        <details open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)} className="rounded-md border border-[var(--border)]">
          <summary className="cursor-pointer px-4 py-3 text-xs font-black uppercase tracking-[0.14em]">Advanced filters</summary>
          <div className="grid gap-3 border-t border-[var(--border)] p-4 sm:grid-cols-2 lg:grid-cols-4">
            {schema.filter((d) => d.group === "advanced").map((def) => (
              <ParamControl key={def.key} def={def} value={getValue(def)} onChange={(v) => setFilter(def.key, v)} />
            ))}
            <div className="sm:col-span-2">
              <span className={labelClass}>Response fields (id + title always kept)</span>
              <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-md border border-[var(--border)] p-2 sm:grid-cols-2">
                {fieldOptions.map((o) => {
                  const locked = mandatoryFields.includes(o.value);
                  const checked = locked || (fieldSelection ?? []).includes(o.value);
                  return (
                    <label key={o.value} className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold ${locked ? "opacity-70" : "cursor-pointer hover:bg-[var(--surface-container-high)]"}`}>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={checked} disabled={locked} onChange={() => toggleField(o.value)} />
                      {o.label}
                    </label>
                  );
                })}
              </div>
              {fieldSelection && fieldSelection.length > 0 && (
                <button type="button" onClick={() => setFieldSelection(null)} className="mt-2 min-h-9 rounded-md border border-[var(--border)] px-3 text-xs font-black uppercase">
                  Reset to default fields
                </button>
              )}
            </div>
          </div>
        </details>
      </section>

      {notice && <p className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-3 text-xs font-bold" role="status">{notice}</p>}
      {failure && (
        <div className="rounded-md border border-red-500/50 bg-red-500/10 p-4 text-sm leading-6" role="alert">
          <p className="font-black">Search failed on {version.toUpperCase()} ({failure.reason}) — version preserved, no fallback applied.</p>
          <p className="mt-1">{failure.error}</p>
          {failure.remedy && <p className="mt-1 font-semibold">{failure.remedy}</p>}
          <button type="button" onClick={() => void runSearch(meta?.page ?? 1, false)} className="mt-3 min-h-10 rounded-md bg-[var(--primary)] px-4 text-xs font-black uppercase text-white">
            Retry {version.toUpperCase()}
          </button>
        </div>
      )}

      {hasSearched && !failure && (
        <p className="text-xs font-bold text-[var(--muted-foreground)]" aria-live="polite">
          Retrieved <strong className="text-[var(--foreground)]">{items.length}</strong>
          {meta?.total !== null && meta?.total !== undefined ? <> of <strong className="text-[var(--foreground)]">{meta.total}</strong> reported</> : " (total not reported)"}
          {meta?.hasMore ? " · more pages available" : " · end of results"}
          {meta?.capped ? " · window cap — narrow with date filters" : ""}
        </p>
      )}

      {!hasSearched && (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
          <p className="font-black">No search has been run</p>
          <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground)]">Type a query, tune the {version.toUpperCase()} filters, and press Search.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
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

      {meta?.hasMore && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={loading} onClick={() => void runSearch(meta.page + 1, false)} className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm font-bold disabled:opacity-60">
            Next page ({meta.page + 1})
          </button>
          <button type="button" disabled={loading} onClick={() => void runSearch(meta.page + 1, true)} className="min-h-11 rounded-md bg-[var(--primary)] px-4 text-sm font-black text-white disabled:opacity-60">
            Load more (append)
          </button>
        </div>
      )}
    </div>
  );
}
