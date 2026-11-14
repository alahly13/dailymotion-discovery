/**
 * Synchronized API Version Source of Truth (2026)
 *
 * What this controls:
 * 1. Single source of truth for the active API version ("v1" | "v2") derived from the URL query parameter (`?v=v1|v2`).
 * 2. Bi-directional synchronization between the page selector and sidebar submenu items.
 * 3. Preserves unrelated query parameters (search query, resource ID, filters, etc.) when switching versions.
 * 4. Ensures browser Back and Forward history correctly triggers version synchronization.
 * 5. Distinct workspace separation between Global Search and Link Explorer.
 *
 * Scope: Application-wide navigation & discovery state.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import type { ApiVersion } from "@/lib/discovery/types";

export const API_VERSION_EVENT = "dm:api-version-change";

/**
 * Reads the current API version directly from window.location.search.
 * Defaults to "v1" if omitted or unrecognized.
 */
export function getUrlApiVersion(defaultVersion: ApiVersion = "v1"): ApiVersion {
  if (typeof window === "undefined") return defaultVersion;
  try {
    const v = new URLSearchParams(window.location.search).get("v");
    if (v === "v2") return "v2";
    if (v === "v1") return "v1";
  } catch {
    // Non-browser or SSR fallback
  }
  return defaultVersion;
}

/**
 * Authoritatively updates the active API version in the URL query string
 * and dispatches synchronization events across all listeners (page and sidebar).
 *
 * Preserves all existing query parameters (q, type, url, filters, etc.).
 */
export function setUrlApiVersion(nextVersion: ApiVersion): void {
  if (typeof window === "undefined") return;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("v") === nextVersion) return; // No change needed

    sp.set("v", nextVersion);
    const newUrl = `${window.location.pathname}?${sp.toString()}`;

    window.history.replaceState(null, "", newUrl);

    // Dispatch custom event for immediate React state synchronization
    window.dispatchEvent(
      new CustomEvent<ApiVersion>(API_VERSION_EVENT, { detail: nextVersion })
    );

    // Also dispatch a popstate event for standard window listeners
    if (typeof PopStateEvent !== "undefined") {
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else if (typeof Event !== "undefined") {
      window.dispatchEvent(new Event("popstate"));
    }
  } catch (err) {
    console.warn("[version-sync] Failed to update URL version:", err);
  }
}

/**
 * React hook to subscribe to and update the synchronized API version.
 * Keeps page version selectors and sidebar submenu items in 100% lockstep.
 */
export function useSynchronizedApiVersion(
  fallbackDefault: ApiVersion = "v1"
): [ApiVersion, (next: ApiVersion) => void] {
  const [version, setVersionState] = useState<ApiVersion>(() => getUrlApiVersion(fallbackDefault));

  useEffect(() => {
    // Sync initial state on mount from current URL
    setVersionState(getUrlApiVersion(fallbackDefault));

    const handleVersionEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ApiVersion>;
      if (customEvent.detail === "v1" || customEvent.detail === "v2") {
        setVersionState(customEvent.detail);
      } else {
        setVersionState(getUrlApiVersion(fallbackDefault));
      }
    };

    const handlePopState = () => {
      setVersionState(getUrlApiVersion(fallbackDefault));
    };

    window.addEventListener(API_VERSION_EVENT, handleVersionEvent);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener(API_VERSION_EVENT, handleVersionEvent);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [fallbackDefault]);

  const setVersion = useCallback((next: ApiVersion) => {
    setUrlApiVersion(next);
    setVersionState(next);
  }, []);

  return [version, setVersion];
}
