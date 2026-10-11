# Dailymotion API v2 — Capability Inventory

> Audit date: 2026-10-10. Sources are the official v2 docs at
> `https://developers.dailymotion.com/...` (guides) and
> `https://developers.dailymotion.com/reference/*.md` (OpenAPI reference).
> Status legend is shared with `docs/api-v1-capability-inventory.md`. The key
> finding of this audit: **every v2 data endpoint requires a Bearer token —
> there is no anonymous public discovery in v2.**

Base URL (documented, migration guide + every OpenAPI `servers` block):

- `https://api.dailymotion.com/v2` — unified endpoint for all v2 calls.
- This app uses `DAILYMOTION_API_BASE_URL_V2=https://api.dailymotion.com/v2`.

Docs inspected (full page reads unless noted):

- `docs` index, `docs/migrating-from-legacy-api-to-api-v2.md` (full: global
  notes, auth, scopes, video/profile/player/playlist/livestream endpoint +
  field maps),
- `docs/authenticate.md` (private-key + client_credentials flow),
- `docs/browse-large-video-catalog.md`, `docs/collect-your-video-ids.md`,
  `docs/collect-profile-ids.md`,
- `reference` index (full endpoint catalogue),
- `reference/perform-an-api-call.md`, `reference/understand-api-response.md`,
  `reference/api-scopes.md`, `reference/rate-limiting.md`,
  `reference/api-errors.md`,
- `reference/listprofilevideos.md` + `reference/get-video.md` (full OpenAPI,
  incl. parameters, fields, error responses).

## 1. Authentication (inspected) — REQUIRED for all v2 reads

Guide: `https://developers.dailymotion.com/docs/authenticate.md`

- Only **Private API keys** are supported in v2 (public keys: not supported).
  Created in Dailymotion Studio (Owner/Admin): Organization → API keys →
  Create API key → Private; key is scoped to profiles with toggled permissions;
  `client_secret` shown **once**.
- Single grant: `client_credentials` (`password` removed, `authorization_code`
  "coming soon"). Token endpoint: `POST https://oauth2.dailymotion.com/v2/token`
  (`application/x-www-form-urlencoded`, `grant_type, client_id, client_secret,
  scope`).
- **Token lifetime 30 minutes** (`expires_in: 1800`, JWT `Bearer`). No refresh
  token for this grant — re-request on expiry. The app caches the token
  in-memory and refreshes proactively.
- Live-verified 2026-10-10: `POST .../v2/token` with dummy credentials returns
  a structured OAuth error
  (`invalid_request / Invalid format ... for field client_id`), proving the
  endpoint is live; and `GET /v2/profiles/xiy/videos` **without** a token
  returns HTTP 401 `Unauthorized`, as does `GET /v2/videos/x5auisp`.
- Scopes (`reference/api-scopes.md`, inspected in full): individual
  `video.read/manage`, `profile.read/manage`, `playlist.read/manage`,
  `live.read/manage`, `player.read/manage`, `account.read/manage`,
  `organization.read/manage`, `analytics.manage`, or bundles
  (`bundle.public` = read-only public-content scopes — sufficient for this
  app's discovery; `bundle.user/publisher/organization` escalate to write).
  The app requests the least privilege needed and surfaces 403
  `MISSING_PERMISSIONS` distinctly.

## 2. No global search endpoint in v2 (inspected, deliberate design)

- The v2 reference catalogue contains **no** `GET /videos` global-search or
  `GET /profiles` search operation. Discovery is **parent-scoped**:
  `GET /profiles/{profile_id}/videos`, `.../playlists`, `.../livestreams`,
  `.../players`, plus direct `GET /videos/{id}`, `/playlists/{id}`,
  `/profiles/{profile_id}`, `/livestreams/{id}`, `/users/{user_id}`, `/me`.
- The app is truthful about this: General Search v2 is a **profile-scoped
  discovery workflow** (enter profile id/name → list + filter), clearly
  labelled, never a fake global search. Cross-version compare links the
  equivalent v1 global search explicitly.

## 3. Videos (inspected in full via OpenAPI)

- `GET /v2/profiles/{profile_id}/videos` — list for a profile. Requires
  `video.read`. Params: `page` (≥1, default 1), `page_size` (1–100, default
  20), `fields` (sparse selection, dot notation for nested), `sort`
  (only `created_at`, `-` prefix for desc; default `created_at` desc),
  `visibility ∈ {public,private,password}`, `enable_advertising`,
  `is_explicit`, `is_for_kids`, `created_after/created_before` (ISO 8601),
  `tags` (comma-separated).
- `GET /v2/videos/{id}` — single video, `fields`-selectable. Requires
  `video.read`.
- Notable field renames vs v1 (migration guide, full tables read): `id`→
  `video_id`, `channel`→`category`, `created_time`→`created_at` (ISO 8601),
  `owner.*`→`profile.*`, thumbnails/first_frame/preview nested
  (`thumbnail.h1080_url` default), `duration`→`source.duration`,
  `geoblocking`→`geo_restriction{mode,countries}`, `private+published`→
  `visibility` enum, `is_created_for_kids`→`is_for_kids`.
- Categories enum: `animals,auto,creation,fun,kids,lifestyle,music,news,people,
  school,sport,tech,travel,tv,videogames,webcam`.

## 4. Profiles / users (inspected)

- `GET /v2/profiles/{profile_id}` — requires `profile.read`. No global
  profile search; lookup by id (from `/me` or a known name→id mapping).
- `GET /v2/users/{user_id}` — requires `account.read`.
- `GET /v2/me` — returns `user_id` + manageable `profiles[{profile_id,name}]`;
 requires `account.read`. This is the documented bootstrap for ids.
- Profile avatars/covers/watermark: "coming soon" / dropped in v2
  (migration guide) — the UI does not promise them.

## 5. Playlists (inspected via migration guide + reference index)

- `GET /v2/profiles/{profile_id}/playlists` (list, `playlist.read`),
  `GET /v2/playlists/{playlist_id}`, `GET /v2/playlists/{id}/videos`
  (playlist order, `sort` + `fields`), plus create/update/delete/add/remove
  (require `playlist.manage` — not advertised by this read-only app).
- **No global `GET /playlists` search** ("Not supported" per migration
  guide). Same truthful alternative as v1: profile-scoped listing + direct id.
- Playlist visibility/thumbnail/owner fields: not yet supported in v2 —
  UI exposes only documented fields.

## 6. Livestreams (inspected via migration guide + reference index)

- `GET /v2/profiles/{profile_id}/livestreams` (filters: status, visibility,
  date range, tags; `live.read`), `GET /v2/livestreams/{id}`, create/update/
  delete/ad-break/record (`live.manage` — not advertised here).
- Live discovery v2 = profile-scoped livestream listing + status filter; there
  is no v2 equivalent of v1's global `live_onair` flag — recorded as a
  version difference on the Capabilities page.

## 7. Players (inspected, out of discovery scope)

- Full CRUD (`player.read/manage`) exists but serves embed configuration, not
  content discovery; not advertised as discovery pages (listed on Capabilities
  page for completeness).

## 8. Field selection (inspected in full)

- `?fields=` comma-separated; **nested dot notation**
  (`embedding.enable_embed`, `thumbnail.h1080_url`); requesting a parent
  returns only its default sub-fields. `GET /videos/{id}` with no `fields`
  returns a small default set (`video_id,title,created_at`-class).
- The app always sends an explicit discovery field set and documents it.

## 9. Pagination & completeness (inspected in full)

- Collection envelope: `{data[], pagination:{page, page_size, total, next,
  previous}}` (paginated JSON object; `data`+`page`+`page_size`+`total`+
  `next`+`previous`).
- `page_size` max 100; `total` is **informational, may be a lower bound** —
  `next` (opaque URL, `null` = last page) is authoritative. Out-of-range page
  → `200` with `data: []`, not 404.
- Same ~1000-result guidance as v1: `browse-large-video-catalog.md` (v2)
  prescribes `created_after/created_before` (ISO 8601) month/week splits with
  `page_size=100`; the app implements windowed retrieval + dedupe for
  profile listings and reports `next`-driven completeness honestly.

## 10. Rate limits & errors (inspected)

- `rate-limiting.md` covers **upload** quotas only; read paths document 429
  as "reserved" at gateway/CDN layers — the app still backs off on 429 with
  `Retry-After`.
- Error envelope (v2, uniform): `{"error":{"code","message",
  "correlation_id","details","documentation_url"}}`; 401
  (`INVALID_AUTHORIZATION`, `AUTHORIZATION_EXPIRED`) vs 403
  (`MISSING_PERMISSIONS`, `UPSTREAM_ACCESS_DENIED`) vs 404
  (`RESOURCE_NOT_FOUND`) vs 422 vs 429 (`TOO_MANY_REQUESTS`). The app maps
  these to distinct UI states (login/expired vs forbidden vs not-found).

## 11. Implementation status (this app)

| Operation | Status |
|---|---|
| OAuth2 client_credentials token flow (30-min cache, least-privilege scopes) | implemented, endpoint live-verified; token issuance **needs-credentials** |
| `GET /profiles/{id}/videos` + filters/sort/`fields`/pagination | implemented, **mock-tested only** (all probes 401 without creds) |
| `GET /videos/{id}`, `/profiles/{id}`, `/users/{id}`, `/me` | implemented, mock-tested only |
| Playlist + livestream profile listings & direct lookups | implemented, mock-tested only |
| Global search in v2 | **unavailable in this version** — no such endpoint; profile-scoped alternative implemented |
| Player CRUD, uploads, writes, webhooks, analytics | out of scope, not advertised |

## 12. Pages NOT accessible / not inspected

- No v2 page returned an access failure during this audit (all fetched pages
  above succeeded). Per-endpoint "Try it" panels were not executed (they need
  a real token). V0 subtitle/player/report reference sub-pages and v0
  `video-fields` full table were index-listed but not line-read; v1 behavior
  that depends on them is marked documented-only in the v1 inventory.
