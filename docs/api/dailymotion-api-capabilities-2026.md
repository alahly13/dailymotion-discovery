# Dailymotion API Capabilities & Verification (2026)

- **Verification Date:** 2026-11-12
- **Prior Codebase Inventory:** [api-v1-capability-inventory.md](file:///e:/discovery/dailymotion-discovery/docs/api-v1-capability-inventory.md) and [api-v2-capability-inventory.md](file:///e:/discovery/dailymotion-discovery/docs/api-v2-capability-inventory.md)
- **Official Documentation Verified:**
  - Welcome & Guides: https://developers.dailymotion.com/docs/welcome
  - API Reference & Performing Calls: https://developers.dailymotion.com/reference/introduction , https://developers.dailymotion.com/reference/perform-an-api-call
  - Migrating Legacy API -> API v2: https://developers.dailymotion.com/docs/migrating-from-legacy-api-to-api-v2
  - Legacy Data API v0/v1: https://developers.dailymotion.com/v0/docs/welcome
  - Authentication & Scopes (V2): https://developers.dailymotion.com/docs/authenticate , https://developers.dailymotion.com/reference/api-scopes
  - Video Listing & Detail (V2): `GET /v2/profiles/{profile_id}/videos`, `GET /v2/videos/{video_id}`

---

## 1. Fundamental Architectural Split: Legacy/Partner API v1 vs API v2

Dailymotion maintains two incompatible API generations with different hosts, token endpoints, response envelopes, field names, pagination semantics, and discovery scopes. **This application NEVER mixes v1 and v2 credentials, tokens, hosts, parameters, or normalized provenance.**

| Dimension | Legacy / Partner API (V1) | Modern REST API (V2) |
|---|---|---|
| **Base URLs** | Public: `https://api.dailymotion.com`<br>Partner/Auth: `https://partner.api.dailymotion.com/rest` | Unified: `https://api.dailymotion.com/v2` |
| **Token Endpoint** | `POST https://partner.api.dailymotion.com/oauth/v1/token` (form-encoded) | `POST https://oauth2.dailymotion.com/v2/token` (form-encoded) |
| **Auth Requirement** | Public host allows unauthenticated discovery for public videos/users; Partner host & private flags require `Bearer` token | **Required for every read and write** (`401 Unauthorized` anonymously) |
| **Supported OAuth Grants** | `client_credentials`, `authorization_code` (legacy `password` deprecated/removed in v2) | Private API keys only via `client_credentials` (`password` removed) |
| **Token Scopes** | `userinfo` (default), `email`, `manage_videos`, `manage_playlists`, `manage_players`, `manage_subtitles` (`scope` field required by token endpoint) | Bundles (`bundle.public`, `bundle.user`, `bundle.publisher`, `bundle.organization`) and granular dot scopes (`video.read`, `profile.read`, `playlist.read`, `live.read`, `account.read`, etc.) |
| **Token Lifetime** | ~36,000s (10h documented fallback) | 1,800s (30 min JWT; re-acquire via `client_credentials`) |
| **Response Envelope** | `{ page, limit, total, has_more, list }` | `{ data, pagination: { page, page_size, total, next, previous } }` |
| **Pagination & Window Cap** | `page` (1-indexed) + `limit` (1–100). Hard 1,000-item search window without date slicing (`created_after`/`created_before`) | `page` + `page_size` (1–100, default 20) + opaque `next` cursor |
| **ID Field Names** | Generic `id` | Explicit resource IDs (`video_id`, `profile_id`, `playlist_id`, `livestream_id`, `user_id`) |
| **Timestamp Format** | Unix epoch integers in seconds (`created_time`) | ISO-8601 UTC strings (`created_at`, `published_at`, `uploaded_at`) |
| **Owner / Channel Mapping** | `owner`, `owner.screenname`; `channel` = Dailymotion category taxonomy | `profile.profile_id`, `profile.name`, `profile.display_name`; `category` = Dailymotion category taxonomy |
| **Duration Field** | `duration` (seconds) | `source.duration` (seconds) |
| **Thumbnail Fields** | `thumbnail_720_url`, `thumbnail_480_url`, `thumbnail_360_url`, `thumbnail_url` | Nested object (`thumbnail.h1080_url`, `thumbnail.h720_url`, `thumbnail.h480_url`) |
| **Kids / Explicit Flags** | `explicit`, `is_created_for_kids`, global `family_filter` | `is_explicit`, `is_for_kids` (no global `family_filter` param) |
| **Geo-restrictions** | Comma-separated `geoblocking` string | Nested `geo_restriction: { mode, countries }` |

---

## 2. Global Search vs Parent-Scoped Discovery Reality (2026 Verified)

1. **V1 Global Video Discovery (`GET /videos`)**:
   - Supports true global full-text `search` (max 150 chars, UTF-8 / Arabic preserved byte-exact), `channel` (category slug), `country`, `languages`, `tags`, `created_after`/`created_before` (unix seconds), `longer_than`/`shorter_than` (minutes), `owners`, `live` / `live_onair` / `live_upcoming` / `live_offair` / `no_live`, `hd`, `verified`, `explicit`, `family_filter`, `localization`, `fields`, `sort` (`relevance`, `recent`, `old`, `visited`, `trending`, `live-audience`, `live-airing-time`, `random`).
   - Also supports direct video lookup (`GET /video/{id}`) and related videos (`GET /video/{id}/related`).
2. **V1 Users / Channels (`GET /users`, `GET /user/{id}`, `GET /user/{id}/videos`)**:
   - In v1, channels/creators are Users/Profiles. Global search `GET /users?search=...` supports `country`, `language`, `usernames`, `flags`, `sort` (`popular`, `recent`, `relevance`, `activity`).
3. **V1 Playlists (`GET /user/{owner}/playlists`, `GET /playlist/{id}`, `GET /playlist/{id}/videos`)**:
   - Global anonymous `GET /playlists` is restricted/403; discovery uses owner/profile-scoped listing (`GET /user/{owner}/playlists`) or direct playlist lookup by ID.
4. **V2 Has NO Global Text Search Endpoint**:
   - Official API v2 intentionally does **not** expose `GET /v2/videos?search=...` global search or `GET /v2/playlists` global search.
   - Supported v2 discovery routes are:
     - `GET /v2/me` (bootstrap authenticated account & accessible `profile_id`s)
     - `GET /v2/profiles/{profile_id}` and `GET /v2/users/{user_id}` (direct lookups)
     - `GET /v2/profiles/{profile_id}/videos` (server filters: `visibility`, `tags`, `created_after`, `created_before` ISO-8601, `is_explicit`, `is_for_kids`, `enable_advertising`, `sort`: `-created_at` / `created_at`, `page`, `page_size`, `fields` dot-notation)
     - `GET /v2/videos/{video_id}` (direct lookup)
     - `GET /v2/profiles/{profile_id}/playlists`, `GET /v2/playlists/{playlist_id}`, `GET /v2/playlists/{playlist_id}/videos`
     - `GET /v2/profiles/{profile_id}/livestreams` (filters: `status` = `onair`/`offair`, `visibility`, `enable_advertising`), `GET /v2/livestreams/{livestream_id}`
   - **Application Rule:** When a user chooses V2 Search, the UI honestly operates as profile-scoped listing or direct resource lookup + client-side filtering — it must never send unsupported v1 parameters (`search`, `family_filter`, `localization`, `longer_than`) to `/v2` or fabricate global v2 search.
   - Any post-fetch filter unsupported by the active endpoint (`minViews`, `minDuration` in v2, exclude keywords, exact phrase, local text query, explicit/kids local filters on loaded batches, missing-thumbnail/description checks) runs deterministically as a **`local` filter** on retrieved results with zero extra API requests.
