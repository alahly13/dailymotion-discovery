"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, Home } from "lucide-react";

export default function RootErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Application] Global error boundary caught error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/5 p-8 text-center shadow-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 mb-4">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-black text-[var(--foreground)]">Unexpected Page Error</h2>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
          An error occurred while loading this view. You can reload this view or navigate back to the Discovery Dashboard.
        </p>
        {error?.message && (
          <div className="mt-4 rounded-lg bg-[var(--surface-container-high)] p-2.5 text-left font-mono text-[11px] text-red-400 overflow-x-auto">
            {error.message}
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-black text-primary-foreground shadow-xs transition hover:opacity-90 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-container-high)] transition"
          >
            <Home className="h-3.5 w-3.5" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
