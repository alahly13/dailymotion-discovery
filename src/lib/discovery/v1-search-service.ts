// DailymotionV1SearchService — typed discovery operations on Legacy API v1.
//
// What this controls: every v1 workspace operation (search, lookup, listing,
// related, playlist contents, live) with v1 param names and v1 normalization.
// Why it exists: keeps endpoint logic, pagination interpretation, and raw
// schemas version-local; routes stay thin.
// Scope: server-only. Future agents: add v1 ops here, mirror in registry.

import { v1Get, v1List } from "./v1-client";
import {
  buildV1PlaylistParams,
  buildV1UserParams,
  buildV1VideoParams,
  clampLimit,
  clampPage,
  isBlankQuery,
  type V1PlaylistQuery,
  type V1UserQuery,
  type V1VideoQuery,
} from "./query-serialization";
import {
  normalizeV1Channel,
  normalizeV1Playlist,
  normalizeV1User,
  normalizeV1Video,
  normalizeV1Videos,
  type V1RawPlaylist,
  type V1RawUser,
  type V1RawVideo,
} from "./v1-normalize";
import type { DiscoveryFailure, DiscoveryItem, DiscoveryOutcome, DiscoveryResource } from "./types";

const V1_VIDEOS_ENDPOINT = "GET /videos";
const WINDOW_CAP_ITEMS = 1000;

function failure(resource: DiscoveryResource, endpoint: string, error: string, reason: DiscoveryFailure["reason"], status: number, retryable: boolean): DiscoveryFailure {
  return { ok: false, error, reason, status, apiVersion: "v1", resource, endpoint, remedy: null, retryable };
}

function pageResult(resource: DiscoveryResource, endpoint: string, items: DiscoveryItem[], page: number, pageSize: number, total: number | null, hasMore: boolean) {
  const consumed = page * pageSize;
  return {
    ok: true as const,
    result: {
      items, page, pageSize, total, hasMore,
      nextCursor: null,
      capped: hasMore && consumed >= WINDOW_CAP_ITEMS,
      apiVersion: "v1" as const,
      resource,
      endpoint,
    },
  };
}

export interface V1SearchInput extends V1VideoQuery {
  query?: string;
}

function toVideoQuery(input: V1SearchInput): V1VideoQuery {
  return { ...input, search: input.query ?? input.search };
}

/** General + video global search: GET /videos with full filter support. */
export async function v1SearchVideos(input: V1SearchInput, resource: DiscoveryResource = "videos"): Promise<DiscoveryOutcome> {
  const query = toVideoQuery(input);
  if (query.search !== undefined && isBlankQuery(query.search)) {
    return failure(resource, V1_VIDEOS_ENDPOINT, "Enter a search query.", "user_input_error", 400, false);
  }
  const params = buildV1VideoParams({ ...query, sort: query.sort ?? (resource === "general" ? "relevance" : "recent") });
  const outcome = await v1List<V1RawVideo>("/videos", params);
  if (!outcome.ok) {
    return failure(resource, V1_VIDEOS_ENDPOINT, outcome.failure.error, outcome.failure.reason, outcome.failure.status, outcome.failure.retryable);
  }
  const { data } = outcome;
  return pageResult(
    resource, V1_VIDEOS_ENDPOINT, normalizeV1Videos(data.list ?? []),
    data.page ?? clampPage(Number(params.page)), data.limit ?? clampLimit(Number(params.limit)),
    data.total ?? null, data.has_more === true
  );
}

/** Direct video lookup: GET /video/{id}. */
export async function v1GetVideo(id: string): Promise<DiscoveryOutcome> {
  const trimmed = id.trim();
  if (!trimmed) return failure("videos", "GET /video/{id}", "Enter a video ID.", "user_input_error", 400, false);
  const outcome = await v1Get<V1RawVideo>(`/video/${encodeURIComponent(trimmed)}`);
  if (!outcome.ok) return failure("videos", "GET /video/{id}", outcome.failure.error, outcome.failure.reason, outcome.failure.status, outcome.failure.retryable);
  const item = normalizeV1Video(outcome.data);
  return pageResult("videos", "GET /video/{id}", item ? [item] : [], 1, 1, item ? 1 : 0, false);
}

/** Related videos: GET /video/{id}/related (documented connection). */
export async function v1RelatedVideos(id: string, limit = 10): Promise<DiscoveryOutcome> {
  const trimmed = id.trim();
  if (!trimmed) return failure("videos", "GET /video/{id}/related", "Enter a video ID.", "user_input_error", 400, false);
  const outcome = await v1List<V1RawVideo>(`/video/${encodeURIComponent(trimmed)}/related`, {
    limit: String(clampLimit(limit, 100)), page: "1",
    fields: "id,title,description,thumbnail_480_url,duration,views_total,created_time,channel,owner,owner.screenname,url",
  });
  if (!outcome.ok) return failure("videos", "GET /video/{id}/related", outcome.failure.error, outcome.failure.reason, outcome.failure.status, outcome.failure.retryable);
  const { data } = outcome;
  return pageResult("videos", "GET /video/{id}/related", normalizeV1Videos(data.list ?? []), 1, data.limit ?? limit, data.total ?? null, data.has_more === true);
}

export interface V1ChannelInput extends V1UserQuery {
  query?: string;
}

/** Channel/user global search: GET /users. */
export async function v1SearchChannels(input: V1ChannelInput, resource: DiscoveryResource = "channels"): Promise<DiscoveryOutcome> {
  const params = buildV1UserParams({ ...input, search: input.query ?? input.search, sort: input.sort ?? "popular" });
  const endpoint = "GET /users";
  const outcome = await v1List<V1RawUser>("/users", params);
  if (!outcome.ok) return failure(resource, endpoint, outcome.failure.error, outcome.failure.reason, outcome.failure.status, outcome.failure.retryable);
  const { data } = outcome;
  const items = (data.list ?? []).map((raw) => (resource === "channels" ? normalizeV1Channel(raw) : normalizeV1User(raw))).filter((i): i is DiscoveryItem => i !== null);
  return pageResult(resource, endpoint, items, data.page ?? clampPage(Number(params.page)), data.limit ?? clampLimit(Number(params.limit)), data.total ?? null, data.has_more === true);
}

/** Direct profile lookup: GET /user/{id}. */
export async function v1GetProfile(id: string, resource: DiscoveryResource = "channels"): Promise<DiscoveryOutcome> {
  const trimmed = id.trim();
  if (!trimmed) return failure(resource, "GET /user/{id}", "Enter a profile ID or username.", "user_input_error", 400, false);
  const outcome = await v1Get<V1RawUser>(`/user/${encodeURIComponent(trimmed)}`, {
    fields: "id,username,screenname,url,description,country,language,videos_total",
  });
  if (!outcome.ok) return failure(resource, "GET /user/{id}", outcome.failure.error, outcome.failure.reason, outcome.failure.status, outcome.failure.retryable);
  const item = resource === "channels" ? normalizeV1Channel(outcome.data) : normalizeV1User(outcome.data);
  return pageResult(resource, "GET /user/{id}", item ? [item] : [], 1, 1, item ? 1 : 0, false);
}

/** Videos owned by a profile: GET /user/{id}/videos (search-within-profile supported). */
export async function v1ProfileVideos(owner: string, input: V1SearchInput = {}): Promise<DiscoveryOutcome> {
  const trimmed = owner.trim();
  if (!trimmed) return failure("channels", "GET /user/{id}/videos", "Enter a profile ID or username.", "user_input_error", 400, false);
  const params = buildV1VideoParams({ ...toVideoQuery(input), sort: input.sort ?? "recent" });
  const endpoint = "GET /user/{id}/videos";
  const outcome = await v1List<V1RawVideo>(`/user/${encodeURIComponent(trimmed)}/videos`, params);
  if (!outcome.ok) return failure("channels", endpoint, outcome.failure.error, outcome.failure.reason, outcome.failure.status, outcome.failure.retryable);
  const { data } = outcome;
  return pageResult("channels", endpoint, normalizeV1Videos(data.list ?? []), data.page ?? clampPage(Number(params.page)), data.limit ?? clampLimit(Number(params.limit)), data.total ?? null, data.has_more === true);
}

export interface V1PlaylistInput extends V1PlaylistQuery {
  owner?: string;
}

/** Owner-scoped playlist listing: GET /user/{owner}/playlists (public alternative to gated global search). */
export async function v1OwnerPlaylists(input: V1PlaylistInput): Promise<DiscoveryOutcome> {
  const owner = (input.owner ?? "").trim();
  if (!owner) return failure("playlists", "GET /user/{id}/playlists", "Enter an owner profile ID or username.", "user_input_error", 400, false);
  const params = buildV1PlaylistParams(input);
  const endpoint = "GET /user/{id}/playlists";
  const outcome = await v1List<V1RawPlaylist>(`/user/${encodeURIComponent(owner)}/playlists`, params);
  if (!outcome.ok) return failure("playlists", endpoint, outcome.failure.error, outcome.failure.reason, outcome.failure.status, outcome.failure.retryable);
  const { data } = outcome;
  const items = (data.list ?? []).map(normalizeV1Playlist).filter((i): i is DiscoveryItem => i !== null);
  return pageResult("playlists", endpoint, items, data.page ?? clampPage(Number(params.page)), data.limit ?? clampLimit(Number(params.limit)), data.total ?? null, data.has_more === true);
}

/** Direct playlist lookup: GET /playlist/{id}. */
export async function v1GetPlaylist(id: string): Promise<DiscoveryOutcome> {
  const trimmed = id.trim();
  if (!trimmed) return failure("playlists", "GET /playlist/{id}", "Enter a playlist ID.", "user_input_error", 400, false);
  const outcome = await v1Get<V1RawPlaylist>(`/playlist/${encodeURIComponent(trimmed)}`, {
    fields: "id,name,description,videos_total,owner,owner.screenname,created_time,url",
  });
  if (!outcome.ok) return failure("playlists", "GET /playlist/{id}", outcome.failure.error, outcome.failure.reason, outcome.failure.status, outcome.failure.retryable);
  const item = normalizeV1Playlist(outcome.data);
  return pageResult("playlists", "GET /playlist/{id}", item ? [item] : [], 1, 1, item ? 1 : 0, false);
}

/** Playlist contents: GET /playlist/{id}/videos. */
export async function v1PlaylistVideos(id: string, page = 1, limit = 50): Promise<DiscoveryOutcome> {
  const trimmed = id.trim();
  if (!trimmed) return failure("playlists", "GET /playlist/{id}/videos", "Enter a playlist ID.", "user_input_error", 400, false);
  const endpoint = "GET /playlist/{id}/videos";
  const outcome = await v1List<V1RawVideo>(`/playlist/${encodeURIComponent(trimmed)}/videos`, {
    page: String(clampPage(page)), limit: String(clampLimit(limit)),
    fields: "id,title,description,thumbnail_480_url,duration,views_total,created_time,channel,owner,owner.screenname,url",
  });
  if (!outcome.ok) return failure("playlists", endpoint, outcome.failure.error, outcome.failure.reason, outcome.failure.status, outcome.failure.retryable);
  const { data } = outcome;
  return pageResult("playlists", endpoint, normalizeV1Videos(data.list ?? []), data.page ?? clampPage(page), data.limit ?? clampLimit(limit), data.total ?? null, data.has_more === true);
}

/** Live discovery: GET /videos with mode/live flags. */
export async function v1SearchLive(input: V1SearchInput & { live?: V1VideoQuery["live"] }): Promise<DiscoveryOutcome> {
  return v1SearchVideos({ ...input, live: input.live ?? "live_onair", sort: input.sort ?? "live-audience" }, "live");
}
