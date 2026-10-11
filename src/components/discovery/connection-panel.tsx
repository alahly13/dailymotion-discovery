// ConnectionPanel — independent Authenticate & Test control per API version.
//
// What this controls: one version's connection evidence (config status,
// token result, API probe result, last success, actionable errors).
// Why separate: V1 success must never mark V2 connected and vice versa; each
// panel calls only its own test endpoint with its own loading state. Only the
// panel under test is disabled; the other stays interactive.
// Sanitized: the test API returns no keys/secrets/tokens — this panel only
// renders booleans, scope names, timings, and timestamps.
// Scope: Settings page. Future agents: keep panels version-parameterized.

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiVersion } from "@/lib/discovery/types";
import type { ConnectionTestResult } from "@/lib/discovery/connection-test";

export interface ProfileStatus {
  baseUrl: string;
  publicBaseUrl: string | null;
  tokenUrl: string;
  scope: string;
  keyConfigured: boolean;
  publicDiscovery: boolean;
  tokenCached: boolean;
  tokenExpiresIn: number | null;
  tokenExpiresAt: number | null;
  lastAuthAt: number | null;
  hint: string | null;
}

function lastSuccessKey(version: ApiVersion): string {
  return `dm-conn-success-${version}`;
}

export function readLastSuccess(version: ApiVersion): string | null {
  try {
    return localStorage.getItem(lastSuccessKey(version));
  } catch {
    return null;
  }
}

export function ConnectionPanel({ version, title, status }: { version: ApiVersion; title: string; status: ProfileStatus | null }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [lastSuccess, setLastSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLastSuccess(readLastSuccess(version));
  }, [version]);

  const runTest = useCallback(async () => {
    if (testing) return; // duplicate-click guard
    setTesting(true);
    setResult(null);
    try {
      const response = await fetch(`/api/discovery/${version}/test-connection`, { method: "POST" });
      const data = (await response.json()) as ConnectionTestResult;
      setResult(data);
      if (data.ok) {
        try {
          localStorage.setItem(lastSuccessKey(version), data.testedAt);
        } catch {
          /* storage optional */
        }
        setLastSuccess(data.testedAt);
      }
    } catch {
      setResult({
        ok: false, version, testedAt: new Date().toISOString(), steps: [],
        token: { acquired: false, expiresIn: null, scope: null, fromCache: false },
        api: null, remedy: "Test request failed (network). Retry shortly.",
      });
    } finally {
      setTesting(false);
    }
  }, [testing, version]);

  return (
    <div className="rounded-md border border-[var(--border)] p-4 text-sm leading-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-black">{title}</p>
        <span className={`rounded px-2 py-0.5 text-[11px] font-black uppercase ${result ? (result.ok ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-500") : "bg-[var(--surface-container-high)] text-[var(--muted-foreground)]"}`}>
          {result ? (result.ok ? "Connected" : "Not connected") : "Untested"}
        </span>
      </div>

      {!status ? (
        <p className="mt-2 text-[var(--muted-foreground)]">Loading configuration…</p>
      ) : (
        <dl className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
          <div className="flex justify-between gap-2"><dt>API base URL</dt><dd><code className="text-[var(--foreground)]">{status.baseUrl}</code></dd></div>
          {status.publicBaseUrl && <div className="flex justify-between gap-2"><dt>Public host (anonymous)</dt><dd><code className="text-[var(--foreground)]">{status.publicBaseUrl}</code></dd></div>}
          <div className="flex justify-between gap-2"><dt>Token endpoint</dt><dd><code className="text-[var(--foreground)]">{status.tokenUrl}</code></dd></div>
          <div className="flex justify-between gap-2"><dt>Credentials</dt><dd><strong className="text-[var(--foreground)]">{status.keyConfigured ? "configured" : "missing"}</strong></dd></div>
          <div className="flex justify-between gap-2"><dt>Scope</dt><dd><code className="text-[var(--foreground)]">{status.scope}</code></dd></div>
          <div className="flex justify-between gap-2"><dt>Cached token</dt><dd><strong className="text-[var(--foreground)]">{status.tokenCached ? `valid${status.tokenExpiresIn !== null ? ` (expires in ${Math.floor(status.tokenExpiresIn / 3600)}h ${Math.floor((status.tokenExpiresIn % 3600) / 60)}m)` : ""}` : "none"}</strong></dd></div>
          <div className="flex justify-between gap-2"><dt>Last authentication</dt><dd><strong className="text-[var(--foreground)]">{status.lastAuthAt ? new Date(status.lastAuthAt).toLocaleString() : "never"}</strong></dd></div>
          {status.hint && <p className="pt-1">{status.hint}</p>}
        </dl>
      )}

      <button
        type="button"
        onClick={() => void runTest()}
        disabled={testing}
        aria-busy={testing}
        className="mt-3 min-h-11 w-full rounded-md bg-[var(--primary)] px-4 text-sm font-black text-white disabled:opacity-60"
      >
        {testing ? "Authenticating & testing…" : `Authenticate & Test ${version.toUpperCase()}`}
      </button>

      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        Last successful test: {lastSuccess ? <strong className="text-[var(--foreground)]">{new Date(lastSuccess).toLocaleString()}</strong> : "never"}
      </p>

      {result && (
        <div className="mt-3 space-y-2 rounded-md border border-[var(--border)] p-3 text-xs" aria-live="polite">
          {result.steps.map((step) => (
            <p key={step.name}>
              <strong className={step.ok ? "text-emerald-600" : "text-red-500"}>{step.ok ? "✓" : "✗"} {step.name}</strong>
              <span className="text-[var(--muted-foreground)]"> — {step.detail} ({step.latencyMs}ms)</span>
            </p>
          ))}
          {result.token.acquired && (
            <p>Token: acquired, expires in {result.token.expiresIn}s, scope <code>{result.token.scope}</code>.</p>
          )}
          {result.api && (
            <p>API probe: <code>{result.api.endpoint}</code> → {result.api.status ?? "unreachable"} ({result.api.outcome}).</p>
          )}
          {result.remedy && (
            <p className={result.ok ? "text-[var(--muted-foreground)]" : "font-bold text-red-500"}>{result.remedy}</p>
          )}
        </div>
      )}
    </div>
  );
}
