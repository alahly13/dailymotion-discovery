"use client";

import { useState, useTransition, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RotateCw,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/**
 * Standalone Security Gateway & Platform Login Portal (2026)
 *
 * What this controls:
 * 1. Independent full-viewport gateway outside the internal AppShell (no sidebar, no internal nav).
 * 2. Supabase Auth SSR session verification and cookie establishment.
 * 3. Support for canonical administrator identity `asdy` and email credentials.
 * 4. 7-day session persistence toggle (ADMIN_SESSION_TTL_SECONDS=604800).
 * 5. Integrated password recovery flow.
 * 6. Responsive 2026 Luxury True OLED Obsidian aesthetic with light/dark theme support.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl") || "/";

  // Mode: "signin" | "forgot"
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  // Form fields
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Recovery email
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);

  // States
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanId = identifier.trim();
    if (!cleanId) {
      setErrorMessage("Please enter your account email or username.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your account password.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identifier: cleanId,
            password,
            remember: rememberMe,
          }),
        });

        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          user?: { id: string; email: string };
          isAdmin?: boolean;
        };

        if (!res.ok || !data.ok) {
          setErrorMessage(
            data.error || "Authentication failed. Please verify your credentials and try again."
          );
          return;
        }

        setSuccessMessage("Authentication verified. Opening your research workspace...");

        // Ensure safe return destination
        const safeDestination =
          returnUrl.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/";

        setTimeout(() => {
          router.replace(safeDestination);
          router.refresh();
        }, 300);
      } catch {
        setErrorMessage("Network error while contacting authentication service. Please retry.");
      }
    });
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = recoveryEmail.trim();
    if (!cleanEmail) {
      setErrorMessage("Please enter your account email.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail }),
        });

        const data = (await res.json()) as { ok: boolean; message?: string; error?: string };

        if (!res.ok || !data.ok) {
          setErrorMessage(data.error || "Unable to process password recovery request.");
          return;
        }

        setRecoverySent(true);
        setSuccessMessage(
          data.message ||
            "If an account exists with this email, password recovery instructions have been sent."
        );
      } catch {
        setErrorMessage("Network error while submitting recovery request.");
      }
    });
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--primary)] selection:text-[var(--primary-foreground)] relative overflow-hidden">
      {/* Subtle radial ambient background glow for luxury dark mode */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[650px] h-[400px] rounded-full bg-gradient-to-b from-purple-600/10 via-blue-600/5 to-transparent blur-3xl"
        aria-hidden="true"
      />

      {/* Standalone Gateway Top Bar */}
      <header className="relative z-10 w-full flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)]/70 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/dailymotion-icon.svg"
            alt="Dailymotion Discovery Logo"
            className="h-8 w-8 rounded-md shrink-0 shadow-xs"
          />
          <div>
            <span className="block text-sm font-black tracking-tight text-[var(--foreground)]">
              Dailymotion Discovery
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
              Security Gateway & Platform Portal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-extrabold text-emerald-500 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Supabase SSR Enforced</span>
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Standalone Gateway Card Container */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md sm:max-w-lg space-y-6">
          {/* Gateway Card */}
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-xl p-8 sm:p-10 shadow-2xl shadow-black/10 dark:shadow-black/50 transition-all">
            {/* Header branding inside card */}
            <div className="text-center space-y-2 mb-8">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)] mb-2 shadow-inner border border-[var(--border)]">
                {mode === "signin" ? (
                  <Lock className="h-7 w-7" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-7 w-7" aria-hidden="true" />
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--foreground)]">
                {mode === "signin" ? "Sign In to Dailymotion Discovery" : "Account Password Recovery"}
              </h1>
              <p className="text-xs sm:text-sm text-[var(--muted-foreground)] max-w-sm mx-auto leading-relaxed">
                {mode === "signin"
                  ? "Access your owner-scoped research catalog, Saved Titles manifest, and dual-API discovery workspaces."
                  : "Enter your registered email address to receive secure recovery instructions."}
              </p>
            </div>

            {/* Error and Success alerts */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-600 dark:text-red-400 font-medium"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div
                role="status"
                className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="flex-1 leading-relaxed">{successMessage}</span>
              </div>
            )}

            {mode === "signin" ? (
              /* Sign In Form */
              <form onSubmit={handleSignIn} className="space-y-5" noValidate>
                {/* Account identifier field */}
                <div className="space-y-2">
                  <label
                    htmlFor="identifier"
                    className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider"
                  >
                    Email or Account Identifier
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--muted-foreground)]">
                      <User className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <input
                      id="identifier"
                      name="identifier"
                      type="text"
                      autoComplete="username"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="asdy or asdy@dailymotion.discov.com"
                      className="block w-full rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] pl-10 pr-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--primary)] transition"
                    />
                  </div>
                </div>

                {/* Password field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs font-semibold text-[var(--primary)] hover:underline focus:outline-hidden cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--muted-foreground)]">
                      <Lock className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="block w-full rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] pl-10 pr-11 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--primary)] transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember session checkbox */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                    />
                    <span className="text-xs text-[var(--muted-foreground)] font-medium">
                      Keep session active for 7 days
                    </span>
                  </label>
                </div>

                {/* Submit button with high-contrast armor */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-extrabold px-5 py-3 text-sm shadow-lg transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                  >
                    {isPending ? (
                      <>
                        <RotateCw className="h-4 w-4 animate-spin" />
                        <span>Verifying Credentials...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to Platform</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* Forgot Password Form */
              <form onSubmit={handleForgotPassword} className="space-y-5" noValidate>
                <div className="space-y-2">
                  <label
                    htmlFor="recoveryEmail"
                    className="block text-xs font-bold text-[var(--foreground)] uppercase tracking-wider"
                  >
                    Account Email Address
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--muted-foreground)]">
                      <Mail className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <input
                      id="recoveryEmail"
                      name="recoveryEmail"
                      type="email"
                      autoComplete="email"
                      required
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      placeholder="asdy@dailymotion.discov.com"
                      className="block w-full rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] pl-10 pr-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:outline-hidden focus:ring-1 focus:ring-[var(--primary)] transition"
                    />
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <button
                    type="submit"
                    disabled={isPending || recoverySent}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-extrabold px-5 py-3 text-sm shadow-lg transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isPending ? (
                      <>
                        <RotateCw className="h-4 w-4 animate-spin" />
                        <span>Sending Instructions...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Password Reset Link</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="w-full inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] font-bold px-4 py-2.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-container-high)] transition cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}

            {/* Account scope & security reassurance note */}
            <div className="mt-8 border-t border-[var(--border)] pt-4 text-center">
              <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                Authorized Personnel Only. Every session is cryptographically validated and strictly
                owner-scoped. Registration of new unapproved accounts is prohibited.
              </p>
            </div>
          </div>

          {/* Footer information */}
          <div className="text-center text-xs text-[var(--muted-foreground)] space-y-1.5">
            <p className="font-bold text-[var(--foreground)] flex items-center justify-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-400" />
              <span>Dailymotion Discovery Platform (2026)</span>
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Dual-API V1/V2 · Cloudflare R2 Cloud Sync · IndexedDB Local-First Architecture
            </p>
          </div>
        </div>
      </main>

      {/* Bottom status bar */}
      <footer className="relative z-10 w-full py-3.5 px-6 text-center border-t border-[var(--border)] bg-[var(--surface)]/70 backdrop-blur-md text-[11px] text-[var(--muted-foreground)]">
        <span>Protected by Supabase SSR & Cloudflare Worker Security Architecture (2026)</span>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
          <RotateCw className="h-6 w-6 animate-spin text-[var(--primary)]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
