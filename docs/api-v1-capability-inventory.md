# Dailymotion Legacy API v1 — Capability Inventory

> Audit date: 2026-10-10. Sources are the official v1 docs at
> `https://developers.dailymotion.com/v0/...`. Each section links the exact
> reference page inspected. Status legend at the bottom distinguishes
> **documented** vs **live-verified** vs **mock-only** vs **needs-credentials**.

Base URLs (documented, migration guide + reference servers):

- Authenticated / server-side: `https://partner.api.dailymotion.com/rest`
- Public / client-side: `https://api.dailymotion.com`
- This app's v1 profile defaults to the Partner host
  (`DAILYMOTION_API_BASE_URL_V1`). Anonymous public discovery automatically
  uses the documented public host (same version — never a v2 fallback).

Partner-host auth rule (live-verified 2026-10-11): anonymous calls to the
Partner host return HTTP 401 `invalid_token`. Every Partner call needs
`Authorization: Bearer <token>`.

Token endpoint: `POST https://partner.api.dailymotion.com/oauth/v1/token`
(form-encoded `grant_type=client_credentials&client_id&client_secret&scope`).
`scope` is REQUIRED (live-verified: omitted scope → HTTP 422
"scope field required"). Documented Platform scopes: `manage_videos`,
`manage_players`, `manage_playlists`, `manage_subtitles`, `email`,
`userinfo`. This app defaults to `DAILYMOTION_API_SCOPE_V1=userinfo`
(least privilege for discovery).

Docs index inspected: `https://developers.dailymotion.com/v0/reference`
(full endpoint catalogue) and `https://developers.dailymotion.com/v0/docs`
(guide catalogue).

## 1. Authentication (inspected)

Guide: `https://developers.dailymotion.com/v0/docs/authenticate.md`
Reference: `https://developers.dailymotion.com/v0/reference/authentication-api.md`,
`.../api-scopes.md`

- Two key types: **Public API key** (client-side flows) and **Private API key**
  (server-side, secret shown once). Created in Dailymotion Studio by an
  Owner/Admin under Organization → API keys.
- OAuth2 grants: `client_credentials`, `password` (username+password),
  `authorization_code` (+ refresh tokens for password/authorization_code).
- Legacy token endpoints: `https://api.dailymotion.com/oauth/token` and
  `https://partner.api.dailymotion.com/oauth/v1/token`.
- Access token lifetime: `expires_in` ≈ 10 hours (36000s); refresh_token
  available for password/authorization_code grants only.
- **Public metadata discovery works without any key** (live-verified below).
  Private/authenticated content (`private=true`, `private_id`, partner hosts)
  requires a token with the right scopes.
- Endpoint/key compatibility matrix lives in the authentication-api reference
  (inspected at index level; per-endpoint key requirements recorded below from
  the reference + live probes).

## 2. Global search — videos (inspected + live-verified)

Reference: `https://developers.dailymotion.com/v0/reference/api-list-videos.md`
(OpenAPI for `GET /videos`, server `https://api.dailymotion.com`, no security).

- Endpoint: `GET https://api.dailymotion.com/videos` — public, unauthenticated.
- Live-verified 2026-10-10: `?search=news&limit=2` returned HTTP 200,
  `{page:1, limit:2, total:1000, has_more:true, list:[...]}`.
- Unicode preserved live: Arabic query `العربية` (URL-encoded UTF-8) returned
  Arabic titles correctly.
- Query param: `search` (full-text, max length 150). Exact input is preserved;
  the API does its own tokenization.
- `sort=relevance` is only valid together with `search` (documented).

## 3. Video filters (inspected in full)

Reference: `https://developers.dailymotion.com/v0/reference/video-filters.md`
(all ~50 filters read). Server-side filters implemented by the app:

| Param | Type | Notes |
|---|---|---|
| `search` | string(1–150) | full-text search |
| `channel` | category slug | `news,sport,music,...` (see video-categories ref) |
| `country` | string | declarative country code |
| `languages` | array | e.g. `fr,en` |
| `tags` | string | tag full-text, AND by default, `()` for OR |
| `created_after` / `created_before` | unix timestamp (s) | date-window partitioning |
| `timeframe` | seconds | last-N-seconds shortcut |
| `longer_than` / `shorter_than` | minutes | duration bounds |
| `owners` | array | user ids/logins — profile-scoped listing |
| `ids` / `exclude_ids` | array | xIDs only |
| `live`,`live_onair`,`live_offair`,`live_upcoming`,`no_live`,`no_live_recording` | flags | live discovery (live-verified: `live_onair=1` + search returned on-air lives) |
| `featured`,`hd`,`verified`,`partner`,`ugc`,`ugc_partner` | flags | content-source filters |
| `explicit`,`is_created_for_kids` | boolean | sensitivity filters |
| `private`,`unpublished`,`password_protected`,`premium`,`no_premium` | mixed | mostly need auth/partner host |
| `sort` | enum | `recent,visited,visited-hour,visited-today,visited-week,visited-month,relevance,random,trending,old,live-audience,least-visited,live-airing-time,id-asc` |
| `list` | `what-to-watch\|recommended` | curated list; **cannot combine with `search`** (documented); live-verified `list=what-to-watch` returns results publicly |
| `limit` | ≤100 | page size |
| `page` | number | **max 10 when `limit=100`**; advance while `has_more=true` |

## 4. Video object (inspected at index level + live-verified fields)

References: `.../video-fields.md` (index-listed, full field table not
re-read here), `.../api-get-video-.md`.

- `GET /video/{id}` — public. Live-verified: `id,title,created_time,channel,
  language,duration` returned for `x5auisp`.
- `GET /video/{id}/related`, `/recordings`, `/subtitles` connections —
  documented in `.../video-connections.md` (inspected in full). Related-video
  browsing is implemented as a supported alternative workflow.
- App requests explicit `fields=` (sparse selection, comma-separated,
  dotted sub-fields like `owner.screenname`, `channel.name`).

## 5. Users / channels / profiles (inspected + live-verified)

References: `.../user-filters.md` (inspected in full),
`.../api-retrieve-user-information.md`, `.../api-list-users.md`,
`.../user-connections.md` (index-listed).

- There is **no separate "channel" object** in v1. Channels = users/profiles;
  the `channel` video param is the *category* taxonomy.
- `GET /users?search=...` — public global user search. Live-verified
  (`search=dailymotion` → users with `id,username,screenname`).
- `GET /user/{id|username}` — public lookup. Live-verified incl. `videos_total`.
- `GET /user/{id}/videos` — public profile-scoped listing, full video-filter
  support (search-within-profile, dates, sort, pagination). Live-verified
  (2/2 videos, `has_more:false`).
- `GET /user/{id}/playlists` — public. Live-verified (`lequipe` → 11 total,
  2 listed with `id,name,videos_total`).
- User filters: `country, language, ids, exclude_ids, usernames, parent,
  mostpopular, recommended, recommendedforchannel, partner, verified`,
  `sort ∈ {recent,relevance,popular,activity}`, `limit ≤ 100`, same `page` cap.

## 6. Playlists (inspected + live-verified with limitation)

References: `.../playlist-filters.md` (inspected in full),
`.../api-get-playlist-information.md`,
`.../api-list-videos-connected-to-a-playlist.md`,
`.../playlist-connections.md` (index-listed).

- `GET /playlists?search=...` — **requires authentication**. Live-verified:
  anonymous request returns HTTP 403
  `{"code":403,"message":"Only authenticated users can use this filter."}`.
  The app therefore does NOT offer anonymous global playlist search; it offers
  the documented alternative (owner-scoped listing + direct lookup).
- `GET /playlist/{id}` — public direct lookup (a stale id live-returned 404
  `object_not_found`, proving the path is public and errors are honest).
- `GET /playlist/{id}/videos` — public. Live-verified (`x88apm` → 40 total,
  video entries returned).
- `GET /user/{id}/playlists` — public owner-scoped listing (see §5).
- Playlist filters: `search (auth), owner, ids, private (auth), verified`,
  `sort ∈ {recent,relevance,alpha,most,least,alphaaz,alphaza,changed}`,
  `limit ≤ 100`, same `page` cap.

## 7. Live content (inspected + live-verified)

- No standalone live object in v1; live is a **video mode** (`mode=live`) plus
  status flags (`live`, `live_onair`, `live_offair`, `live_upcoming`,
  `no_live`), sortable by `live-audience` / `live-airing-time`.
- Live-verified: `GET /videos?search=news&live_onair=1` returned on-air lives.

## 8. Global API parameters (inspected in full)

Reference: `.../global-api-parameters.md`. Applies to every request:

- `family_filter` (default ON — explicit content filtered unless `false`),
  `localization` (e.g. `fr_FR`, `detect`), `ams_country`, `device_filter`
  (`detect|web|mobile|iptv`), `thumbnail_ratio`, `context`.

## 9. Pagination & completeness (inspected + live-verified)

References: browse-large-catalog guide
(`.../v0/docs/browse-large-video-catalog.md`, inspected in full),
`page`/`limit` filter definitions.

- Response envelope: `{page, limit, total, has_more, list[]}`.
- `limit` max 100; `page` max 10 when `limit=100` → **~1000-result window**.
- `total` may be capped (observed `total:1000`); `has_more` is authoritative.
- Documented scale-out: split with `created_after`/`created_before` (unix s)
  per month/week/day. The app implements date-window partitioning only for
  profile-scoped listing (semantically valid) and reports caps honestly.

## 10. Rate limits & errors (inspected)

- `.../rate-limiting.md`: documents **upload** limits only (15 videos/10h per
  24h standard). No documented read-rate quota; the app handles HTTP 429 with
  backoff + `Retry-After` and treats it as retryable.
- Error shape: `{"error":{"code","message","type",...}}` (observed live for
  403/404). Legacy errors use numeric `code` + `type` strings
  (`access_forbidden`, `not_found`), unlike v2's envelope.

## 11. Implementation status (this app)

| Operation | Status |
|---|---|
| `GET /videos` global search + filters/sort/pagination | implemented, live-verified |
| `GET /video/{id}` lookup | implemented, live-verified |
| `GET /video/{id}/related` browsing | implemented, documented |
| `GET /users` search + `GET /user/{id}` + `GET /user/{id}/videos` | implemented, live-verified |
| `GET /playlists` global search (anonymous) | NOT available — 403 documented; UI offers owner lookup + direct id (alternative workflow) |
| `GET /playlist/{id}`, `/playlist/{id}/videos`, `/user/{id}/playlists` | implemented, live-verified |
| Live discovery via video flags | implemented, live-verified |
| Authenticated partner-host ops (`private`, write ops) | client supports Bearer; needs v1 key — mock-tested only |
| Player/subtitle/report endpoints | out of discovery scope, not advertised |

Doc URLs supporting the above are inline per section.

## Status legend

- **implemented, live-verified**: real HTTP 200 against `api.dailymotion.com`
  on 2026-10-10.
- **implemented, documented**: follows the inspected reference; no live probe
  needed (error path or auth-gated).
- **mock-tested only**: covered by automated tests with fixtures, no live call.
- **needs-credentials**: requires a v1 API key/secret the operator has not
  supplied (`PRIVATE_DAILYMOTION_API_KEY_V1[_SECRET_V1]` empty).
- **unavailable in this version**: documented as unsupported (e.g. anonymous
  global playlist search).
