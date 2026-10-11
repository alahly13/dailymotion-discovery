// DailymotionV1Normalizer — legacy raw payloads → version-neutral items.
//
// What this controls: interpretation of v1 field names (`id`, `created_time`
// unix seconds, `channel` category, `owner.screenname`, `videos_total`).
// Why it exists: v1 and v2 schemas are incompatible; each normalizer owns one
// dialect and stamps `apiVersion: "v1"` so UI can never mislabel provenance.
// Scope: v1 workspaces. Future agents: keep v1-only quirks here.

import { zeroSafeNumber } from "@/lib/utils/zero-safe-number";
import type { DiscoveryItem, DiscoveryItemKind } from "./types";

export interface V1RawVideo {
  id?: string;
  title?: string | null;
  description?: string | null;
  thumbnail_720_url?: string | null;
  thumbnail_480_url?: string | null;
  thumbnail_360_url?: string | null;
  thumbnail_url?: string | null;
  duration?: number | string | null;
  views_total?: number | string | null;
  language?: string | null;
  country?: string | null;
  created_time?: number | string | null;
  channel?: string | null;
  "channel.name"?: string | null;
  owner?: string | null;
  "owner.screenname"?: string | null;
  tags?: string[] | string | null;
  url?: string | null;
  mode?: string | null;
}

export interface V1RawUser {
  id?: string;
  username?: string | null;
  screenname?: string | null;
  url?: string | null;
  description?: string | null;
  country?: string | null;
  language?: string | null;
  videos_total?: number | string | null;
  avatar_360_url?: string | null;
}

export interface V1RawPlaylist {
  id?: string;
  name?: string | null;
  description?: string | null;
  videos_total?: number | string | null;
  owner?: string | null;
  "owner.screenname"?: string | null;
  created_time?: number | string | null;
  url?: string | null;
}

function unixToIso(value: number | string | null | undefined): string | null {
  const seconds = zeroSafeNumber(value);
  if (seconds === null) return null;
  return new Date(seconds * 1000).toISOString();
}

function parseTags(tags: string[] | string | null | undefined): string[] {
  if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === "string" && t.length > 0);
  if (typeof tags === "string" && tags.trim()) return tags.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  const year = new Date(iso).getUTCFullYear();
  return Number.isNaN(year) ? null : year;
}

function base(kind: DiscoveryItemKind, id: string, raw: unknown): Omit<DiscoveryItem, "title" | "description"> {
  return {
    kind,
    apiVersion: "v1",
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

export function normalizeV1Video(raw: V1RawVideo): DiscoveryItem | null {
  if (!raw.id) return null;
  const createdAt = unixToIso(raw.created_time);
  const thumbnail =
    raw.thumbnail_720_url ?? raw.thumbnail_480_url ?? raw.thumbnail_360_url ?? raw.thumbnail_url ?? null;
  return {
    ...base("video", raw.id, raw),
    title: raw.title ?? "Untitled Dailymotion video",
    description: raw.description ?? null,
    thumbnail,
    url: raw.url ?? `https://www.dailymotion.com/video/${raw.id}`,
    duration: zeroSafeNumber(raw.duration),
    language: raw.language ?? null,
    country: raw.country ?? null,
    category: raw.channel ?? null,
    createdAt,
    year: yearOf(createdAt),
    tags: parseTags(raw.tags),
    ownerId: raw.owner ?? null,
    ownerName: raw["owner.screenname"] ?? raw.owner ?? null,
    views: zeroSafeNumber(raw.views_total),
    extra: { channelName: raw["channel.name"] ?? raw.channel ?? null, mode: raw.mode ?? null },
  };
}

export function normalizeV1User(raw: V1RawUser): DiscoveryItem | null {
  if (!raw.id) return null;
  return {
    ...base("user", raw.id, raw),
    title: raw.screenname ?? raw.username ?? raw.id,
    description: raw.description ?? null,
    thumbnail: raw.avatar_360_url ?? null,
    url: raw.url ?? `https://www.dailymotion.com/user/${raw.username ?? raw.id}`,
    language: raw.language ?? null,
    country: raw.country ?? null,
    ownerId: raw.id,
    ownerName: raw.screenname ?? raw.username ?? null,
    extra: { username: raw.username ?? null, videosTotal: zeroSafeNumber(raw.videos_total) },
  };
}

/** Channels in v1 are users; kind reflects the workspace that requested it. */
export function normalizeV1Channel(raw: V1RawUser): DiscoveryItem | null {
  const item = normalizeV1User(raw);
  if (!item) return null;
  return { ...item, kind: "channel" };
}

export function normalizeV1Playlist(raw: V1RawPlaylist): DiscoveryItem | null {
  if (!raw.id) return null;
  const createdAt = unixToIso(raw.created_time);
  return {
    ...base("playlist", raw.id, raw),
    title: raw.name ?? raw.id,
    description: raw.description ?? null,
    url: raw.url ?? `https://www.dailymotion.com/playlist/${raw.id}`,
    createdAt,
    year: yearOf(createdAt),
    ownerId: raw.owner ?? null,
    ownerName: raw["owner.screenname"] ?? raw.owner ?? null,
    extra: { videosTotal: zeroSafeNumber(raw.videos_total) },
  };
}

export function normalizeV1Videos(list: V1RawVideo[]): DiscoveryItem[] {
  return dedupe(list.map(normalizeV1Video));
}

function dedupe(items: (DiscoveryItem | null)[]): DiscoveryItem[] {
  const seen = new Set<string>();
  const out: DiscoveryItem[] = [];
  for (const item of items) {
    if (!item) continue;
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
