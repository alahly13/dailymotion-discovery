// /admin/login — application administrator login (separate from API auth).

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Login failed.");
        return;
      }
      router.push("/settings");
    } catch {
      setError("Login request failed (network).");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "min-h-11 w-full rounded-md border border-[var(--border)] bg-[var(--surface-container-low)] px-3 text-sm font-semibold";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--primary)]">Administration</p>
        <h1 className="mt-2 text-3xl font-black">Admin login</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          Application administrator session (7-day default). Unrelated to Dailymotion API keys.
        </p>
      </div>
      <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5">
        <div>
          <label htmlFor="admin-user" className="mb-1 block text-xs font-black uppercase">Username</label>
          <input id="admin-user" className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </div>
        <div>
          <label htmlFor="admin-pass" className="mb-1 block text-xs font-black uppercase">Password</label>
          <input id="admin-pass" type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {error && <p className="text-sm font-bold text-red-500" role="alert">{error}</p>}
        <button type="submit" disabled={loading} className="min-h-11 w-full rounded-md bg-[var(--primary)] text-sm font-black text-white disabled:opacity-60">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
