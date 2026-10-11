// Shared, version-neutral discovery models.
//
// What this controls: the single UI-facing shape every v1/v2 page renders.
// Why it exists: v1 and v2 have incompatible raw schemas (unix timestamps vs
// ISO-8601, `id` vs `video_id`, flat vs nested fields). Normalizers convert
// each version's raw payload into this model, while `apiVersion` + `raw` keep
// the original version identifiable (never label v1 data as v2).
// Scope: all discovery workspaces. Future agents: extend fields here, never
// fork per-page shapes.

export type ApiVersion = "v1" | "v2";

export type DiscoveryResource =
  | "general"
  | "videos"
  | "channels"
  | "playlists"
  | "users"
  | "live";

export type DiscoveryItemKind = "video" | "channel" | "playlist" | "user" | "live";

export interface DiscoveryItem {
  kind: DiscoveryItemKind;
  apiVersion: ApiVersion;
  id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  url: string | null;
  // Video/live metadata (null when not applicable or not returned).
  duration: number | null;
  language: string | null;
  country: string | null;
  category: string | null;
  createdAt: string | null;
  year: number | null;
  tags: string[];
  ownerId: string | null;
  ownerName: string | null;
  views: number | null;
  // Resource-specific extras (videos_total, playlist size, live status...).
  extra: Record<string, string | number | boolean | null>;
  raw: unknown;
}

export type DiscoveryFailureReason =
  | "user_input_error"
  | "auth_missing"
  | "auth_expired"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "network_error"
  | "upstream_error"
  | "unsupported_operation"
  | "unknown";

export interface DiscoveryPageResult {
  items: DiscoveryItem[];
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  /** Opaque cursor for v2 `next` (null when v1 or exhausted). */
  nextCursor: string | null;
  /** True when the endpoint caps the accessible window (1000-result cap). */
  capped: boolean;
  apiVersion: ApiVersion;
  resource: DiscoveryResource;
  endpoint: string;
}

export interface DiscoveryFailure {
  ok: false;
  error: string;
  reason: DiscoveryFailureReason;
  status: number;
  apiVersion: ApiVersion;
  resource: DiscoveryResource;
  endpoint: string;
  /** Required scopes / missing env hint for auth failures. */
  remedy: string | null;
  retryable: boolean;
}

export type DiscoveryOutcome = { ok: true; result: DiscoveryPageResult } | DiscoveryFailure;

/** Merge pages, dedupe by version+kind+id, preserve first-seen order. */
export function mergeDiscoveryItems(existing: DiscoveryItem[], incoming: DiscoveryItem[]): DiscoveryItem[] {
  const seen = new Set(existing.map((item) => `${item.apiVersion}:${item.kind}:${item.id}`));
  const merged = [...existing];
  for (const item of incoming) {
    const key = `${item.apiVersion}:${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}
