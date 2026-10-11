// Global API status bar — rendered on every page via AppShell.
//
// What this controls: compact per-version token + usage visibility.
// Why here: operators need connection/expiry/usage truth without opening
// Settings. Data is sanitized (booleans + timestamps only); countdowns tick
// locally from the server's recorded expiresAt. Status refresh (60s) never
// acquires tokens. Failures never block navigation.
// Metrics are application-tracked (local), explicitly NOT provider quota.
// Scope: AppShell. Future agents: keep it compact and non-blocking.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCountdown } from "@/lib/discovery/countdown";
import type { ApiVersion } from "@/lib/discovery/types";
import { useDiscoveryWorkspace } from "@/stores/discovery-workspace-store";

export { formatCountdown };

interface VersionStatus {
  keyConfigured: boolean;
  tokenCached: boolean;
  tokenExpiresAt: number | null;
  lastAuthAt: number | null;
  hint: string | null;
}

interface StatusResponse {
  ok: boolean;
  v1: VersionStatus;
  v2: VersionStatus;
}

function VersionChip({ version, status, countdown }: { version: ApiVersion; status: VersionStatus | null; countdown: string | null }) {
  const label = version === "v1" ? "V1" : "V2";
  let dot = "bg-[var(--muted-foreground)]";
  let text = "Checking…";
  if (status) {
    if (status.tokenCached && countdown !== "Expired") {
      dot = "bg-emerald-500";
      text = countdown ?? "Token cached";
    } else if (status.keyConfigured) {
      dot = "bg-amber-500";
      text = countdown === "Expired" ? "Token expired" : "No active token";
    } else {
      dot = "bg-red-500";
      text = "Not configured";
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-2 py-1 text-[11px] font-black" title={status?.hint ?? `${label} status`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}: {text}
    </span>
  );
}

export function ApiStatusBar() {
  const workspace = useDiscoveryWorkspace();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/discovery/auth-status", { cache: "no-store" });
        const data = (await response.json()) as StatusResponse;
        if (!cancelled) setStatus(data.ok ? data : null);
      } catch {
        if (!cancelled) setStatus(null);
      }
    }
    void refresh();
    const slow = setInterval(refresh, 60_000); // modest refresh; never triggers OAuth
    const fast = setInterval(() => setNow(Date.now()), 1000); // local countdown tick
    return () => {
      cancelled = true;
      clearInterval(slow);
      clearInterval(fast);
    };
  }, []);

  const v1Countdown = formatCountdown(status?.v1.tokenExpiresAt ?? null, now);
  const v2Countdown = formatCountdown(status?.v2.tokenExpiresAt ?? null, now);
  const todayTotal = workspace.usage.v1.todaySearches + workspace.usage.v2.todaySearches;
  const allTotal = workspace.usage.v1.totalSearches + workspace.usage.v2.totalSearches;

  return (
    <div className="mb-5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2" role="status" aria-label="API status">
      <div className="flex flex-wrap items-center gap-2">
        <VersionChip version="v1" status={status?.v1 ?? null} countdown={v1Countdown} />
        <VersionChip version="v2" status={status?.v2 ?? null} countdown={v2Countdown} />
        <span className="text-[11px] font-bold text-[var(--muted-foreground)]" title="Application-tracked searches (local counts, not Dailymotion quota)">
          Searches today: {todayTotal} · Total: {allTotal}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="min-h-8 rounded-md border border-[var(--border)] px-2 text-[11px] font-black uppercase"
          >
            {expanded ? "Hide usage" : "Usage"}
          </button>
          <Link href="/settings" className="inline-flex min-h-8 items-center rounded-md border border-[var(--border)] px-2 text-[11px] font-black uppercase">
            Settings
          </Link>
        </span>
      </div>
      {expanded && (
        <div className="mt-2 grid gap-2 border-t border-[var(--border)] pt-2 text-[11px] leading-5 sm:grid-cols-2">
          {(["v1", "v2"] as ApiVersion[]).map((v) => {
            const usage = workspace.usage[v];
            const st = status?.[v];
            return (
              <div key={v} className="rounded-md border border-[var(--border)] p-2">
                <p className="font-black uppercase">{v === "v1" ? "V1 Legacy / Partner" : "V2"}</p>
                <p>Token: {st?.tokenCached ? (v === "v1" ? v1Countdown : v2Countdown) ?? "cached" : st?.keyConfigured ? "unavailable — run Authenticate & Test in Settings" : "not configured"}</p>
                <p>Last auth: {st?.lastAuthAt ? new Date(st.lastAuthAt).toLocaleString() : "—"}</p>
                <p>Today: {usage.todaySearches} searches ({usage.todaySuccess} ok / {usage.todayFailed} failed, {usage.todayApiCalls} API calls)</p>
                <p>Total: {usage.totalSearches} searches ({usage.totalSuccess} ok / {usage.totalFailed} failed, {usage.totalApiCalls} API calls)</p>
                <p>Last success: {usage.lastSuccessAt ? new Date(usage.lastSuccessAt).toLocaleString() : "—"}</p>
              </div>
            );
          })}
          <p className="text-[var(--muted-foreground)] sm:col-span-2">
            Application-tracked usage (this browser, UTC days) — not official Dailymotion quota. One submitted search = one operation; pagination appends add API calls only.
          </p>
        </div>
      )}
    </div>
  );
}
