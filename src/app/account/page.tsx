// /account — Administrator Account Identity & Session Management
//
// What this controls: Dedicated Account page displaying administrator identity,
// session status, 7-day TTL countdown, and Supabase Auth password management.
// Why it exists: Fulfills navigation requirements under SYSTEM > Account.
// Scope: /account.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";

interface AdminStatus {
  ok: boolean;
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  expiresAt: number | null;
}

export default function AccountPage() {
  const [admin, setAdmin] = useState<AdminStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      const data = (await res.json()) as AdminStatus;
      setAdmin(data);
    } catch {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSession();
  }, []);

  async function handleLogout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Best-effort network call
    }
    setAdmin((prev) => (prev ? { ...prev, authenticated: false, username: null, expiresAt: null } : prev));
    window.location.href = "/admin/login";
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwLoading(true);
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
      setPwLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">System</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl flex items-center gap-3">
          <User className="h-8 w-8 text-[var(--primary)]" />
          Account & Administrator Profile
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          Canonical administrator identity, active Supabase Auth session, security policies, and password configuration.
        </p>
      </div>

      {/* Account Identity Card */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] font-black text-xl">
              {admin?.username ? admin.username[0]?.toUpperCase() : "A"}
            </div>
            <div>
              <h2 className="text-lg font-black text-[var(--foreground)]">
                {admin?.username ?? "Administrator"}
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5 font-mono">
                <Mail className="h-3 w-3" />
                <span>asdy@dailymotion.discov.com</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {loading ? (
              <span className="text-xs text-[var(--muted-foreground)]">Checking session...</span>
            ) : admin?.authenticated ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500">
                <ShieldCheck className="h-3.5 w-3.5" />
                Active Administrator Session
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-500">
                Not Signed In
              </span>
            )}
          </div>
        </div>

        {/* Account Details Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
            <p className="font-black uppercase tracking-wider text-[var(--muted-foreground)] text-[10px]">
              Authentication Provider
            </p>
            <p className="mt-1 font-bold text-sm text-[var(--foreground)]">Supabase Auth SSR</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">Zero passwords in PostgreSQL</p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
            <p className="font-black uppercase tracking-wider text-[var(--muted-foreground)] text-[10px]">
              Session Security
            </p>
            <p className="mt-1 font-bold text-sm text-[var(--foreground)]">HMAC-SHA256 Cookie</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
              {admin?.expiresAt ? `Expires ${new Date(admin.expiresAt).toLocaleDateString()}` : "7-Day Default TTL"}
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
            <p className="font-black uppercase tracking-wider text-[var(--muted-foreground)] text-[10px]">
              Access Scope
            </p>
            <p className="mt-1 font-bold text-sm text-[var(--foreground)]">Super Administrator</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">Full cloud persistence & R2 sync</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {admin?.authenticated ? (
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 text-xs font-bold text-red-500 hover:bg-red-500/20 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out Administrator
            </button>
          ) : (
            <Link
              href="/admin/login"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground hover:opacity-95 cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5" />
              Sign In to Administrator
            </Link>
          )}

          <Link
            href="/settings"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <Settings className="h-3.5 w-3.5" />
            API & App Settings
          </Link>

          <Link
            href="/admin/migrations"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-bold text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <Shield className="h-3.5 w-3.5" />
            Database Migrations
          </Link>
        </div>
      </section>

      {/* Password Management */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-[var(--primary)]" />
          <h2 className="text-base font-black text-[var(--foreground)]">
            Change Administrator Password
          </h2>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Updates your password directly in Supabase Auth. Passwords must be at least 8 characters.
        </p>

        <form onSubmit={(e) => void handleChangePassword(e)} className="max-w-md space-y-3 pt-2">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]" htmlFor="acc-cur-pw">
              Current Password
            </label>
            <input
              id="acc-cur-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]" htmlFor="acc-new-pw">
              New Password (min 8 characters)
            </label>
            <input
              id="acc-new-pw"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[var(--muted-foreground)]" htmlFor="acc-conf-pw">
              Confirm New Password
            </label>
            <input
              id="acc-conf-pw"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-xs font-semibold"
            />
          </div>

          {error && <p className="text-xs font-bold text-red-500" role="alert">{error}</p>}
          {message && <p className="text-xs font-bold text-emerald-500" role="status">✓ {message}</p>}

          <button
            type="submit"
            disabled={pwLoading}
            className="min-h-10 rounded-lg bg-primary px-4 text-xs font-black uppercase text-primary-foreground hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            {pwLoading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </section>
    </div>
  );
}
