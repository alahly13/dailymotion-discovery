// Centralized Dailymotion API Error Alert Component
//
// What this controls: Unified UI presentation for Dailymotion API errors across Global Search,
// Link Explorer, and other discovery surfaces.
// Why it exists: Replaces inconsistent, ad-hoc red error blocks with a polished,
// accessible, WCAG-compliant alert presenting clear explanations, actionable remedies,
// and safe technical diagnostics without exposing secrets.
// Scope: Global Search (/global-search), Link Explorer (/link-explorer), and Discovery Explorers.

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, KeyRound, Globe, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import type { DailymotionNormalizedError } from "@/lib/dailymotion/errors/types";

export interface ApiErrorAlertProps {
  error: DailymotionNormalizedError | {
    error?: string;
    reason?: string;
    remedy?: string | null;
    status?: number | null;
    apiVersion?: string;
    endpoint?: string | null;
    retryable?: boolean;
    suggestedAction?: string;
    userMessage?: string;
    code?: string;
  };
  onRetry?: () => void;
  onSwitchVersion?: (targetVersion: "v1" | "v2") => void;
  className?: string;
}

export function ApiErrorAlert({ error, onRetry, onSwitchVersion, className = "" }: ApiErrorAlertProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Normalize fields between full DailymotionNormalizedError and partial failure shapes
  const rawObj = error as Record<string, any>;
  const apiVersion = (rawObj.apiVersion ?? "unknown").toUpperCase();
  const title = rawObj.userMessage || rawObj.error || "Request failed";
  const technicalMessage = rawObj.message || rawObj.error || "";
  const suggestedAction =
    rawObj.suggestedAction ||
    rawObj.remedy ||
    "Please check your parameters and try again.";
  const status = rawObj.status ?? rawObj.httpStatus ?? null;
  const code = String(rawObj.code || rawObj.reason || "ERROR");
  const isRetryable = rawObj.retryable !== undefined ? rawObj.retryable : (status === 429 || (status !== null && status >= 500));
  const isAuthError = code.includes("AUTH") || status === 401 || status === 403 || rawObj.reason === "auth_missing" || rawObj.reason === "auth_expired";
  const isV2SearchLimitation = apiVersion === "V2" && (technicalMessage.toLowerCase().includes("global search") || technicalMessage.toLowerCase().includes("profile id"));

  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-500/30 bg-red-500/10 p-4 sm:p-5 text-[var(--foreground)] transition-all ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-600 dark:text-red-400">
          {isAuthError ? <KeyRound className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-red-600/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-700 dark:text-red-300">
              {apiVersion} Error
            </span>
            {status && (
              <span className="rounded-md border border-red-500/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-red-600 dark:text-red-300">
                HTTP {status}
              </span>
            )}
            <span className="rounded-md bg-black/5 dark:bg-white/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground">
              {code}
            </span>
          </div>

          <h3 className="text-sm font-bold text-red-950 dark:text-red-100 leading-snug">
            {title}
          </h3>

          <p className="text-xs text-red-900/90 dark:text-red-200/90 leading-relaxed font-medium">
            {suggestedAction}
          </p>

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {onRetry && isRetryable && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry Request
              </button>
            )}

            {isAuthError && (
              <Link
                href="/settings"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition"
              >
                <KeyRound className="h-3.5 w-3.5 text-primary" />
                Configure in Settings
              </Link>
            )}

            {isV2SearchLimitation && onSwitchVersion && (
              <button
                type="button"
                onClick={() => onSwitchVersion("v1")}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-bold text-[var(--primary-foreground)] shadow-xs hover:opacity-95 transition cursor-pointer"
              >
                <Globe className="h-3.5 w-3.5" />
                Switch to API v1 for Global Search
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="inline-flex h-8 items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition ml-auto cursor-pointer"
            >
              <span>{detailsOpen ? "Hide Diagnostics" : "Technical Details"}</span>
              {detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* Collapsible Safe Diagnostics */}
          {detailsOpen && (
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] p-3 text-xs space-y-1.5 font-mono">
              <div className="text-[11px] text-muted-foreground font-sans font-bold uppercase tracking-wider">
                Safe Technical Diagnostics (Secrets Redacted)
              </div>
              <div className="text-[11px] text-foreground">
                <span className="text-muted-foreground font-semibold">Message:</span> {technicalMessage}
              </div>
              {error.endpoint && (
                <div className="text-[11px] text-foreground">
                  <span className="text-muted-foreground font-semibold">Endpoint:</span> {error.endpoint}
                </div>
              )}
              {"requestId" in error && error.requestId && (
                <div className="text-[11px] text-foreground">
                  <span className="text-muted-foreground font-semibold">Correlation ID:</span> {error.requestId}
                </div>
              )}
              {"timestamp" in error && error.timestamp && (
                <div className="text-[11px] text-muted-foreground">
                  Timestamp: {error.timestamp}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
