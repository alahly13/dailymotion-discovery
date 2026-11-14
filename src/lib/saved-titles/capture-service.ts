/**
 * Centralized Automatic Capture Service for Saved Titles (2026)
 *
 * What this controls:
 * 1. Automatic capture of submitted Global Search queries (value, origin "Global Search", API version).
 * 2. Automatic capture of submitted Link Explorer inputs (value, canonical URL, detected resource kind, origin "Link Explorer", API version).
 * 3. Immediate local persistence in IndexedDB under the authenticated owner scope.
 * 4. Preservation of search submissions as useful historical references even if provider errors.
 *
 * Scope: Client-side capture service called on search/link submission.
 */

import { analyzeDailymotionUrlOrId, type DailymotionAnalyzedLink } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import { saveLocalSavedTitle } from "./local-storage";
import type { SavedTitleEntry, SavedTitleKind } from "./types";

let cachedClientOwnerId: string | null = null;
let lastOwnerFetchTime = 0;

/**
 * Resolves the current authenticated user's owner UUID on the client.
 */
export async function getClientOwnerId(): Promise<string> {
  const now = Date.now();
  if (cachedClientOwnerId && now - lastOwnerFetchTime < 60000) {
    return cachedClientOwnerId;
  }

  try {
    const res = await fetch("/api/auth/session", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { ok: boolean; authenticated: boolean; ownerId?: string };
      if (data.ok && data.authenticated && data.ownerId) {
        cachedClientOwnerId = data.ownerId;
        lastOwnerFetchTime = now;
        return data.ownerId;
      }
    }
  } catch {
    // Best-effort in offline mode
  }

  return cachedClientOwnerId || "local-owner";
}

export function setCachedClientOwnerId(ownerId: string | null): void {
  cachedClientOwnerId = ownerId;
  lastOwnerFetchTime = Date.now();
}

function generateStableId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `st_${prefix}_${ts}_${rand}`;
}

/**
 * Captures an executed Global Search query.
 * Called immediately upon user form submission (not on keystroke).
 */
export async function captureSearchSubmission(
  query: string,
  apiVersion: "v1" | "v2",
  ownerId?: string
): Promise<SavedTitleEntry | null> {
  const cleanQuery = (query || "").trim();
  if (!cleanQuery) return null;

  const resolvedOwner = ownerId || (await getClientOwnerId());
  const now = new Date().toISOString();

  const entry: SavedTitleEntry = {
    id: generateStableId("srch"),
    ownerId: resolvedOwner,
    kind: "search_query",
    value: cleanQuery,
    displayTitle: cleanQuery,
    source: {
      workspace: "global-search",
      label: "Global Search",
      apiVersion,
      resourceType: null,
    },
    addedBy: {
      type: "search-action",
    },
    createdAt: now,
    updatedAt: now,
    resourceType: null,
    canonicalUrl: null,
    notes: null,
    status: "pending_sync",
  };

  return saveLocalSavedTitle(entry);
}

/**
 * Captures an executed Link Explorer input (URL, handle, ID, or short link).
 * Called immediately upon user submission.
 */
export async function captureLinkSubmission(
  input: string,
  apiVersion: "v1" | "v2",
  analyzed?: DailymotionAnalyzedLink,
  ownerId?: string
): Promise<SavedTitleEntry | null> {
  const cleanInput = (input || "").trim();
  if (!cleanInput) return null;

  const resolvedOwner = ownerId || (await getClientOwnerId());
  const now = new Date().toISOString();

  const parsed = analyzed || analyzeDailymotionUrlOrId(cleanInput);

  let detectedKind: SavedTitleKind = "text_reference";
  if (cleanInput.startsWith("http://") || cleanInput.startsWith("https://") || cleanInput.startsWith("dai.ly")) {
    detectedKind = "url";
  } else if (cleanInput.startsWith("@") || cleanInput.startsWith("channel:")) {
    detectedKind = "handle";
  } else if (/^[a-zA-Z0-9_-]{5,}$/.test(cleanInput)) {
    detectedKind = "resource_id";
  } else if (parsed.kind === "search") {
    detectedKind = "search_query";
  }

  const resourceType = parsed.kind === "unsupported" || parsed.kind === "search" ? null : parsed.kind;

  const entry: SavedTitleEntry = {
    id: generateStableId("link"),
    ownerId: resolvedOwner,
    kind: detectedKind,
    value: cleanInput,
    displayTitle: parsed.displayLabel || cleanInput,
    source: {
      workspace: "link-explorer",
      label: "Link Explorer",
      apiVersion,
      resourceType,
    },
    addedBy: {
      type: "link-action",
    },
    createdAt: now,
    updatedAt: now,
    resourceType,
    canonicalUrl: parsed.canonicalUrl || null,
    notes: null,
    status: "pending_sync",
  };

  return saveLocalSavedTitle(entry);
}

/**
 * Captures any discovery submission from another workspace (e.g. Channel Explorer).
 */
export async function captureDiscoverySubmission(
  input: string,
  workspace: string,
  label: string,
  apiVersion: "v1" | "v2" | null = null,
  ownerId?: string
): Promise<SavedTitleEntry | null> {
  const cleanInput = (input || "").trim();
  if (!cleanInput) return null;

  const resolvedOwner = ownerId || (await getClientOwnerId());
  const now = new Date().toISOString();
  const parsed = analyzeDailymotionUrlOrId(cleanInput);

  let detectedKind: SavedTitleKind = "text_reference";
  if (cleanInput.startsWith("http://") || cleanInput.startsWith("https://") || cleanInput.startsWith("dai.ly")) {
    detectedKind = "url";
  } else if (cleanInput.startsWith("@")) {
    detectedKind = "handle";
  } else if (parsed.kind === "search") {
    detectedKind = "search_query";
  } else if (parsed.kind !== "unsupported") {
    detectedKind = "resource_id";
  }

  const resourceType = parsed.kind === "unsupported" || parsed.kind === "search" ? null : parsed.kind;

  const entry: SavedTitleEntry = {
    id: generateStableId("disc"),
    ownerId: resolvedOwner,
    kind: detectedKind,
    value: cleanInput,
    displayTitle: parsed.displayLabel || cleanInput,
    source: {
      workspace,
      label,
      apiVersion,
      resourceType,
    },
    addedBy: {
      type: "channel-action",
    },
    createdAt: now,
    updatedAt: now,
    resourceType,
    canonicalUrl: parsed.canonicalUrl || null,
    notes: null,
    status: "pending_sync",
  };

  return saveLocalSavedTitle(entry);
}
