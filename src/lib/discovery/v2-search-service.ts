// DailymotionV2SearchService — typed discovery operations on API v2.
//
// What this controls: every v2 workspace operation (profile-scoped listings,
// direct lookups, /me bootstrap) with v2 param names and v2 normalization.
// Why it exists: v2 has no global search; all listings are parent-scoped and
// auth-gated. This service keeps that truth local to v2.
// Scope: server-only. All reads here are mock-verified (no credentials
// supplied by the operator); each failure carries an actionable remedy.

import { credentialHint } from "./auth";
import { v2Get, v2List } from "./v2-client";
import {
  buildV2ProfileVideoParams,
  clampLimit,
  clampPage,
  V2_PROFILE_FIELDS,
  V2_VIDEO_FIELDS,
  type V2ProfileVideoQuery,
} from "./query-serialization";
import {
  normalizeV2Livestream,
  normalizeV2Playlist,
  normalizeV2Profile,
  normalizeV2Video,
  normalizeV2Videos,
  type V2RawLivestream,
  type V2RawPlaylist,
  type V2RawProfile,
  type V2RawUser,
  type V2RawVideo,
} from "./v2-normalize";
import type { DiscoveryFailure, DiscoveryItem, DiscoveryOutcome, DiscoveryResource } from "./types";

const WINDOW_CAP_ITEMS = 1000;

function withRemedy(failure: { error: string; reason: DiscoveryFailure["reason"]; status: number; retryable: boolean; code: string | null }, resource: DiscoveryResource, endpoint: string): DiscoveryFailure {
  let remedy: string | null = null;
  if (failure.reason === "auth_missing") remedy = credentialHint("v2");
  else if (failure.reason === "auth_expired") remedy = "The 30-minute v2 token expired. Retry — a fresh token is issued automatically.";
  else if (failure.reason === "forbidden") remedy = "The token lacks the required read scope (video.read / profile.read / playlist.read / live.read / account.read). Update the private API key permissions in Dailymotion Studio.";
  return { ok: false, error: failure.error, reason: failure.reason, status: failure.status, apiVersion: "v2", resource, endpoint, remedy, retryable: failure.retryable };
}

function collectionResult(resource: DiscoveryResource, endpoint: string, items: DiscoveryItem[], page: number, pageSize: number, total: number | null, next: string | null) {
  const hasMore = next !== null;
  return {
    ok: true as const,
    result: {
      items, page, pageSize, total, hasMore, nextCursor: next,
      capped: hasMore && page * pageSize >= WINDOW_CAP_ITEMS,
      apiVersion: "v2" as const, resource, endpoint,
    },
  };
}

function requireProfileId(profileId: string, resource: DiscoveryResource, endpoint: string): DiscoveryFailure | null {
  if (profileId.trim()) return null;
  return { ok: false, error: "Enter a profile ID. (v2 has no global search — listing is profile-scoped.)", reason: "user_input_error", status: 400, apiVersion: "v2", resource, endpoint, remedy: "Collect profile IDs via GET /v2/me once authenticated.", retryable: false };
}

/** Profile video listing: GET /profiles/{id}/videos. */
export async function v2ProfileVideos(profileId: string, input: Omit<V2ProfileVideoQuery, "profileId"> = {}, resource: DiscoveryResource = "videos"): Promise<DiscoveryOutcome> {
  const endpoint = "GET /profiles/{profile_id}/videos";
  const missing = requireProfileId(profileId, resource, endpoint);
  if (missing) return missing;
  const params = buildV2ProfileVideoParams({ ...input, profileId: profileId.trim() });
  const outcome = await v2List<V2RawVideo>(`/profiles/${encodeURIComponent(profileId.trim())}/videos`, params);
  if (!outcome.ok) return withRemedy(outcome.failure, resource, endpoint);
  const pagination = outcome.data.pagination ?? {};
  const page = pagination.page ?? clampPage(Number(params.page));
  const pageSize = pagination.page_size ?? clampLimit(Number(params.page_size));
  return collectionResult(resource, endpoint, normalizeV2Videos(outcome.data.data ?? []), page, pageSize, pagination.total ?? null, pagination.next ?? null);
}

/** Direct video lookup: GET /videos/{id}. */
export async function v2GetVideo(id: string): Promise<DiscoveryOutcome> {
  const endpoint = "GET /videos/{id}";
  if (!id.trim()) return { ok: false, error: "Enter a video ID.", reason: "user_input_error", status: 400, apiVersion: "v2", resource: "videos", endpoint, remedy: null, retryable: false };
  const outcome = await v2Get<V2RawVideo>(`/videos/${encodeURIComponent(id.trim())}`, { fields: V2_VIDEO_FIELDS });
  if (!outcome.ok) return withRemedy(outcome.failure, "videos", endpoint);
  const item = normalizeV2Video(outcome.data);
  return { ok: true, result: { items: item ? [item] : [], page: 1, pageSize: 1, total: item ? 1 : 0, hasMore: false, nextCursor: null, capped: false, apiVersion: "v2", resource: "videos", endpoint } };
}

/** Direct profile lookup: GET /profiles/{id}. */
export async function v2GetProfile(id: string, resource: DiscoveryResource = "channels"): Promise<DiscoveryOutcome> {
  const endpoint = "GET /profiles/{profile_id}";
  if (!id.trim()) return { ok: false, error: "Enter a profile ID.", reason: "user_input_error", status: 400, apiVersion: "v2", resource, endpoint, remedy: "Collect profile IDs via GET /v2/me once authenticated.", retryable: false };
  const outcome = await v2Get<V2RawProfile>(`/profiles/${encodeURIComponent(id.trim())}`, { fields: V2_PROFILE_FIELDS });
  if (!outcome.ok) return withRemedy(outcome.failure, resource, endpoint);
  const item = normalizeV2Profile(outcome.data, resource === "users" ? "user" : "channel");
  return { ok: true, result: { items: item ? [item] : [], page: 1, pageSize: 1, total: item ? 1 : 0, hasMore: false, nextCursor: null, capped: false, apiVersion: "v2", resource, endpoint } };
}

/** Authenticated identity bootstrap: GET /me. */
export async function v2Me(): Promise<{ ok: true; data: unknown } | { ok: false; failure: DiscoveryFailure }> {
  const endpoint = "GET /me";
  const outcome = await v2Get<unknown>("/me");
  if (!outcome.ok) return { ok: false, failure: withRemedy(outcome.failure, "channels", endpoint) };
  return { ok: true, data: outcome.data };
}

/** Direct user lookup: GET /users/{id}. */
export async function v2GetUser(id: string): Promise<DiscoveryOutcome> {
  const endpoint = "GET /users/{user_id}";
  if (!id.trim()) return { ok: false, error: "Enter a user ID.", reason: "user_input_error", status: 400, apiVersion: "v2", resource: "users", endpoint, remedy: null, retryable: false };
  const outcome = await v2Get<V2RawUser>(`/users/${encodeURIComponent(id.trim())}`);
  if (!outcome.ok) return withRemedy(outcome.failure, "users", endpoint);
  const raw = outcome.data as V2RawUser;
  const idValue = raw.user_id ?? id.trim();
  const item: DiscoveryItem = {
    kind: "user", apiVersion: "v2", id: idValue, title: raw.username ?? idValue, description: null,
    thumbnail: null, url: null, duration: null, language: null, country: null, category: null,
    createdAt: null, year: null, tags: [], ownerId: idValue, ownerName: raw.username ?? null,
    views: null, extra: {}, raw,
  };
  return { ok: true, result: { items: [item], page: 1, pageSize: 1, total: 1, hasMore: false, nextCursor: null, capped: false, apiVersion: "v2", resource: "users", endpoint } };
}

/** Profile playlist listing: GET /profiles/{id}/playlists. */
export async function v2ProfilePlaylists(profileId: string, page = 1, pageSize = 50): Promise<DiscoveryOutcome> {
  const endpoint = "GET /profiles/{profile_id}/playlists";
  const missing = requireProfileId(profileId, "playlists", endpoint);
  if (missing) return missing;
  const outcome = await v2List<V2RawPlaylist>(`/profiles/${encodeURIComponent(profileId.trim())}/playlists`, {
    page: String(clampPage(page)), page_size: String(clampLimit(pageSize)), fields: "playlist_id,title,description,created_at",
  });
  if (!outcome.ok) return withRemedy(outcome.failure, "playlists", endpoint);
  const pagination = outcome.data.pagination ?? {};
  const items = (outcome.data.data ?? []).map(normalizeV2Playlist).filter((i): i is DiscoveryItem => i !== null);
  return collectionResult("playlists", endpoint, items, pagination.page ?? clampPage(page), pagination.page_size ?? clampLimit(pageSize), pagination.total ?? null, pagination.next ?? null);
}

/** Direct playlist lookup: GET /playlists/{id}. */
export async function v2GetPlaylist(id: string): Promise<DiscoveryOutcome> {
  const endpoint = "GET /playlists/{playlist_id}";
  if (!id.trim()) return { ok: false, error: "Enter a playlist ID.", reason: "user_input_error", status: 400, apiVersion: "v2", resource: "playlists", endpoint, remedy: null, retryable: false };
  const outcome = await v2Get<V2RawPlaylist>(`/playlists/${encodeURIComponent(id.trim())}`, { fields: "playlist_id,title,description,created_at" });
  if (!outcome.ok) return withRemedy(outcome.failure, "playlists", endpoint);
  const item = normalizeV2Playlist(outcome.data);
  return { ok: true, result: { items: item ? [item] : [], page: 1, pageSize: 1, total: item ? 1 : 0, hasMore: false, nextCursor: null, capped: false, apiVersion: "v2", resource: "playlists", endpoint } };
}

/** Playlist contents: GET /playlists/{id}/videos. */
export async function v2PlaylistVideos(id: string, page = 1, pageSize = 50): Promise<DiscoveryOutcome> {
  const endpoint = "GET /playlists/{playlist_id}/videos";
  if (!id.trim()) return { ok: false, error: "Enter a playlist ID.", reason: "user_input_error", status: 400, apiVersion: "v2", resource: "playlists", endpoint, remedy: null, retryable: false };
  const outcome = await v2List<V2RawVideo>(`/playlists/${encodeURIComponent(id.trim())}/videos`, {
    page: String(clampPage(page)), page_size: String(clampLimit(pageSize)), fields: V2_VIDEO_FIELDS,
  });
  if (!outcome.ok) return withRemedy(outcome.failure, "playlists", endpoint);
  const pagination = outcome.data.pagination ?? {};
  return collectionResult("playlists", endpoint, normalizeV2Videos(outcome.data.data ?? []), pagination.page ?? clampPage(page), pagination.page_size ?? clampLimit(pageSize), pagination.total ?? null, pagination.next ?? null);
}

export interface V2LivestreamQuery {
  status?: string | null;
  visibility?: string | null;
  createdAfterIso?: string | null;
  createdBeforeIso?: string | null;
  tags?: string | null;
  page?: number;
  pageSize?: number;
}

/** Profile livestream listing: GET /profiles/{id}/livestreams. */
export async function v2ProfileLivestreams(profileId: string, input: V2LivestreamQuery = {}): Promise<DiscoveryOutcome> {
  const endpoint = "GET /profiles/{profile_id}/livestreams";
  const missing = requireProfileId(profileId, "live", endpoint);
  if (missing) return missing;
  const params: Record<string, string> = {
    page: String(clampPage(input.page ?? 1)),
    page_size: String(clampLimit(input.pageSize ?? 50)),
    fields: "livestream_id,title,description,category,status,visibility,created_at,profile.profile_id,profile.name",
  };
  if (input.status) params.status = input.status;
  if (input.visibility) params.visibility = input.visibility;
  if (input.createdAfterIso) params.created_after = input.createdAfterIso;
  if (input.createdBeforeIso) params.created_before = input.createdBeforeIso;
  if (input.tags) params.tags = input.tags;
  const outcome = await v2List<V2RawLivestream>(`/profiles/${encodeURIComponent(profileId.trim())}/livestreams`, params);
  if (!outcome.ok) return withRemedy(outcome.failure, "live", endpoint);
  const pagination = outcome.data.pagination ?? {};
  const items = (outcome.data.data ?? []).map(normalizeV2Livestream).filter((i): i is DiscoveryItem => i !== null);
  return collectionResult("live", endpoint, items, pagination.page ?? clampPage(input.page ?? 1), pagination.page_size ?? clampLimit(input.pageSize ?? 50), pagination.total ?? null, pagination.next ?? null);
}

/** Direct livestream lookup: GET /livestreams/{id}. */
export async function v2GetLivestream(id: string): Promise<DiscoveryOutcome> {
  const endpoint = "GET /livestreams/{livestream_id}";
  if (!id.trim()) return { ok: false, error: "Enter a livestream ID.", reason: "user_input_error", status: 400, apiVersion: "v2", resource: "live", endpoint, remedy: null, retryable: false };
  const outcome = await v2Get<V2RawLivestream>(`/livestreams/${encodeURIComponent(id.trim())}`);
  if (!outcome.ok) return withRemedy(outcome.failure, "live", endpoint);
  const item = normalizeV2Livestream(outcome.data);
  return { ok: true, result: { items: item ? [item] : [], page: 1, pageSize: 1, total: item ? 1 : 0, hasMore: false, nextCursor: null, capped: false, apiVersion: "v2", resource: "live", endpoint } };
}
