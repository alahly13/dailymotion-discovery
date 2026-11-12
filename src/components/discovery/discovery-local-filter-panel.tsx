"use client";

import { useState } from "react";
import { Filter, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { CountrySelector } from "@/components/discovery/country-selector";
import {
  DEFAULT_DISCOVERY_LOCAL_FILTERS,
  listActiveLocalFilterChips,
  type LocalExplicitFilter,
  type LocalFilterState,
  type LocalKidsFilter,
  type LocalPresenceFilter,
  type LocalSortOrder,
  type LocalTextTargetField,
} from "@/lib/filters/discovery-result-filters";
import type { DiscoveryItemKind } from "@/lib/discovery/types";

interface Props {
  value: LocalFilterState;
  onChange: (next: LocalFilterState) => void;
  totalLoaded: number;
  filteredCount: number;
}

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 text-xs font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const labelClass =
  "mb-1 block text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]";

const RESOURCE_KINDS: { value: DiscoveryItemKind; label: string }[] = [
  { value: "video", label: "Videos" },
  { value: "channel", label: "Channels / Profiles" },
  { value: "playlist", label: "Playlists" },
  { value: "user", label: "Users" },
  { value: "live", label: "Livestreams" },
];

function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.trunc(num);
}

/**
 * Shared Local Filter & Search-Inside-Results Panel.
 * Operates strictly on already-loaded results in browser memory — zero API calls.
 */
export function DiscoveryLocalFilterPanel({ value, onChange, totalLoaded, filteredCount }: Props) {
  const [expanded, setExpanded] = useState(false);
  const chips = listActiveLocalFilterChips(value);

  function patch(partial: Partial<LocalFilterState>) {
    onChange({ ...value, ...partial });
  }

  function clearChip(key: keyof LocalFilterState) {
    onChange({
      ...value,
      [key]: DEFAULT_DISCOVERY_LOCAL_FILTERS[key],
    });
  }

  function toggleKind(kind: DiscoveryItemKind) {
    const exists = value.kinds.includes(kind);
    patch({
      kinds: exists ? value.kinds.filter((k) => k !== kind) : [...value.kinds, kind],
    });
  }

  return (
    <section
      className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3.5 sm:p-4"
      aria-label="Local result filters"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
          <Filter className="h-3 w-3" aria-hidden="true" />
          Local Only · Zero API Calls
        </span>
        <span className="text-xs font-semibold text-[var(--muted-foreground)]">
          Showing <strong className="text-[var(--foreground)]">{filteredCount}</strong> of{" "}
          <strong className="text-[var(--foreground)]">{totalLoaded}</strong> loaded items
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-black uppercase hover:border-[var(--primary)]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            {expanded ? "Hide local filters" : "More local filters"}
          </button>
          {chips.length > 0 && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_DISCOVERY_LOCAL_FILTERS)}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border)] px-2.5 text-xs font-black uppercase text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset ({chips.length})
            </button>
          )}
        </div>
      </div>

      {/* Primary instant local search & sort bar */}
      <div className="grid gap-2.5 sm:grid-cols-12">
        <div className="relative sm:col-span-5">
          <label className={labelClass} htmlFor="local-search-include">
            Search inside retrieved results
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-3 left-2.5 h-4 w-4 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <input
              id="local-search-include"
              className={`${inputClass} pl-8`}
              value={value.includeText}
              onChange={(e) => patch({ includeText: e.target.value })}
              placeholder="Keywords across loaded results..."
            />
          </div>
        </div>

        <div className="sm:col-span-3">
          <label className={labelClass} htmlFor="local-search-target">
            Target field
          </label>
          <select
            id="local-search-target"
            className={inputClass}
            value={value.targetFields}
            onChange={(e) => patch({ targetFields: e.target.value as LocalTextTargetField })}
          >
            <option value="all">All fields</option>
            <option value="title">Title only</option>
            <option value="description">Description only</option>
            <option value="owner">Owner / profile</option>
            <option value="tags">Tags only</option>
          </select>
        </div>

        <div className="sm:col-span-4">
          <label className={labelClass} htmlFor="local-search-sort">
            Local sort order
          </label>
          <select
            id="local-search-sort"
            className={inputClass}
            value={value.localSort}
            onChange={(e) => patch({ localSort: e.target.value as LocalSortOrder })}
          >
            <option value="relevance">API order / Match relevance</option>
            <option value="newest">Newest created</option>
            <option value="oldest">Oldest created</option>
            <option value="views_desc">Most views</option>
            <option value="views_asc">Fewest views</option>
            <option value="duration_desc">Longest duration</option>
            <option value="duration_asc">Shortest duration</option>
            <option value="title_asc">Title A → Z</option>
            <option value="title_desc">Title Z → A</option>
          </select>
        </div>
      </div>

      {/* Expandable rich local filter drawer */}
      {expanded && (
        <div className="space-y-3 border-t border-[var(--border)] pt-3">
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="local-exclude">
                Exclude keywords (comma-separated)
              </label>
              <input
                id="local-exclude"
                className={inputClass}
                value={value.excludeKeywords}
                onChange={(e) => patch({ excludeKeywords: e.target.value })}
                placeholder="e.g. teaser, trailer"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-exact">
                Exact phrase
              </label>
              <input
                id="local-exact"
                className={inputClass}
                value={value.exactPhrase}
                onChange={(e) => patch({ exactPhrase: e.target.value })}
                placeholder="Exact contiguous phrase"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-owner">
                Owner / Channel
              </label>
              <input
                id="local-owner"
                className={inputClass}
                value={value.ownerFilter}
                onChange={(e) => patch({ ownerFilter: e.target.value })}
                placeholder="Name or profile ID"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-tags">
                Tags (comma-separated)
              </label>
              <input
                id="local-tags"
                className={inputClass}
                value={value.tagFilter}
                onChange={(e) => patch({ tagFilter: e.target.value })}
                placeholder="e.g. news, live"
              />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="local-min-views">
                Min views (0 allowed)
              </label>
              <input
                id="local-min-views"
                type="number"
                min={0}
                className={inputClass}
                value={value.minViews ?? ""}
                onChange={(e) => patch({ minViews: parseOptionalInt(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-max-views">
                Max views
              </label>
              <input
                id="local-max-views"
                type="number"
                min={0}
                className={inputClass}
                value={value.maxViews ?? ""}
                onChange={(e) => patch({ maxViews: parseOptionalInt(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-min-dur">
                Min duration (sec)
              </label>
              <input
                id="local-min-dur"
                type="number"
                min={0}
                className={inputClass}
                value={value.minDurationSec ?? ""}
                onChange={(e) => patch({ minDurationSec: parseOptionalInt(e.target.value) })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-max-dur">
                Max duration (sec)
              </label>
              <input
                id="local-max-dur"
                type="number"
                min={0}
                className={inputClass}
                value={value.maxDurationSec ?? ""}
                onChange={(e) => patch({ maxDurationSec: parseOptionalInt(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="local-date-from">
                Created after (UTC)
              </label>
              <input
                id="local-date-from"
                type="date"
                className={inputClass}
                value={value.dateFrom}
                onChange={(e) => patch({ dateFrom: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-date-to">
                Created before (UTC inclusive)
              </label>
              <input
                id="local-date-to"
                type="date"
                className={inputClass}
                value={value.dateTo}
                onChange={(e) => patch({ dateTo: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-language">
                Language
              </label>
              <input
                id="local-language"
                className={inputClass}
                value={value.language}
                onChange={(e) => patch({ language: e.target.value })}
                placeholder="e.g. en, ar, fr"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-category">
                Category
              </label>
              <input
                id="local-category"
                className={inputClass}
                value={value.category}
                onChange={(e) => patch({ category: e.target.value })}
                placeholder="e.g. tech, news"
              />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <CountrySelector
                value={value.country}
                onChange={(code) => patch({ country: code })}
                mode="local"
                label="Country"
                placeholder="All countries"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="local-explicit">
                Explicit flag
              </label>
              <select
                id="local-explicit"
                className={inputClass}
                value={value.explicitFilter}
                onChange={(e) => patch({ explicitFilter: e.target.value as LocalExplicitFilter })}
              >
                <option value="all">All</option>
                <option value="non_explicit">Non-explicit only</option>
                <option value="explicit_only">Explicit only</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="local-kids">
                Made for kids
              </label>
              <select
                id="local-kids"
                className={inputClass}
                value={value.kidsFilter}
                onChange={(e) => patch({ kidsFilter: e.target.value as LocalKidsFilter })}
              >
                <option value="all">All</option>
                <option value="kids_only">For kids only</option>
                <option value="non_kids">Not for kids</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="local-thumb">
                Has thumbnail
              </label>
              <select
                id="local-thumb"
                className={inputClass}
                value={value.hasThumbnail}
                onChange={(e) => patch({ hasThumbnail: e.target.value as LocalPresenceFilter })}
              >
                <option value="all">Any</option>
                <option value="yes">With thumbnail</option>
                <option value="no">Missing thumbnail</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="local-desc">
                Has description
              </label>
              <select
                id="local-desc"
                className={inputClass}
                value={value.hasDescription}
                onChange={(e) => patch({ hasDescription: e.target.value as LocalPresenceFilter })}
              >
                <option value="all">Any</option>
                <option value="yes">With description</option>
                <option value="no">Missing description</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              Types:
            </span>
            {RESOURCE_KINDS.map((entry) => {
              const active = value.kinds.includes(entry.value);
              return (
                <button
                  key={entry.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleKind(entry.value)}
                  className={`min-h-8 rounded-md border px-2.5 text-xs font-bold ${
                    active
                      ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                      : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)]"
                  }`}
                >
                  {entry.label}
                </button>
              );
            })}

            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={value.strictMetadata}
                onChange={(e) => patch({ strictMetadata: e.target.checked })}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              Strict metadata (exclude unknown values)
            </label>
          </div>
        </div>
      )}

      {/* Active local filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1" role="list" aria-label="Active local filters">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => clearChip(chip.key)}
              title="Click to remove filter"
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 py-0.5 text-[11px] font-bold hover:border-[var(--primary)]"
            >
              <span>[LOCAL] {chip.label}</span>
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
