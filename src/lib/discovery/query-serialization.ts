// Version-specific query builders (pure functions — no fetch, no env).
//
// What this controls: exact parameter names/values sent to each API version.
// Why it exists: v1 and v2 use incompatible names (`limit` vs `page_size`,
// `search` vs parent-scoped listing, unix timestamps vs ISO-8601). Sharing a
// builder would leak one version's dialect into the other.
// Query-preservation rule: the primary `search` input is forwarded byte-exact
// (URL-encoding only). Never strip quotes, punctuation, accents, Arabic,
// apostrophes, or emoji. Only emptiness is checked (via trim) for validation.
// Scope: discovery API routes + tests. Future agents: add params here, not in
// route handlers.

export interface V1VideoQuery {
  search?: string;
  channel?: string;
  country?: string;
  languages?: string[];
  tags?: string;
  createdAfterUnix?: number | null;
  createdBeforeUnix?: number | null;
  longerThanMinutes?: number | null;
  shorterThanMinutes?: number | null;
  owners?: string[];
  ids?: string[];
  live?: "live" | "live_onair" | "live_offair" | "live_upcoming" | "no_live" | null;
  flags?: string[];
  explicit?: string | null;
  sort?: string;
  limit?: number;
  page?: number;
  fields?: string;
  familyFilter?: boolean | null;
  localization?: string | null;
}

export const V1_VIDEO_FIELDS =
  "id,title,description,thumbnail_720_url,thumbnail_480_url,thumbnail_360_url,thumbnail_url,duration,views_total,language,country,created_time,channel,channel.name,owner,owner.screenname,tags,url";

export const V1_USER_FIELDS = "id,username,screenname,url,description,country,language,videos_total";

export const V1_PLAYLIST_FIELDS = "id,name,description,videos_total,owner,owner.screenname,created_time,url";

export function clampLimit(limit: number, max = 100): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

export function clampPage(page: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}

/** Blank (empty/whitespace) queries are invalid; anything else is preserved. */
export function isBlankQuery(query: string | null | undefined): boolean {
  return !query || query.trim().length === 0;
}

function joinList(values: string[] | undefined): string | undefined {
  if (!values || values.length === 0) return undefined;
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(",") : undefined;
}

export function buildV1VideoParams(query: V1VideoQuery): Record<string, string> {
  const params: Record<string, string> = {};
  // search is forwarded exactly — no normalization, no stripping.
  if (query.search !== undefined && query.search !== "") params.search = query.search;
  if (query.channel) params.channel = query.channel;
  if (query.country) params.country = query.country;
  const languages = joinList(query.languages);
  if (languages) params.languages = languages;
  if (query.tags) params.tags = query.tags;
  if (query.createdAfterUnix) params.created_after = String(Math.trunc(query.createdAfterUnix));
  if (query.createdBeforeUnix) params.created_before = String(Math.trunc(query.createdBeforeUnix));
  if (query.longerThanMinutes) params.longer_than = String(query.longerThanMinutes);
  if (query.shorterThanMinutes) params.shorter_than = String(query.shorterThanMinutes);
  const owners = joinList(query.owners);
  if (owners) params.owners = owners;
  const ids = joinList(query.ids);
  if (ids) params.ids = ids;
  if (query.live && query.live !== null) params[query.live] = "1";
  for (const flag of query.flags ?? []) {
    const name = flag.trim();
    if (name) params[name] = "1";
  }
  if (query.explicit === "true" || query.explicit === "false") params.explicit = query.explicit;
  if (query.sort) params.sort = query.sort;
  params.limit = String(clampLimit(query.limit ?? 50));
  params.page = String(clampPage(query.page ?? 1));
  params.fields = query.fields || V1_VIDEO_FIELDS;
  if (query.familyFilter === false) params.family_filter = "false";
  if (query.localization) params.localization = query.localization;
  return params;
}

export interface V1UserQuery {
  search?: string;
  country?: string;
  language?: string;
  usernames?: string[];
  ids?: string[];
  flags?: string[];
  sort?: string;
  limit?: number;
  page?: number;
  fields?: string;
}

export function buildV1UserParams(query: V1UserQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.search !== undefined && query.search !== "") params.search = query.search;
  if (query.country) params.country = query.country;
  if (query.language) params.language = query.language;
  const usernames = joinList(query.usernames);
  if (usernames) params.usernames = usernames;
  const ids = joinList(query.ids);
  if (ids) params.ids = ids;
  const flags = joinList(query.flags);
  if (flags) params.flags = flags;
  if (query.sort) params.sort = query.sort;
  params.limit = String(clampLimit(query.limit ?? 50));
  params.page = String(clampPage(query.page ?? 1));
  params.fields = query.fields || V1_USER_FIELDS;
  return params;
}

export interface V1PlaylistQuery {
  owner?: string;
  ids?: string[];
  sort?: string;
  limit?: number;
  page?: number;
  fields?: string;
}

export function buildV1PlaylistParams(query: V1PlaylistQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.owner) params.owner = query.owner;
  const ids = joinList(query.ids);
  if (ids) params.ids = ids;
  if (query.sort) params.sort = query.sort;
  params.limit = String(clampLimit(query.limit ?? 50));
  params.page = String(clampPage(query.page ?? 1));
  params.fields = query.fields || V1_PLAYLIST_FIELDS;
  return params;
}

// ---------------------------------------------------------------------------
// V2 builders. V2 has NO global search: listing is always parent-scoped, with
// `page`/`page_size` pagination and ISO-8601 date filters.
// ---------------------------------------------------------------------------

export interface V2ProfileVideoQuery {
  profileId: string;
  visibility?: "public" | "private" | "password" | null;
  tags?: string | null;
  createdAfterIso?: string | null;
  createdBeforeIso?: string | null;
  isExplicit?: boolean | null;
  isForKids?: boolean | null;
  sort?: string | null;
  page?: number;
  pageSize?: number;
  fields?: string;
}

export const V2_VIDEO_FIELDS =
  "video_id,title,description,category,visibility,language,country,created_at,published_at,source.duration,tags,thumbnail.h720_url,thumbnail.h480_url,profile.profile_id,profile.name,video_url";

export const V2_PROFILE_FIELDS = "profile_id,name,display_name,description,country,created_at";

export function buildV2ProfileVideoParams(query: V2ProfileVideoQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.visibility) params.visibility = query.visibility;
  if (query.tags) params.tags = query.tags;
  if (query.createdAfterIso) params.created_after = query.createdAfterIso;
  if (query.createdBeforeIso) params.created_before = query.createdBeforeIso;
  if (query.isExplicit !== null && query.isExplicit !== undefined) params.is_explicit = String(query.isExplicit);
  if (query.isForKids !== null && query.isForKids !== undefined) params.is_for_kids = String(query.isForKids);
  if (query.sort) params.sort = query.sort;
  params.page = String(clampPage(query.page ?? 1));
  params.page_size = String(clampLimit(query.pageSize ?? 50));
  params.fields = query.fields || V2_VIDEO_FIELDS;
  return params;
}

export function toV2IsoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** v1 unix seconds → ISO-8601 (for cross-version comparison display only). */
export function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  return new Date(Math.trunc(seconds) * 1000).toISOString();
}
