"use client";

import type { ReactNode } from "react";
import { Filter, RotateCcw } from "lucide-react";
import type { AdvancedVideoFilters, VideoSortOption } from "@/types/filters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const sorts: VideoSortOption[] = ["local_relevance", "newest", "oldest", "highest_views", "least_views", "duration_asc", "duration_desc", "title_asc", "title_desc"];

function numberValue(value: string) { return value === "" ? null : Number(value); }
function booleanValue(value: string) { return value === "" ? null : value === "true"; }

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="min-w-0 space-y-1 text-sm font-semibold">
      <span>{label}</span>
      <select
        className="min-h-11 w-full min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-4 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--ring)]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

export function AdvancedFilterPanel({ filters, onChange, onReset }: { filters: AdvancedVideoFilters; onChange: (filters: AdvancedVideoFilters) => void; onReset: () => void }) {
  const applyPreset = (patch: Partial<AdvancedVideoFilters>) => onChange({ ...filters, ...patch });

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
            <Filter className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--muted-foreground)]">Result Filters</p>
            <h2 className="mt-1 text-xl font-black">Refine Searched Results</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
              Result filters only filter and sort videos already collected in the current manifest. They do not call the Dailymotion API.
            </p>
          </div>
        </div>
        <Button variant="ghost" onClick={onReset}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset Filters
        </Button>
      </div>

      {/* Quick metadata presets for 1-click refinement without modifying upstream fetch settings. */}
      <div className="flex flex-wrap gap-2" aria-label="Quick result presets">
        {[
          { label: "Short (< 5m)", patch: { durationMin: null, durationMax: 300 } },
          { label: "Medium (5-20m)", patch: { durationMin: 300, durationMax: 1200 } },
          { label: "Long (20m+)", patch: { durationMin: 1200, durationMax: null } },
          { label: "10K+ views", patch: { minViews: 10_000 } },
          { label: "100K+ views", patch: { minViews: 100_000 } },
          { label: "Rich metadata", patch: { hasThumbnail: true, hasDescription: true } },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset.patch)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2.5 py-1 text-xs font-bold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:text-[var(--foreground)]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="control-grid">
        <Input placeholder="Keyword" value={filters.keyword ?? ""} onChange={(e) => onChange({ ...filters, keyword: e.target.value })} />
        <Input placeholder="Exclude words (comma)" value={filters.excludeKeyword ?? ""} onChange={(e) => onChange({ ...filters, excludeKeyword: e.target.value })} />
        <Input placeholder="Required tags (comma)" value={filters.tags ?? ""} onChange={(e) => onChange({ ...filters, tags: e.target.value })} />
        <Input type="number" placeholder="Min views" value={filters.minViews ?? ""} onChange={(e) => onChange({ ...filters, minViews: numberValue(e.target.value) })} />
        <Input type="number" placeholder="Max views" value={filters.maxViews ?? ""} onChange={(e) => onChange({ ...filters, maxViews: numberValue(e.target.value) })} />
        <Input type="number" placeholder="Target views" value={filters.targetViews ?? ""} onChange={(e) => onChange({ ...filters, targetViews: numberValue(e.target.value) })} />
        <Input type="number" placeholder="Duration min sec" value={filters.durationMin ?? ""} onChange={(e) => onChange({ ...filters, durationMin: numberValue(e.target.value) })} />
        <Input type="number" placeholder="Duration max sec" value={filters.durationMax ?? ""} onChange={(e) => onChange({ ...filters, durationMax: numberValue(e.target.value) })} />
        <Input type="number" placeholder="Year" value={filters.year ?? ""} onChange={(e) => onChange({ ...filters, year: numberValue(e.target.value) })} />
        <Input type="number" placeholder="Year from" value={filters.yearFrom ?? ""} onChange={(e) => onChange({ ...filters, yearFrom: numberValue(e.target.value) })} />
        <Input type="number" placeholder="Year to" value={filters.yearTo ?? ""} onChange={(e) => onChange({ ...filters, yearTo: numberValue(e.target.value) })} />
        <Input type="date" placeholder="Date from" value={filters.dateFrom ?? ""} onChange={(e) => onChange({ ...filters, dateFrom: e.target.value || null })} />
        <Input type="date" placeholder="Date to" value={filters.dateTo ?? ""} onChange={(e) => onChange({ ...filters, dateTo: e.target.value || null })} />
        <Input placeholder="Language" value={filters.language ?? ""} onChange={(e) => onChange({ ...filters, language: e.target.value })} />
        <Input placeholder="Channel" value={filters.channel ?? ""} onChange={(e) => onChange({ ...filters, channel: e.target.value })} />
        <Input placeholder="Owner" value={filters.owner ?? ""} onChange={(e) => onChange({ ...filters, owner: e.target.value })} />
        <SelectField
          label="Thumbnail"
          value={filters.hasThumbnail === null || filters.hasThumbnail === undefined ? "" : String(filters.hasThumbnail)}
          onChange={(value) => onChange({ ...filters, hasThumbnail: booleanValue(value) })}
        >
          <option value="">Any thumbnail</option>
          <option value="true">Has thumbnail</option>
          <option value="false">No thumbnail</option>
        </SelectField>
        <SelectField
          label="Description"
          value={filters.hasDescription === null || filters.hasDescription === undefined ? "" : String(filters.hasDescription)}
          onChange={(value) => onChange({ ...filters, hasDescription: booleanValue(value) })}
        >
          <option value="">Any description</option>
          <option value="true">Has description</option>
          <option value="false">No description</option>
        </SelectField>
        <SelectField label="Sort" value={filters.sort ?? "local_relevance"} onChange={(value) => onChange({ ...filters, sort: value as VideoSortOption })}>
          {sorts.map((sort) => (
            <option key={sort} value={sort}>{sort}</option>
          ))}
        </SelectField>
        <label className="flex min-h-11 min-w-0 items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-4 py-2 text-sm font-semibold text-[var(--muted-foreground)]">
          <input type="checkbox" checked={filters.strictMetadataFiltering === true} onChange={(e) => onChange({ ...filters, strictMetadataFiltering: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
          <span className="min-w-0 break-words">Strict metadata</span>
        </label>
      </div>
    </Card>
  );
}
