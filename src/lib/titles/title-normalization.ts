/**
 * Centralized Title Normalization, Safe Merging & Indexing Engine (2026)
 *
 * What this controls:
 * 1. Clean extraction of canonical titles from V1 and V2 Dailymotion API payloads.
 * 2. Strict non-destructive title merging (never replaces a valid title with null, undefined, empty string, or video ID).
 * 3. Prevention of title confusion: title is never confused with channel name, profile display name, or video ID.
 * 4. Construction of lightweight `StoredTitleRecord` lookup objects for IndexedDB and Cloudflare R2.
 * 5. Backward compatibility and recovery for legacy records with missing or placeholder titles.
 *
 * Scope: Application-wide canonical title authority.
 */

export interface StoredTitleRecord {
  provider: "dailymotion";
  kind: string;
  id: string;
  canonicalItemKey: string;
  title: string;
  sourceApiVersion?: "v1" | "v2";
  updatedAt: string;
  schemaVersion: number;
}

export const UNTITLED_VIDEO_PLACEHOLDER = "Untitled Video";

const KNOWN_PLACEHOLDERS = new Set([
  "",
  "untitled",
  "untitled video",
  "untitled dailymotion video",
  "unknown",
  "null",
  "undefined",
]);

/**
 * Checks whether a given title string is a generic or empty placeholder.
 */
export function isPlaceholderTitle(title?: string | null): boolean {
  if (!title) return true;
  const trimmed = title.trim().toLowerCase();
  return KNOWN_PLACEHOLDERS.has(trimmed);
}

/**
 * Checks whether a title is valid, non-empty, and meaningful.
 */
export function isMeaningfulTitle(title?: string | null): boolean {
  return !isPlaceholderTitle(title);
}

/**
 * Cleans and normalizes raw title text from API responses or user input.
 * Strips superfluous whitespace and HTML entities without altering legitimate Unicode titles (e.g. Arabic, French, Japanese).
 */
export function normalizeTitle(rawTitle: unknown, fallback: string = UNTITLED_VIDEO_PLACEHOLDER): string {
  if (typeof rawTitle !== "string") {
    return fallback;
  }

  const cleaned = rawTitle
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || isPlaceholderTitle(cleaned)) {
    return fallback;
  }

  return cleaned;
}

/**
 * Non-destructively merges an existing title and an incoming title:
 * - If incoming has a valid, meaningful title, it is used.
 * - If incoming has no title, null, empty string, or placeholder, the existing valid title is strictly preserved.
 * - Never replaces a useful title with null, undefined, or empty string.
 * - If both are placeholders, returns the cleanest fallback.
 */
export function mergeTitles(existingTitle?: string | null, incomingTitle?: string | null): string {
  const normIncoming = typeof incomingTitle === "string" ? incomingTitle.trim() : "";
  const normExisting = typeof existingTitle === "string" ? existingTitle.trim() : "";

  const incomingMeaningful = isMeaningfulTitle(normIncoming);
  const existingMeaningful = isMeaningfulTitle(normExisting);

  if (incomingMeaningful) {
    return normalizeTitle(normIncoming);
  }

  if (existingMeaningful) {
    return normalizeTitle(normExisting);
  }

  return UNTITLED_VIDEO_PLACEHOLDER;
}

/**
 * Constructs a lightweight `StoredTitleRecord` index/lookup object for R2 cloud storage and local IndexedDB.
 */
export function buildStoredTitleRecord(params: {
  provider?: "dailymotion";
  kind?: string;
  resourceType?: string;
  id: string;
  canonicalItemKey?: string;
  compositeKey?: string;
  title: string;
  sourceApiVersion?: "v1" | "v2";
  apiVersion?: "v1" | "v2";
  updatedAt?: string;
  schemaVersion?: number;
}): StoredTitleRecord {
  const cleanId = String(params.id || "").trim();
  const cleanKind = String(params.kind || params.resourceType || "video").trim().toLowerCase();
  const cleanTitle = normalizeTitle(params.title);
  const cleanKey = params.canonicalItemKey || params.compositeKey || `dailymotion:${cleanKind}:${cleanId}`;

  return {
    provider: params.provider ?? "dailymotion",
    kind: cleanKind,
    id: cleanId,
    canonicalItemKey: cleanKey,
    title: cleanTitle,
    sourceApiVersion: params.sourceApiVersion || params.apiVersion,
    updatedAt: params.updatedAt || new Date().toISOString(),
    schemaVersion: params.schemaVersion ?? 1,
  };
}
