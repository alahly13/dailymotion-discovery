// Dashboard — Clean Research Overview & Dual-API Workspace Hub
//
// What this controls: Main overview page providing system health diagnostics,
// workspace navigation, research library statistics, and platform boundaries.
// Why it exists: Serves as the central command dashboard without duplicating Global Search.
// (Per 2026 design requirement: search inputs are strictly removed from the dashboard).
// Scope: Dashboard route (/).

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Globe,
  Link2,
  Tv,
  Sparkles,
  Bookmark,
  FolderKanban,
  History,
  HardDrive,
  Settings,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Layers,
  Activity,
  Sliders,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";

interface AuthStatusResponse {
  ok: boolean;
  v1?: { keyConfigured: boolean; publicDiscovery: boolean; partnerConfigured?: boolean };
  v2?: { keyConfigured: boolean; publicDiscovery: boolean };
  database?: { connectionSource: string; ssl: boolean };
  tokenCache?: { enabled: boolean };
}

interface WorkspaceCardDef {
  id: string;
  title: string;
  category: "DISCOVERY" | "ANALYSIS" | "LIBRARY";
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  v1Href?: string;
  v2Href?: string;
  directHref?: string;
  badge?: string;
  badgeColor?: string;
}

const PRIMARY_WORKSPACES: WorkspaceCardDef[] = [
  {
    id: "global-search",
    title: "Global Search",
    category: "DISCOVERY",
    description: "Search Dailymotion content across videos, channels, playlists, users, and live streams with independent V1/V2 query engines.",
    icon: Globe,
    v1Href: "/global-search?v=v1",
    v2Href: "/global-search?v=v2",
    badge: "Dual-Engine",
    badgeColor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  {
    id: "link-explorer",
    title: "Link Explorer",
    category: "DISCOVERY",
    description: "Universal URL & identifier analyzer resolving Dailymotion links, short URLs, handles, and IDs with metadata inspection.",
    icon: Link2,
    v1Href: "/link-explorer?v=v1",
    v2Href: "/link-explorer?v=v2",
    badge: "Universal Resolver",
    badgeColor: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  },
  {
    id: "channel-explorer",
    title: "Channel Deep Explorer",
    category: "ANALYSIS",
    description: "Paginated catalog crawler with yearly/monthly date windows, controlled concurrency, deduplication, and coverage auditing.",
    icon: Tv,
    directHref: "/channel-explorer",
    badge: "Crawler",
    badgeColor: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  },
  {
    id: "ai-search",
    title: "AI-Assisted Search",
    category: "ANALYSIS",
    description: "Grounded natural language query translator powered by Gemini for parameter extraction and manifest summarization.",
    icon: Sparkles,
    directHref: "/ai-search",
    badge: "Grounded AI",
    badgeColor: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  {
    id: "saved-items",
    title: "Saved Library & Collections",
    category: "LIBRARY",
    description: "Local-first IndexedDB research vault for organizing discovered videos and channels with offline persistence.",
    icon: Bookmark,
    directHref: "/saved-items",
    badge: "Local-First",
    badgeColor: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  {
    id: "search-history",
    title: "Search History Snapshots",
    category: "LIBRARY",
    description: "Full untouched API JSON snapshots cached locally in IndexedDB for deterministic zero-network offline replay.",
    icon: History,
    directHref: "/search-history",
    badge: "Zero-API Replay",
    badgeColor: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  },
];

export default function DashboardPage() {
  const workspace = useDiscoveryWorkspace();
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/discovery/auth-status")
      .then((res) => res.json())
      .then((data: AuthStatusResponse) => {
        if (mounted) {
          setAuthStatus(data);
          setLoadingAuth(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setAuthStatus(null);
          setLoadingAuth(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const v1Searches = workspace.history.filter((h) => h.version === "v1").length;
  const v2Searches = workspace.history.filter((h) => h.version === "v2").length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* ── 1. Hero & System Architecture Status ─────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[var(--surface-container-low)] p-6 sm:p-8 shadow-sm">
        <div className="terminal-rule mb-6 h-1 w-28 rounded-full" aria-hidden="true" />
        
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">
              <Layers className="h-3.5 w-3.5" />
              <span>Dual-API Architecture Hub</span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[var(--foreground)]">
              Dailymotion Discovery
            </h1>
            
            <p className="text-sm sm:text-base text-[var(--muted-foreground)] leading-relaxed font-normal">
              A high-precision research platform providing strictly separated discovery workflows across{" "}
              <strong className="text-[var(--foreground)] font-semibold">Legacy API v1</strong> (public & partner catalog) and{" "}
              <strong className="text-[var(--foreground)] font-semibold">Modern REST API v2</strong> (authenticated profile catalog).
              All requests strictly preserve API boundaries without silent version switching.
            </p>
          </div>

          {/* Quick Actions Card */}
          <div className="flex flex-wrap lg:flex-col gap-2.5 shrink-0 min-w-[200px]">
            <Link
              href="/global-search"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-100 px-4 text-xs font-black shadow-xs transition active:scale-[0.98]"
            >
              <Globe className="h-4 w-4 shrink-0 text-white dark:text-black" />
              <span className="font-black text-white dark:text-black">Open Global Search</span>
              <ArrowRight className="h-3.5 w-3.5 ml-1 shrink-0 text-white dark:text-black" />
            </Link>
            
            <Link
              href="/link-explorer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-container-high)] hover:border-white/30 transition active:scale-[0.98]"
            >
              <Link2 className="h-4 w-4 text-[var(--primary)]" />
              Open Link Explorer
            </Link>

            <Link
              href="/capabilities"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-transparent px-4 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-[var(--surface-container-high)] transition"
            >
              <Sliders className="h-3.5 w-3.5" />
              API Comparison Matrix
            </Link>
          </div>
        </div>

        {/* Real-Time API Health Status Bar */}
        <div className="mt-6 pt-6 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* V1 Public */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)]">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-[var(--foreground)] block">API v1 Public</span>
              <span className="text-[11px] text-muted-foreground truncate">Global Search Online</span>
            </div>
          </div>

          {/* V1 Partner */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)]">
            {loadingAuth ? (
              <Activity className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
            ) : authStatus?.v1?.keyConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            )}
            <div className="min-w-0">
              <span className="font-bold text-[var(--foreground)] block">API v1 Partner</span>
              <span className="text-[11px] text-muted-foreground truncate">
                {loadingAuth ? "Checking..." : authStatus?.v1?.keyConfigured ? "Authenticated Ready" : "Public Mode Active"}
              </span>
            </div>
          </div>

          {/* V2 REST */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)]">
            {loadingAuth ? (
              <Activity className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
            ) : authStatus?.v2?.keyConfigured ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
            )}
            <div className="min-w-0">
              <span className="font-bold text-[var(--foreground)] block">API v2 REST</span>
              <span className="text-[11px] text-muted-foreground truncate">
                {loadingAuth ? "Checking..." : authStatus?.v2?.keyConfigured ? "Token Verified" : "Needs Credentials"}
              </span>
            </div>
          </div>

          {/* Token Cache & Persistence */}
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)]">
            <HardDrive className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-[var(--foreground)] block">Storage & Cache</span>
              <span className="text-[11px] text-muted-foreground truncate">IndexedDB + Cloud Outbox</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Real Research Activity Metrics ────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Workspace Activity & Persistence Stats
          </h2>
          <span className="text-xs text-muted-foreground font-medium">Real-time local state</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-4 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Saved Items</span>
            <span className="text-2xl font-black text-[var(--foreground)] mt-2">{workspace.savedItems.length}</span>
            <Link href="/saved-items" className="text-[11px] font-bold text-primary hover:underline mt-1 inline-flex items-center gap-0.5">
              View vault <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>

          <Card className="p-4 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Collections</span>
            <span className="text-2xl font-black text-[var(--foreground)] mt-2">
              {(workspace as Record<string, any>).collections?.length ?? 0}
            </span>
            <Link href="/collections" className="text-[11px] font-bold text-primary hover:underline mt-1 inline-flex items-center gap-0.5">
              Organize <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>

          <Card className="p-4 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Saved Presets</span>
            <span className="text-2xl font-black text-[var(--foreground)] mt-2">{workspace.savedSearches.length}</span>
            <Link href="/saved-searches" className="text-[11px] font-bold text-primary hover:underline mt-1 inline-flex items-center gap-0.5">
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>

          <Card className="p-4 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">History Snapshots</span>
            <span className="text-2xl font-black text-[var(--foreground)] mt-2">{workspace.history.length}</span>
            <Link href="/search-history" className="text-[11px] font-bold text-primary hover:underline mt-1 inline-flex items-center gap-0.5">
              Replay <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>

          <Card className="p-4 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">V1 Queries Run</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{v1Searches}</span>
            <span className="text-[11px] text-muted-foreground mt-1">Legacy Public</span>
          </Card>

          <Card className="p-4 flex flex-col justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">V2 Queries Run</span>
            <span className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-2">{v2Searches}</span>
            <span className="text-[11px] text-muted-foreground mt-1">REST Scoped</span>
          </Card>
        </div>
      </section>

      {/* ── 3. Four Core Independent Discovery Workspaces ─────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <h2 className="text-lg font-black text-[var(--foreground)] flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Core Research Workspaces
            </h2>
            <p className="text-xs text-muted-foreground">
              Direct access to the independent discovery modes with dedicated V1 and V2 integration endpoints.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRIMARY_WORKSPACES.map((ws) => {
            const Icon = ws.icon;
            return (
              <Card
                key={ws.id}
                className="p-5 flex flex-col justify-between hover:border-[var(--border-strong)] transition-all shadow-2xs"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    {ws.badge && (
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${ws.badgeColor || "bg-muted text-muted-foreground"}`}>
                        {ws.badge}
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[var(--foreground)]">{ws.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {ws.description}
                    </p>
                  </div>
                </div>

                {/* Navigation Links */}
                <div className="mt-5 pt-4 border-t border-[var(--border)]">
                  {ws.v1Href && ws.v2Href ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={ws.v1Href}
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-container-high)] hover:border-primary/50 transition cursor-pointer"
                      >
                        Launch V1
                        <ArrowRight className="h-3 w-3 text-primary" />
                      </Link>
                      <Link
                        href={ws.v2Href}
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-container-high)] hover:border-primary/50 transition cursor-pointer"
                      >
                        Launch V2
                        <ArrowRight className="h-3 w-3 text-primary" />
                      </Link>
                    </div>
                  ) : ws.directHref ? (
                    <Link
                      href={ws.directHref}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--surface-container-low)] border border-[var(--border)] px-4 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-container-high)] hover:border-primary/50 transition cursor-pointer"
                    >
                      Open Workspace
                      <ArrowRight className="h-3.5 w-3.5 text-primary" />
                    </Link>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── 4. System Governance & Settings Quick Access ─────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <Settings className="h-4 w-4" />
              <span>Integration Settings</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configure V1/V2 API keys, OAuth scopes, default search filters, and administrator security sessions.
            </p>
          </div>
          <Link
            href="/settings"
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            Manage Credentials &rarr;
          </Link>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <HardDrive className="h-4 w-4" />
              <span>Cloudflare R2 Storage</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Two-phase outbox synchronizer and immutable dataset exports committed to private Cloudflare R2 bucket.
            </p>
          </div>
          <Link
            href="/storage"
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            Inspect Storage Datasets &rarr;
          </Link>
        </Card>

        <Card className="p-5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <Sliders className="h-4 w-4" />
              <span>API Capabilities Registry</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Authoritative endpoint matrix comparing Legacy API v1 and REST API v2 features, filters, and fields.
            </p>
          </div>
          <Link
            href="/capabilities"
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
          >
            View Full Matrix &rarr;
          </Link>
        </Card>
      </section>

      {/* ── 5. Platform Safety & Compliance Boundary ─────────────────────── */}
      <Card className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-l-emerald-600 bg-[var(--surface-container-low)]">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-[var(--foreground)]">
              Metadata-Only Research Platform Compliance
            </p>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Strictly metadata only: zero video downloading, zero stream scraping, and zero content rehosting.
              Private API keys and administrator session tokens remain protected exclusively on the server.
            </p>
          </div>
        </div>

        <Link
          href="/workspace"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
        >
          Cloud Sync Workspace
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Card>
    </div>
  );
}
