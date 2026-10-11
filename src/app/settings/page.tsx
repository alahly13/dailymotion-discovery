// /settings — per-version integration settings, defaults, admin session.
// Server credentials are env-owned: the browser shows presence only and can
// never edit secrets. Per-version search defaults persist locally; a V1
// reset never touches V2 (and vice versa).

"use client";

import { useEffect, useState } from "react";
import { ConnectionPanel, type ProfileStatus } from "@/components/discovery/connection-panel";
import { V1_VIDEO_SORTS, V2_VIDEO_SORTS } from "@/lib/discovery/param-schema";
import type { ApiVersion } from "@/lib/discovery/types";
import { useDiscoveryWorkspace, type VersionSearchDefaults } from "@/stores/discovery-workspace-store";

interface AuthStatus {
  ok: boolean;
  v1: ProfileStatus;
  v2: ProfileStatus;
  filters: { familyFilterDefault: boolean | null; localizationDefault: string };
}

interface AdminStatus {
  ok: boolean;
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  expiresAt: number | null;
}

const inputClass = "min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold";
const labelClass = "mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]";

function TriState({ value, onChange, label }: { value: boolean | null; onChange: (v: boolean | null) => void; label: string }) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="grid grid-cols-3 gap-1 rounded-md border border-[var(--border)] p-1" role="radiogroup" aria-label={label}>
        {([
          [null, "Auto (safe)"],
          [true, "On"],
          [false, "Off"],
        ] as [boolean | null, string][]).map(([v, text]) => (
          <button
            key={text}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`min-h-9 rounded px-2 text-xs font-black uppercase ${value === v ? "bg-[var(--primary)] text-white" : "text-[var(--muted-foreground)]"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function VersionDefaultsEditor({ version, defaults }: { version: ApiVersion; defaults: VersionSearchDefaults }) {
  const workspace = useDiscoveryWorkspace();
  const sorts = version === "v1" ? V1_VIDEO_SORTS : V2_VIDEO_SORTS;
  const [saved, setSaved] = useState(false);

  function save(partial: Partial<VersionSearchDefaults>) {
    workspace.setVersionDefaults(version, partial);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mt-3 grid gap-3 rounded-md border border-[var(--border)] p-3 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor={`def-ps-${version}`}>Default page size</label>
        <input
          id={`def-ps-${version}`}
          type="number" min={1} max={100}
          className={inputClass}
          value={defaults.pageSize}
          onChange={(e) => save({ pageSize: e.target.value })}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`def-sort-${version}`}>Default sort</label>
        <select id={`def-sort-${version}`} className={inputClass} value={defaults.sort} onChange={(e) => save({ sort: e.target.value })}>
          {sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      {version === "v1" && (
        <>
          <TriState label="Default family filter (Auto = API default ON)" value={defaults.familyFilter} onChange={(v) => save({ familyFilter: v })} />
          <div>
            <label className={labelClass} htmlFor="def-loc-v1">Default localization</label>
            <input id="def-loc-v1" className={inputClass} value={defaults.localization} onChange={(e) => save({ localization: e.target.value })} placeholder="detect" />
          </div>
        </>
      )}
      <div className="flex items-end gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={() => { workspace.resetVersionDefaults(version); setSaved(true); setTimeout(() => setSaved(false), 2000); }}
          className="min-h-10 rounded-md border border-[var(--border)] px-4 text-xs font-black uppercase"
        >
          Reset {version.toUpperCase()} defaults
        </button>
        {saved && <span className="text-xs font-bold text-emerald-600" aria-live="polite">Saved.</span>}
      </div>
      {version === "v1" && defaults.familyFilter === false && (
        <p className="text-xs font-bold text-amber-600 sm:col-span-2">Default family filter is OFF — v1 searches will include explicit content unless overridden per search.</p>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [admin, setAdmin] = useState<AdminStatus | null>(null);
  const workspace = useDiscoveryWorkspace();

  useEffect(() => {
    void fetch("/api/discovery/auth-status").then((r) => r.json()).then(setAuth).catch(() => setAuth(null));
    void fetch("/api/admin/session").then((r) => r.json()).then(setAdmin).catch(() => setAdmin(null));
  }, []);

  async function logout() {
    await fetch("/api/admin/session", { method: "POST" });
    setAdmin((prev) => (prev ? { ...prev, authenticated: false, username: null, expiresAt: null } : prev));
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Workspace</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Settings</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted-foreground)]">
          One Dailymotion account, two independent integrations. Secrets stay server-side — only presence is shown.
          Connection tests authenticate for real (token + read-only probe) and never mark the other version.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-black">Dailymotion V1 — Legacy / Partner</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Partner host for authenticated calls; documented public host for anonymous discovery. Server env: <code>DAILYMOTION_API_BASE_URL_V1</code>, <code>DAILYMOTION_OAUTH_TOKEN_URL_V1</code>, <code>PRIVATE_DAILYMOTION_API_KEY_V1[_SECRET]</code>, <code>DAILYMOTION_API_SCOPE_V1</code>.</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <ConnectionPanel version="v1" title="V1 connection" status={auth?.v1 ?? null} />
          <div>
            <h3 className="text-sm font-black">V1 default search preferences</h3>
            <VersionDefaultsEditor version="v1" defaults={workspace.versionDefaults.v1} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-black">Dailymotion V2</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Unified host, Bearer always required. Server env: <code>DAILYMOTION_API_BASE_URL_V2</code>, <code>DAILYMOTION_OAUTH_TOKEN_URL_V2</code>, <code>PRIVATE_DAILYMOTION_API_KEY_V2[_SECRET]</code>, <code>DAILYMOTION_API_SCOPE_V2</code>.</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <ConnectionPanel version="v2" title="V2 connection" status={auth?.v2 ?? null} />
          <div>
            <h3 className="text-sm font-black">V2 default search preferences</h3>
            <VersionDefaultsEditor version="v2" defaults={workspace.versionDefaults.v2} />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-black">Administrator session</h2>
        {!admin ? (
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Loading…</p>
        ) : !admin.configured ? (
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Admin login is not configured. Set <code>ADMIN_INITIAL_PASSWORD</code> and <code>ADMIN_SESSION_SECRET</code>, then visit <a href="/admin/login" className="text-[var(--primary)] hover:underline">/admin/login</a>.
          </p>
        ) : admin.authenticated ? (
          <div className="mt-2 text-sm leading-6">
            <p>Signed in as <strong>{admin.username}</strong>{admin.expiresAt ? ` (expires ${new Date(admin.expiresAt).toLocaleString()})` : ""}.</p>
            <button type="button" onClick={() => void logout()} className="mt-3 min-h-10 rounded-md border border-[var(--border)] px-4 text-xs font-black uppercase">
              Log out
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
            Not signed in. <a href="/admin/login" className="text-[var(--primary)] hover:underline">Log in</a> (7-day session by default). This is the application administrator session — separate from Dailymotion API authentication.
          </p>
        )}
        <p className="mt-3 text-sm">
          <a href="/admin/migrations" className="font-bold text-[var(--primary)] hover:underline">Open migration diagnostics →</a>
          <span className="ml-2 text-xs text-[var(--muted-foreground)]">Schema + data migrations, connectivity, Storage (admin only).</span>
        </p>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-black">Supabase & database</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[var(--muted-foreground)]">
          <li>Project URL + publishable key are browser-safe (<code>NEXT_PUBLIC_SUPABASE_URL</code>, <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>).</li>
          <li>Secret key <code>SUPABASE_SECRET_KEY</code> is server-only (Storage). The legacy service-role variable is retired — in Vercel, replace it with the new secret; do not deactivate keys until the deploy reads the new name.</li>
          <li>Runtime connection <code>DATABASE_URL_CONNECTION_STRING</code> (Session Pooler :5432). Optional <code>DATABASE_URL_DIRECT</code> for migration/introspection only.</li>
          <li>Local values live in root <code>.env.local</code> (never committed). Vercel values live in Project Settings → Environment Variables. <strong>Redeploy after any change.</strong></li>
          <li>Private bucket <code>application-data</code>; verify with <code>npm run supabase:storage:check</code>.</li>
        </ul>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="font-black">Environment & deployment</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[var(--muted-foreground)]">
          <li>Local: root <code>.env.local</code>. Production (Vercel): Project Settings → Environment Variables. <strong>A redeploy (or restart) is required after changing any variable</strong> — Next.js inlines server env at build/boot.</li>
          <li>V1: <code>DAILYMOTION_API_BASE_URL_V1</code> (public host default), <code>DAILYMOTION_PARTNER_API_BASE_URL_V1</code> (Partner host), <code>DAILYMOTION_OAUTH_TOKEN_URL_V1</code>, <code>PRIVATE_DAILYMOTION_API_KEY_V1</code>, <code>PRIVATE_DAILYMOTION_API_KEY_SECRET_V1</code>, <code>DAILYMOTION_API_SCOPE_V1</code> (default <code>userinfo</code>, required by the v1 token endpoint).</li>
          <li>V2: <code>DAILYMOTION_API_BASE_URL_V2</code>, <code>DAILYMOTION_OAUTH_TOKEN_URL_V2</code>, <code>PRIVATE_DAILYMOTION_API_KEY_V2</code>, <code>PRIVATE_DAILYMOTION_API_KEY_SECRET_V2</code>, <code>DAILYMOTION_API_SCOPE_V2</code> (default <code>bundle.public</code>).</li>
          <li>Filters: <code>DAILYMOTION_FAMILY_FILTER</code> (unset = safe omit; explicit <code>false</code> is a deliberate opt-out), <code>DAILYMOTION_LOCALIZATION</code> (default <code>detect</code>, v1 only).</li>
          <li>Admin: <code>ADMIN_DEFAULT_USERNAME</code>, <code>ADMIN_INITIAL_PASSWORD</code>, <code>ADMIN_SESSION_SECRET</code>, <code>ADMIN_SESSION_TTL_SECONDS</code> (604800 = 7 days).</li>
          <li>Server filter default: {auth ? <>family_filter={auth.filters.familyFilterDefault === null ? "omitted (API default ON)" : String(auth.filters.familyFilterDefault)}, localization={auth.filters.localizationDefault}</> : "loading…"}</li>
        </ul>
      </section>
    </div>
  );
}
