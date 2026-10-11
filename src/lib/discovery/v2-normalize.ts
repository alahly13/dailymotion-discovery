// DailymotionV2Normalizer — v2 raw payloads → version-neutral items.
//
// What this controls: interpretation of v2 field names (`video_id`,
// `created_at` ISO-8601, `category`, nested `profile.*`, `source.duration`,
// nested `thumbnail.h*_url`, `visibility`).
// Why it exists: v2 schema is incompatible with v1; stamps `apiVersion: "v2"`.
// Scope: v2 workspaces. Future agents: keep v2-only quirks here.

import type { DiscoveryItem, DiscoveryItemKind } from "./types";

export interface V2RawVideo {
  video_id?: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  visibility?: string | null;
  language?: string | null;
  country?: string | null;
  created_at?: string | null;
  published_at?: string | null;
  tags?: string[] | null;
  video_url?: string | null;
  source?: { duration?: number | null } | null;
  profile?: { profile_id?: string | null; name?: string | null; display_name?: string | null } | null;
  thumbnail?: { h1080_url?: string | null; h720_url?: string | null; h480_url?: string | null } | null;
}

export interface V2RawProfile {
  profile_id?: string;
  name?: string | null;
  display_name?: string | null;
  description?: string | null;
  country?: string | null;
  created_at?: string | null;
}

export interface V2RawUser {
  user_id?: string;
  username?: string | null;
  email?: string | null;
}

export interface V2RawPlaylist {
  playlist_id?: string;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  videos_total?: number | null;
  created_at?: string | null;
}

export interface V2RawLivestream {
  livestream_id?: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  status?: string | null;
  visibility?: string | null;
  created_at?: string | null;
  profile?: { profile_id?: string | null; name?: string | null } | null;
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  const year = new Date(iso).getUTCFullYear();
  return Number.isNaN(year) ? null : year;
}

function base(kind: DiscoveryItemKind, id: string, raw: unknown): Omit<DiscoveryItem, "title" | "description"> {
  return {
    kind,
    apiVersion: "v2",
    id,
    thumbnail: null,
    url: null,
    duration: null,
    language: null,
    country: null,
    category: null,
    createdAt: null,
    year: null,
    tags: [],
    ownerId: null,
    ownerName: null,
    views: null,
    extra: {},
    raw,
  };
}

export function normalizeV2Video(raw: V2RawVideo): DiscoveryItem | null {
  if (!raw.video_id) return null;
  const createdAt = validIso(raw.created_at);
  const thumbnail = raw.thumbnail?.h720_url ?? raw.thumbnail?.h480_url ?? raw.thumbnail?.h1080_url ?? null;
  return {
    ...base("video", raw.video_id, raw),
    title: raw.title ?? "Untitled Dailymotion video",
    description: raw.description ?? null,
    thumbnail,
    url: raw.video_url ?? `https://www.dailymotion.com/video/${raw.video_id}`,
    duration: typeof raw.source?.duration === "number" ? raw.source.duration : null,
    language: raw.language ?? null,
    country: raw.country ?? null,
    category: raw.category ?? null,
    createdAt,
    year: yearOf(createdAt),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string" && t.length > 0) : [],
    ownerId: raw.profile?.profile_id ?? null,
    ownerName: raw.profile?.display_name ?? raw.profile?.name ?? null,
    extra: { visibility: raw.visibility ?? null, publishedAt: validIso(raw.published_at) },
  };
}

export function normalizeV2Profile(raw: V2RawProfile, kind: DiscoveryItemKind = "channel"): DiscoveryItem | null {
  if (!raw.profile_id) return null;
  const createdAt = validIso(raw.created_at);
  return {
    ...base(kind, raw.profile_id, raw),
    title: raw.display_name ?? raw.name ?? raw.profile_id,
    description: raw.description ?? null,
    url: `https://www.dailymotion.com/user/${raw.name ?? raw.profile_id}`,
    country: raw.country ?? null,
    createdAt,
    year: yearOf(createdAt),
    ownerId: raw.profile_id,
    ownerName: raw.display_name ?? raw.name ?? null,
    extra: { profileName: raw.name ?? null },
  };
}

export function normalizeV2Playlist(raw: V2RawPlaylist): DiscoveryItem | null {
  if (!raw.playlist_id) return null;
  const createdAt = validIso(raw.created_at);
  return {
    ...base("playlist", raw.playlist_id, raw),
    title: raw.title ?? raw.name ?? raw.playlist_id,
    description: raw.description ?? null,
    url: `https://www.dailymotion.com/playlist/${raw.playlist_id}`,
    createdAt,
    year: yearOf(createdAt),
    extra: { videosTotal: typeof raw.videos_total === "number" ? raw.videos_total : null },
  };
}

export function normalizeV2Livestream(raw: V2RawLivestream): DiscoveryItem | null {
  if (!raw.livestream_id) return null;
  const createdAt = validIso(raw.created_at);
  return {
    ...base("live", raw.livestream_id, raw),
    title: raw.title ?? raw.livestream_id,
    description: raw.description ?? null,
    category: raw.category ?? null,
    createdAt,
    year: yearOf(createdAt),
    ownerId: raw.profile?.profile_id ?? null,
    ownerName: raw.profile?.name ?? null,
    extra: { status: raw.status ?? null, visibility: raw.visibility ?? null },
  };
}

export function normalizeV2Videos(list: V2RawVideo[]): DiscoveryItem[] {
  const seen = new Set<string>();
  const out: DiscoveryItem[] = [];
  for (const raw of list) {
    const item = normalizeV2Video(raw);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
