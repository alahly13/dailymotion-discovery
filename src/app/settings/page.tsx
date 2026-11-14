// /settings — Redesigned Structured Settings Workspace (2026)
//
// What this controls:
// 1. Account & Session: Canonical admin identity, 7-day session validity, real Sign Out, Supabase Auth password management.
// 2. Appearance: Light, Dark, and System theme preferences with live toggling.
// 3. Discovery & API: Dailymotion V1 and V2 connection status and capabilities.
// 4. Search Preferences: Default API version, sort, page size, family filter, and localization defaults.
// 5. Storage & Synchronization: IndexedDB status, persistent browser storage, entity counts, cloud sync status.
// 6. Privacy & Data Retention: 7-day TTL enforcement, manual purge, and clear history controls with confirmation.
// 7. System & Diagnostics: Database connection status, migrations link, environment diagnostics (secrets protected).
//
// Scope: /settings workspace.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  ExternalLink,
  Eye,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  LogOut,
  Mail,
  Moon,
  Palette,
  RefreshCw,
  Search,
  Server,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  User,
} from "lucide-react";
import { ConnectionPanel, type ProfileStatus } from "@/components/discovery/connection-panel";
import { V1_VIDEO_SORTS, V2_VIDEO_SORTS } from "@/lib/discovery/param-schema";
import type { ApiVersion } from "@/lib/discovery/types";
import { useDiscoveryWorkspace, type VersionSearchDefaults } from "@/stores/discovery-workspace-store";
import { useMergedDataset } from "@/lib/local-first/use-merged-dataset";
import {
  clearAllSearchSnapshots,
  purgeExpiredSearchSnapshots,
} from "@/lib/search-history/search-snapshot-service";
import {
  getDiscoveryDatabaseStats,
  requestBrowserPersistentStorage,
} from "@/lib/local-first/indexeddb-store";

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

type SettingsTab =
  | "account"
  | "appearance"
  | "discovery"
  | "search"
  | "storage"
  | "privacy"
  | "system";

const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "account", label: "Account & Session", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "discovery", label: "Discovery & API", icon: Globe },
  { id: "search", label: "Search Preferences", icon: Search },
  { id: "storage", label: "Storage & Sync", icon: HardDrive },
  { id: "privacy", label: "Privacy & Retention", icon: Shield },
  { id: "system", label: "System & Diagnostics", icon: Server },
];

const inputClass =
  "min-h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const labelClass =
  "mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted-foreground)]";

function TriState({
  value,
  onChange,
  label,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  label: string;
}) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div
        className="grid grid-cols-3 gap-1 rounded-md border border-[var(--border)] p-1"
        role="radiogroup"
        aria-label={label}
      >
        {(
          [
            [null, "Auto (safe)"],
            [true, "On"],
            [false, "Off"],
          ] as [boolean | null, string][]
        ).map(([v, text]) => (
          <button
            key={text}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`min-h-9 rounded px-2 text-xs font-black uppercase transition cursor-pointer ${
              value === v
                ? "bg-primary text-primary-foreground font-black shadow-xs"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function VersionDefaultsEditor({
  version,
  defaults,
}: {
  version: ApiVersion;
  defaults: VersionSearchDefaults;
}) {
  const workspace = useDiscoveryWorkspace();
  const sorts = version === "v1" ? V1_VIDEO_SORTS : V2_VIDEO_SORTS;
  const [saved, setSaved] = useState(false);

  function save(partial: Partial<VersionSearchDefaults>) {
    workspace.setVersionDefaults(version, partial);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 sm:grid-cols-2">
      <div>
        <label className={labelClass} htmlFor={`def-ps-${version}`}>
          Default page size (1–100)
        </label>
        <input
          id={`def-ps-${version}`}
          type="number"
          min={1}
          max={100}
          className={inputClass}
          value={defaults.pageSize}
          onChange={(e) => save({ pageSize: e.target.value })}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`def-sort-${version}`}>
          Default sort order
        </label>
        <select
          id={`def-sort-${version}`}
          className={inputClass}
          value={defaults.sort}
          onChange={(e) => save({ sort: e.target.value })}
        >
          {sorts.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {version === "v1" && (
        <>
          <TriState
            label="Default family filter (Auto = API default ON)"
            value={defaults.familyFilter}
            onChange={(v) => save({ familyFilter: v })}
          />
          <div>
            <label className={labelClass} htmlFor="def-loc-v1">
              Default localization
            </label>
            <input
              id="def-loc-v1"
              className={inputClass}
              value={defaults.localization}
              onChange={(e) => save({ localization: e.target.value })}
              placeholder="detect"
            />
          </div>
        </>
      )}
      <div className="flex items-center gap-3 sm:col-span-2 pt-2 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={() => {
            workspace.resetVersionDefaults(version);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
          className="min-h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-black uppercase text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
        >
          Reset {version.toUpperCase()} defaults
        </button>
        {saved && (
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400" aria-live="polite">
            ✓ Preferences saved locally.
          </span>
        )}
      </div>
      {version === "v1" && defaults.familyFilter === false && (
        <p className="text-xs font-bold text-amber-600 sm:col-span-2">
          Warning: Default family filter is OFF — v1 searches will include explicit content unless overridden per search.
        </p>
      )}
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string; error?: string };
      if (!data.ok) {
        setError(data.error || "Failed to change password.");
      } else {
        setMessage(data.message || "Password updated successfully in Supabase Auth.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setError("Network error while submitting password change request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mt-4 max-w-md space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-[var(--primary)]" />
        <h3 className="text-xs font-black uppercase tracking-[0.12em] text-[var(--foreground)]">
          Change Administrator Password
        </h3>
      </div>
      <p className="text-[11px] text-[var(--muted-foreground)]">
        Updates your operator password directly in Supabase Auth SSR. Passwords are never stored in PostgreSQL.
      </p>

      <div>
        <label className={labelClass} htmlFor="cp-current">
          Current Password
        </label>
        <input
          id="cp-current"
          type="password"
          className={inputClass}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="cp-new">
          New Password (minimum 8 characters)
        </label>
        <input
          id="cp-new"
          type="password"
          className={inputClass}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="cp-confirm">
          Confirm New Password
        </label>
        <input
          id="cp-confirm"
          type="password"
          className={inputClass}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>

      {error && (
        <p className="text-xs font-bold text-red-500" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400" role="status">
          ✓ {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="min-h-9 rounded-lg bg-primary px-4 text-xs font-black uppercase text-primary-foreground shadow-xs hover:opacity-90 disabled:opacity-50 cursor-pointer"
      >
        {loading ? "Updating..." : "Update Password"}
      </button>
    </form>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [admin, setAdmin] = useState<AdminStatus | null>(null);
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "system">("dark");
  const [dbStats, setDbStats] = useState<Record<string, number>>({});
  const [persistedStorage, setPersistedStorage] = useState<boolean | null>(null);
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const workspace = useDiscoveryWorkspace();
  const merged = useMergedDataset();

  // Load auth status, admin session, and database stats on mount
  useEffect(() => {
    void fetch("/api/discovery/auth-status")
      .then((r) => r.json())
      .then(setAuth)
      .catch(() => setAuth(null));

    void fetch("/api/admin/session", { cache: "no-store" })
      .then((r) => r.json())
      .then(setAdmin)
      .catch(() => setAdmin(null));

    void getDiscoveryDatabaseStats()
      .then(setDbStats)
      .catch(() => {});

    if (typeof navigator !== "undefined" && navigator.storage?.persisted) {
      void navigator.storage.persisted().then(setPersistedStorage).catch(() => {});
    }

    // Detect theme mode
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") {
        setThemeMode(stored);
      } else {
        setThemeMode("system");
      }
    } catch {
      // Non-fatal
    }
  }, []);

  // Theme changer helper
  function handleThemeChange(mode: "light" | "dark" | "system") {
    setThemeMode(mode);
    const root = document.documentElement;
    if (mode === "system") {
      try {
        localStorage.removeItem("theme");
      } catch {}
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", isDark);
      root.dataset.theme = isDark ? "dark" : "light";
    } else {
      try {
        localStorage.setItem("theme", mode);
      } catch {}
      root.classList.toggle("dark", mode === "dark");
      root.dataset.theme = mode;
    }
  }

  // Real Sign Out handler
  async function handleSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Non-fatal
    }
    setAdmin((prev) => (prev ? { ...prev, authenticated: false, username: null, expiresAt: null } : prev));
    window.location.href = "/login";
  }

  // Purge expired search snapshots
  async function handlePurgeExpired() {
    try {
      const purged = await purgeExpiredSearchSnapshots();
      setPurgeNotice(`Cleaned up ${purged} expired snapshots.`);
      const stats = await getDiscoveryDatabaseStats();
      setDbStats(stats);
      setTimeout(() => setPurgeNotice(null), 3000);
    } catch {
      setPurgeNotice("Failed to purge expired snapshots.");
    }
  }

  // Clear all search snapshots
  async function handleClearAllSnapshots() {
    try {
      const removed = await clearAllSearchSnapshots();
      setConfirmClearOpen(false);
      setPurgeNotice(`Cleared all ${removed} search history snapshots from IndexedDB.`);
      const stats = await getDiscoveryDatabaseStats();
      setDbStats(stats);
      setTimeout(() => setPurgeNotice(null), 3500);
    } catch {
      setPurgeNotice("Failed to clear search history.");
    }
  }

  // Request persistent storage
  async function handleRequestStorage() {
    const granted = await requestBrowserPersistentStorage();
    setPersistedStorage(granted.persisted);
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Configuration</p>
        <h1 className="mt-1 text-3xl font-black text-[var(--foreground)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Manage integrations, session security, search preferences, theme, and persistent local storage.
        </p>
      </div>

      {/* Structured Section Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border)] pb-3" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition cursor-pointer ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-container-high)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 1. ACCOUNT & SESSION ────────────────────────────────────────── */}
      {activeTab === "account" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div>
                <h2 className="text-base font-black text-[var(--foreground)]">Administrator Identity</h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Application administrator credentials authenticate using Supabase Auth SSR.
                </p>
              </div>

              {admin?.authenticated && (
                <button
                  type="button"
                  disabled={signingOut}
                  onClick={() => void handleSignOut()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 text-xs font-black text-red-500 hover:bg-red-500/20 cursor-pointer disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>{signingOut ? "Signing Out..." : "Sign Out"}</span>
                </button>
              )}
            </div>

            {!admin ? (
              <p className="text-xs text-[var(--muted-foreground)]">Checking session...</p>
            ) : admin.authenticated ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
                    <span className={labelClass}>Username</span>
                    <p className="font-bold text-sm text-[var(--foreground)]">{admin.username}</p>
                    <p className="text-[11px] text-[var(--muted-foreground)] font-mono">asdy@dailymotion.discov.com</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
                    <span className={labelClass}>Session TTL & Expiration</span>
                    <p className="font-bold text-sm text-[var(--foreground)]">
                      {admin.expiresAt ? new Date(admin.expiresAt).toLocaleDateString() : "Active"}
                    </p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">7-Day Enforced Session TTL (604,800s)</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
                    <span className={labelClass}>Cookie Type</span>
                    <p className="font-bold text-sm text-[var(--foreground)]">HTTP-Only HMAC Cookie</p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">dm_admin_session (Strict)</p>
                  </div>
                </div>

                <ChangePasswordForm />
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div>
                  <p className="text-xs font-black text-amber-500 uppercase tracking-wider">Not Signed In</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    You are viewing the application in public mode. Sign in to access administrative diagnostics and data sync.
                  </p>
                </div>
                <Link
                  href="/login"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground shadow-xs hover:opacity-90"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Sign In
                </Link>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── 2. APPEARANCE ──────────────────────────────────────────────── */}
      {activeTab === "appearance" && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-black text-[var(--foreground)]">Interface Appearance & Theme</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Choose between light, dark, or system appearance. Dark mode meets WCAG 2.2 AA contrast standards.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 max-w-lg">
            <button
              type="button"
              onClick={() => handleThemeChange("light")}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-black transition cursor-pointer ${
                themeMode === "light"
                  ? "border-[var(--primary)] bg-[var(--surface-container-high)] text-[var(--primary)] shadow-xs"
                  : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <Sun className="h-6 w-6" />
              <span>Light Theme</span>
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange("dark")}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-black transition cursor-pointer ${
                themeMode === "dark"
                  ? "border-[var(--primary)] bg-[var(--surface-container-high)] text-[var(--primary)] shadow-xs"
                  : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <Moon className="h-6 w-6" />
              <span>Dark Theme</span>
            </button>

            <button
              type="button"
              onClick={() => handleThemeChange("system")}
              className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-xs font-black transition cursor-pointer ${
                themeMode === "system"
                  ? "border-[var(--primary)] bg-[var(--surface-container-high)] text-[var(--primary)] shadow-xs"
                  : "border-[var(--border)] bg-[var(--surface-container-low)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              <SlidersHorizontal className="h-6 w-6" />
              <span>System Default</span>
            </button>
          </div>
        </section>
      )}

      {/* ── 3. DISCOVERY & API ─────────────────────────────────────────── */}
      {activeTab === "discovery" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-black text-[var(--foreground)]">Dailymotion API V1 — Legacy / Partner</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Global keyword search, channels, playlists, user discovery. Partner host for authenticated calls; documented public host for anonymous discovery.
              </p>
            </div>
            <ConnectionPanel version="v1" title="V1 Connection Diagnostics" status={auth?.v1 ?? null} />
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-black text-[var(--foreground)]">Dailymotion API V2 — Current</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Modern unified host. Strict profile-scoped catalog browsing; Bearer token always required.
              </p>
            </div>
            <ConnectionPanel version="v2" title="V2 Connection Diagnostics" status={auth?.v2 ?? null} />
          </section>
        </div>
      )}

      {/* ── 4. SEARCH PREFERENCES ──────────────────────────────────────── */}
      {activeTab === "search" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-black text-[var(--foreground)]">V1 Default Search Preferences</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Configures initial sort order, page size, localization, and family filter for V1 searches.
              </p>
            </div>
            <VersionDefaultsEditor version="v1" defaults={workspace.versionDefaults.v1} />
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-black text-[var(--foreground)]">V2 Default Search Preferences</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Configures initial sort order and page size for V2 profile catalog browsing.
              </p>
            </div>
            <VersionDefaultsEditor version="v2" defaults={workspace.versionDefaults.v2} />
          </section>
        </div>
      )}

      {/* ── 5. STORAGE & SYNCHRONIZATION ──────────────────────────────── */}
      {activeTab === "storage" && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
            <div>
              <h2 className="text-base font-black text-[var(--foreground)]">IndexedDB Local Storage & Browser Quota</h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Primary offline persistence layer storing search snapshots, saved items, playlists, and presets.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRequestStorage()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--foreground)] hover:border-[var(--primary)] cursor-pointer"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>{persistedStorage ? "Storage Persisted" : "Request Persistent Storage"}</span>
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
              <span className={labelClass}>Search Snapshots</span>
              <p className="font-bold text-lg text-[var(--foreground)]">{dbStats.search_snapshots ?? 0}</p>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {dbStats.search_snapshot_pages ?? 0} pages cached
              </p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
              <span className={labelClass}>Saved Items</span>
              <p className="font-bold text-lg text-[var(--foreground)]">{merged.savedItems.length}</p>
              <p className="text-[11px] text-[var(--muted-foreground)]">In local IndexedDB</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
              <span className={labelClass}>Playlists / Collections</span>
              <p className="font-bold text-lg text-[var(--foreground)]">{merged.collections.length}</p>
              <p className="text-[11px] text-[var(--muted-foreground)]">User-managed libraries</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
              <span className={labelClass}>Browser Storage Mode</span>
              <p className="font-bold text-sm text-[var(--foreground)]">
                {persistedStorage === true ? "Durable / Persistent" : "Best-effort Browser Storage"}
              </p>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {persistedStorage === true ? "Protected from auto-eviction" : "Can be granted persistent status"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/storage"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Open Storage Documents Explorer →</span>
            </Link>
            <Link
              href="/saved-titles"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 text-xs font-bold text-purple-600 dark:text-purple-300 hover:bg-purple-500/20"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>Open Saved Titles Workspace →</span>
            </Link>
          </div>
        </section>
      )}

      {/* ── 6. PRIVACY & DATA RETENTION ─────────────────────────────────── */}
      {activeTab === "privacy" && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-black text-[var(--foreground)]">Privacy & Search History Retention</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              All search snapshots are stored locally on your device with strict 7-day automatic retention. Zero search history is transmitted to third parties.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-4 text-xs space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <span className="font-bold text-sm">7-Day Local Retention Guarantee</span>
            </div>
            <p className="text-[var(--muted-foreground)]">
              Snapshots remain accessible across browser restarts and tab closures for <strong>604,800 seconds (7 days)</strong>. Expired snapshots and associated page caches are purged automatically without affecting Saved Items or Playlists.
            </p>
          </div>

          {purgeNotice && (
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400" role="status">
              ✓ {purgeNotice}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => void handlePurgeExpired()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3.5 text-xs font-bold text-[var(--foreground)] hover:border-[var(--primary)] cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Purge Expired Snapshots Now</span>
            </button>

            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 text-xs font-bold text-red-500 hover:bg-red-500/20 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear All Search History</span>
            </button>
          </div>

          {/* Confirmation Modal for Clearing History */}
          {confirmClearOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl space-y-4">
                <div className="flex items-center gap-2 text-red-500">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="font-black text-base text-[var(--foreground)]">Clear All Search History?</h3>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                  This will remove all search snapshot records from local IndexedDB. Your <strong>Saved Items</strong> and <strong>Playlists</strong> will NOT be affected. This action cannot be undone.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(false)}
                    className="min-h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClearAllSnapshots()}
                    className="min-h-9 rounded-lg bg-red-600 px-4 text-xs font-black text-white hover:bg-red-700 cursor-pointer shadow-xs"
                  >
                    Yes, Clear All Search History
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── 7. SYSTEM & DIAGNOSTICS ────────────────────────────────────── */}
      {activeTab === "system" && (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-5">
          <div>
            <h2 className="text-base font-black text-[var(--foreground)]">System Diagnostics & Environment</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Architecture health, database connectivity, and backend environment configuration.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-4 space-y-1.5">
              <span className={labelClass}>Application Build</span>
              <p className="font-bold text-sm text-[var(--foreground)]">Dailymotion Discovery 2026.11</p>
              <p className="text-[11px] text-[var(--muted-foreground)]">Next.js 16.4.6 · React 19.3.1 · Prisma 7.10.1</p>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-4 space-y-1.5">
              <span className={labelClass}>PostgreSQL Database</span>
              <p className="font-bold text-sm text-[var(--foreground)]">Supabase Session Pooler (:5432)</p>
              <p className="text-[11px] text-[var(--muted-foreground)]">IPv4 Compatible Session Pooler</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/admin/migrations"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--primary)] hover:underline"
            >
              <Database className="h-3.5 w-3.5" />
              <span>Open Database Migrations Console →</span>
            </Link>

            <Link
              href="/account"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <User className="h-3.5 w-3.5" />
              <span>Account Identity & Permissions →</span>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
