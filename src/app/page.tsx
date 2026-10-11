// Dashboard — real application data only (workspace store + API status).

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";

interface AuthStatus {
  ok: boolean;
  v1: { keyConfigured: boolean; publicDiscovery: boolean };
  v2: { keyConfigured: boolean; publicDiscovery: boolean };
}

const WORKSPACES = [
  { label: "General v1 / v2", v1: "/general-v1", v2: "/general-v2", description: "Global v1 search; profile-scoped v2 discovery." },
  { label: "Videos v1 / v2", v1: "/videos-v1", v2: "/videos-v2", description: "Search, lookup, related (v1) and profile browsing (v2)." },
  { label: "Channels v1 / v2", v1: "/channels-v1", v2: "/channels-v2", description: "Global channel search (v1); profile lookup (v2)." },
  { label: "Playlists v1 / v2", v1: "/playlists-v1", v2: "/playlists-v2", description: "Owner listings, direct lookup, playlist contents." },
  { label: "Users v1 / v2", v1: "/users-v1", v2: "/users-v2", description: "User search (v1); user lookup + /me (v2)." },
  { label: "Live v1 / v2", v1: "/live-v1", v2: "/live-v2", description: "Live flags (v1); livestream listings (v2)." },
];

export default function HomePage() {
  const workspace = useDiscoveryWorkspace();
  const [auth, setAuth] = useState<AuthStatus | null>(null);

  useEffect(() => {
    void fetch("/api/discovery/auth-status").then((r) => r.json()).then(setAuth).catch(() => setAuth(null));
  }, []);

  const v1Searches = workspace.history.filter((h) => h.version === "v1").length;
  const v2Searches = workspace.history.filter((h) => h.version === "v2").length;

  const stats: [string, string][] = [
    ["Searches run (v1)", String(v1Searches)],
    ["Searches run (v2)", String(v2Searches)],
    ["Saved searches", String(workspace.savedSearches.length)],
    ["Saved items", String(workspace.savedItems.length)],
  ];

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr] xl:items-stretch">
        <div className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow)] sm:p-8">
          <div className="terminal-rule mb-6 h-1 w-32 rounded-full" aria-hidden="true" />
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Dual-API research workspace</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-black leading-tight sm:text-5xl">Dailymotion Discovery</h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-[var(--muted-foreground)] sm:text-lg">
            Version-separated discovery across Legacy API v1 (public) and API v2 (authenticated).
            Each workspace uses its own endpoints, filters, and pagination — nothing switches versions behind your back.
          </p>
          <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] p-3 text-xs leading-5 text-[var(--muted-foreground)]">
            {!auth ? (
              "Checking API configuration…"
            ) : (
              <>
                v1 public discovery: <strong className="text-emerald-600">available</strong>
                {" · "}v2 reads:{" "}
                <strong className={auth.v2.keyConfigured ? "text-emerald-600" : "text-amber-600"}>
                  {auth.v2.keyConfigured ? "credentials configured" : "needs credentials (see Settings)"}
                </strong>
              </>
            )}
          </div>
          <div className="action-row mt-6">
            <Link
              href="/general-v1"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-5 text-sm font-black text-white transition hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
            >
              Start with General v1
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/capabilities"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-5 text-sm font-bold transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-container-high)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
            >
              Compare v1 vs v2
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {stats.map(([label, value]) => (
            <Card key={label} className="flex min-h-32 flex-col justify-between">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{label}</p>
              <p className="mt-4 text-2xl font-black">{value}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {WORKSPACES.map((workspacePair) => (
          <Card key={workspacePair.label} className="flex flex-col">
            <h2 className="font-black">{workspacePair.label}</h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">{workspacePair.description}</p>
            <div className="mt-4 flex gap-4">
              <Link href={workspacePair.v1} className="inline-flex items-center gap-1 text-sm font-black text-[var(--primary)] hover:underline">
                Open v1 <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href={workspacePair.v2} className="inline-flex items-center gap-1 text-sm font-black text-[var(--primary)] hover:underline">
                Open v2 <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </Card>
        ))}
      </section>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--success)]" aria-hidden="true" />
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">
            Metadata only: no downloading, no rehosting, no private stream access. Private keys stay server-side; the browser never sees them.
          </p>
        </div>
        <Link href="/workspace" className="inline-flex items-center gap-2 text-sm font-black text-[var(--primary)] hover:underline">
          Open workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Card>
    </div>
  );
}
