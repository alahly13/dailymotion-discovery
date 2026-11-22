// Advanced Fetch Settings Panel — Dailymotion Discovery & Catalog Crawler Controls (2026)
//
// What this controls: Configurable fetch strategies (Quick, Standard, Deep, Resume, Custom),
// request budgets, pagination limits, safe throttling (0-1000ms), date-window bounds,
// and sparse field selection profiles (Basic, Standard, Extended, Custom).
// Why it exists: Grants researchers full control over API request volume and rate limits
// without scraping, ensuring responsible exploration of large Dailymotion catalogs.
// Scope: Link Explorer (/link-explorer).

"use client";

import { useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Cpu,
  Gauge,
  Layers,
  ListFilter,
  RefreshCw,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ApiVersion } from "@/lib/discovery/types";
import type {
  FieldSelectionProfile,
  ScanBudgetConfig,
  ScanStrategy,
} from "@/lib/link-explorer/link-explorer-types";
import { cn } from "@/lib/utils/cn";

export interface AdvancedFetchSettingsPanelProps {
  version: ApiVersion;
  config: ScanBudgetConfig;
  onChangeConfig: (nextConfig: ScanBudgetConfig) => void;
  onResetDefaults: () => void;
}

const STRATEGIES: Array<{
  id: ScanStrategy;
  name: string;
  icon: typeof Zap;
  description: string;
  badge: string;
}> = [
  {
    id: "quick",
    name: "Quick Scan",
    icon: Zap,
    description: "1 page (up to 50 items) for immediate preview and metadata lookup.",
    badge: "1 Page · Fast",
  },
  {
    id: "standard",
    name: "Standard Scan",
    icon: Layers,
    description: "Multi-page fetch (up to 5 pages / 250-500 items) covering recent catalog.",
    badge: "5 Pages · Balanced",
  },
  {
    id: "deep",
    name: "Deep Catalog Scan",
    icon: Cpu,
    description: "Exhaustive crawl using date-window partitioning to bypass the 1,000-item cap.",
    badge: "Full Catalog · Recursive",
  },
  {
    id: "custom",
    name: "Custom Fetch",
    icon: Sliders,
    description: "Configure custom page size, budget limit, date boundaries, and field sets.",
    badge: "Fine-grained",
  },
];

export function AdvancedFetchSettingsPanel({
  version,
  config,
  onChangeConfig,
  onResetDefaults,
}: AdvancedFetchSettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleStrategySelect = (strat: ScanStrategy) => {
    if (strat === "quick") {
      onChangeConfig({
        ...config,
        strategy: "quick",
        pageSize: 50,
        maxPages: 1,
        throttleMs: 0,
      });
    } else if (strat === "standard") {
      onChangeConfig({
        ...config,
        strategy: "standard",
        pageSize: 50,
        maxPages: 5,
        throttleMs: 150,
      });
    } else if (strat === "deep") {
      onChangeConfig({
        ...config,
        strategy: "deep",
        pageSize: 100,
        maxPages: 0, // unlimited
        throttleMs: 250,
      });
    } else {
      onChangeConfig({
        ...config,
        strategy: "custom",
      });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden transition-all">
      {/* Header bar / Collapsible toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between p-4 bg-surface hover:bg-surface-muted transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5">
          <Sliders className="h-4 w-4 text-primary" />
          <span className="text-xs font-black uppercase tracking-wider text-foreground">
            Advanced Discovery & API Fetch Settings
          </span>
          <span className="hidden sm:inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary capitalize">
            Strategy: {config.strategy}
          </span>
          <span className="hidden md:inline-flex rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground border border-border/60">
            {config.pageSize} items/page · {config.maxPages === 0 ? "Unlimited" : `${config.maxPages} pages`} · {config.throttleMs}ms throttle
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold">
            {isOpen ? "Hide Controls" : "Configure Knobs"}
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded Knobs and Settings */}
      {isOpen && (
        <div className="p-5 border-t border-border space-y-6">
          {/* 1. Strategy Selector Cards */}
          <div className="space-y-2">
            <label className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Scan Strategy Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {STRATEGIES.map((strat) => {
                const isSelected = config.strategy === strat.id;
                const IconComponent = strat.icon;
                return (
                  <button
                    key={strat.id}
                    type="button"
                    onClick={() => handleStrategySelect(strat.id)}
                    className={cn(
                      "flex flex-col p-3 rounded-lg border text-left transition-all cursor-pointer shadow-2xs",
                      isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                        : "border-border/70 bg-surface hover:bg-surface-muted hover:border-border"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <IconComponent className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                        <span className="text-xs font-bold text-foreground">
                          {strat.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-muted-foreground bg-surface-muted px-1.5 py-0.2 rounded border border-border/50">
                        {strat.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {strat.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Knobs Grid: Page Size, Max Pages, Throttle, Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-border/60">
            {/* Knob 1: Page Size */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Items Per Page</span>
                <span className="text-[10px] text-muted-foreground font-mono">Max 100</span>
              </label>
              <select
                value={config.pageSize}
                onChange={(e) =>
                  onChangeConfig({ ...config, pageSize: Number(e.target.value) })
                }
                className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
              >
                <option value={25}>25 items (Lightweight)</option>
                <option value={50}>50 items (Standard)</option>
                <option value={100}>100 items (Max Official API Limit)</option>
              </select>
              <p className="text-[10px] text-muted-foreground">
                Documented maximum for both API v1 and v2.
              </p>
            </div>

            {/* Knob 2: Max Pages Budget */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Max Pages Budget</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {config.maxPages === 0 ? "Unlimited" : `${config.maxPages * config.pageSize} items max`}
                </span>
              </label>
              <select
                value={config.maxPages}
                onChange={(e) =>
                  onChangeConfig({ ...config, maxPages: Number(e.target.value) })
                }
                className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
              >
                <option value={1}>1 Page (Quick preview)</option>
                <option value={2}>2 Pages (Up to 200 items)</option>
                <option value={5}>5 Pages (Up to 500 items)</option>
                <option value={10}>10 Pages (Up to 1,000 items - Window Cap)</option>
                <option value={20}>20 Pages (Up to 2,000 items)</option>
                <option value={50}>50 Pages (Up to 5,000 items)</option>
                <option value={0}>Unlimited (Full Available Catalog)</option>
              </select>
              <p className="text-[10px] text-muted-foreground">
                Halts crawl once this budget is reached.
              </p>
            </div>

            {/* Knob 3: Throttle Delay */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Request Throttle</span>
                <span className="text-[10px] text-muted-foreground font-mono">{config.throttleMs}ms</span>
              </label>
              <select
                value={config.throttleMs}
                onChange={(e) =>
                  onChangeConfig({ ...config, throttleMs: Number(e.target.value) })
                }
                className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
              >
                <option value={0}>0ms (No delay)</option>
                <option value={150}>150ms (Safe default)</option>
                <option value={300}>300ms (Conservative)</option>
                <option value={500}>500ms (Strict rate-limit protect)</option>
                <option value={1000}>1000ms (1 req / second)</option>
              </select>
              <p className="text-[10px] text-muted-foreground">
                Prevents HTTP 429 upstream rate limit blocks.
              </p>
            </div>

            {/* Knob 4: Sparse Field Selection Profile */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Fields Profile</span>
                <span className="text-[10px] uppercase font-bold text-primary">{config.fieldsProfile}</span>
              </label>
              <select
                value={config.fieldsProfile}
                onChange={(e) =>
                  onChangeConfig({
                    ...config,
                    fieldsProfile: e.target.value as FieldSelectionProfile,
                  })
                }
                className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-medium"
              >
                <option value="basic">Basic (ID, title, thumbnail, created_at)</option>
                <option value="standard">Standard (+ desc, duration, views, owner)</option>
                <option value="extended">Extended (+ tags, country, verified, aspect)</option>
                <option value="custom">Custom Fields Set</option>
              </select>
              <p className="text-[10px] text-muted-foreground">
                Optimizes payload size and parsing speed.
              </p>
            </div>
          </div>

          {/* 3. Custom Fields Input (if selected) */}
          {config.fieldsProfile === "custom" && (
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <label className="text-xs font-bold text-foreground">
                Custom Sparse Fields (Comma-separated)
              </label>
              <input
                type="text"
                value={config.customFields || ""}
                onChange={(e) =>
                  onChangeConfig({ ...config, customFields: e.target.value })
                }
                placeholder={
                  version === "v1"
                    ? "id,title,thumbnail_480_url,duration,views_total,owner"
                    : "video_id,title,created_at,duration,views_total"
                }
                className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs font-mono text-foreground outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {/* 4. Date Range Bounds (from & to) */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <label className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {config.catalogTarget === "playlists"
                ? "Playlist Creation Date Boundaries (playlist.created_at)"
                : "Video Upload Date Boundaries (video.created_at)"}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-muted-foreground mb-1 block">
                  {config.catalogTarget === "playlists"
                    ? "From Date (Playlist Created After)"
                    : "From Date (Video Uploaded After)"}
                </span>
                <input
                  type="date"
                  value={config.dateFrom || ""}
                  onChange={(e) =>
                    onChangeConfig({ ...config, dateFrom: e.target.value || undefined })
                  }
                  className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-mono"
                />
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground mb-1 block">
                  {config.catalogTarget === "playlists"
                    ? "To Date (Playlist Created Before)"
                    : "To Date (Video Uploaded Before)"}
                </span>
                <input
                  type="date"
                  value={config.dateTo || ""}
                  onChange={(e) =>
                    onChangeConfig({ ...config, dateTo: e.target.value || undefined })
                  }
                  className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary cursor-pointer font-mono"
                />
              </div>
            </div>
          </div>

          {/* Reset Action */}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onResetDefaults}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Fetch Settings to Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
