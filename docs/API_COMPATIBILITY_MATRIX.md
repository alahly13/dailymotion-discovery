# Dailymotion API Compatibility & Integration Matrix (2026)
## Legacy API v1 vs Modern REST API v2 — Architectural Specifications

This document defines the definitive integration specification, official endpoints, authentication requirements, scope declarations, query parameters, metadata fields, pagination mechanisms, and known constraints for both **Dailymotion API v1 (Legacy)** and **Dailymotion REST API v2**.

---

## 1. Architectural Separation Principles

The application enforces strict separation between API v1 and API v2 across four independent discovery modes:
1. **Global Search (V1)**: Routes exclusively to V1 public/partner endpoints (`api.dailymotion.com`, `partner.api.dailymotion.com`).
2. **Global Search (V2)**: Routes exclusively to V2 REST endpoints (`api.dailymotion.com/v2`).
3. **Link Explorer (V1)**: Resolves URLs, IDs, and handles exclusively via V1 endpoints.
4. **Link Explorer (V2)**: Resolves URLs, IDs, and handles exclusively via V2 endpoints.

Under no circumstances does either client make cross-version calls or silently fallback to the other version.

---

## 2. Global Integration & Protocol Matrix

| Integration Dimension | Dailymotion Legacy API v1 | Dailymotion Modern REST API v2 |
| :--- | :--- | :--- |
| **Official Documentation** | [Legacy Welcome](https://developers.dailymotion.com/v0/docs/welcome)<br>[Legacy Index (llms.txt)](https://developers.dailymotion.com/v0/llms.txt) | [API v2 Reference](https://developers.dailymotion.com/reference/introduction)<br>[Authentication Guide](https://developers.dailymotion.com/docs/authenticate) |
| **API Base URL** | `https://api.dailymotion.com` (Public)<br>`https://partner.api.dailymotion.com/rest` (Partner) | `https://api.dailymotion.com/v2` |
| **OAuth2 Token URL** | `https://partner.api.dailymotion.com/oauth/v1/token` | `https://oauth2.dailymotion.com/v2/token` |
| **Grant Type** | `client_credentials` | `client_credentials` |
| **Token Validity** | 36,000 seconds (10 hours) | 1,800 seconds (30 minutes) |
| **Authenticated Scopes** | `manage_videos` (recommended partner scope) | `read_videos read_channels read_playlists read_users` (or `bundle.public` if enabled) |
| **Public Unauthenticated Calls** | Fully supported on `https://api.dailymotion.com` for videos, users, channels | Not supported; all `/v2/*` endpoints require `Authorization: Bearer <token>` |
| **Global Keyword Search** | `GET /videos?search={query}` across global catalog | Not supported globally; catalog queries are profile-scoped (`/v2/profiles/{id}/videos`) |
| **Pagination Style** | Offset: `page={n}&limit={m}` (Max window: `page * limit <= 1000`) | Cursor / Page: opaque `cursor={str}` or `page={n}&limit={m}` |
| **Response Format** | `{ page, limit, explicit, total, has_more, list: [...] }` | `{ data: [...], pagination: { current_page, total_items, has_more, ... } }` |
| **Field Filtering Syntax** | `?fields=id,title,description,duration,views_total,created_time` | `?fields=id,title,description,duration,owner...` |
| **Date Time Format** | Unix timestamp (seconds since epoch) | ISO 8601 string (`YYYY-MM-DDTHH:mm:ssZ`) |
| **Rate Limit Headers** | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` |

---

## 3. Resource Compatibility Matrix

### 3.1 Videos

| Dimension | Legacy API v1 | Modern REST API v2 |
| :--- | :--- | :--- |
| **Resource Type** | Video (`video`) | Video (`video`) |
| **Official Documentation** | [Legacy /videos](https://developers.dailymotion.com/v0/docs/welcome) | [GET /v2/videos/{id}](https://developers.dailymotion.com/reference/perform-an-api-call) |
| **Global Search Endpoint** | `GET https://api.dailymotion.com/videos` | *Not supported globally* (Profile-scoped only) |
| **Single Item Lookup** | `GET https://api.dailymotion.com/video/{xid}` | `GET https://api.dailymotion.com/v2/videos/{xid}` |
| **Profile Videos Endpoint** | `GET https://api.dailymotion.com/user/{id}/videos` | `GET https://api.dailymotion.com/v2/profiles/{id}/videos` |
| **HTTP Method** | `GET` | `GET` |
| **Auth Requirements** | Public calls allowed; Partner token optional | Mandatory Bearer token (`Authorization: Bearer <token>`) |
| **Required Scopes** | Public: None; Partner: `manage_videos` | `read_videos` or `video.read` |
| **Supported Search Filters** | `search`, `longer_than`, `shorter_than`, `created_after`, `created_before`, `explicit`, `country`, `sort` | In profile videos: `search`, `sort`, `is_explicit`, `is_for_kids` |
| **Supported Metadata Fields** | `id`, `title`, `description`, `duration`, `views_total`, `thumbnail_url`, `thumbnail_720_url`, `created_time`, `url`, `owner`, `owner.screenname` | `id`, `title`, `description`, `duration`, `owner`, `thumbnails`, `created_at`, `status`, `view_count` |
| **Pagination Mechanism** | `page` (1-indexed), `limit` (max 100) | `page`, `limit` or `cursor` |
| **Known Limitations** | Total result window capped at 1,000 items (`page * limit <= 1000`). | Global catalog search unavailable; must provide profile ID. |
| **Support Status** | Officially supported & active. | Officially recommended & active. |

---

### 3.2 Channels, Profiles & Users

| Dimension | Legacy API v1 | Modern REST API v2 |
| :--- | :--- | :--- |
| **Resource Type** | Channel / User (`user`) | Profile / Channel (`profile`) |
| **Official Documentation** | [Legacy /users](https://developers.dailymotion.com/v0/docs/welcome) | [GET /v2/profiles/{id}](https://developers.dailymotion.com/reference/perform-an-api-call) |
| **Global Search Endpoint** | `GET https://api.dailymotion.com/users?search={query}` | *Not supported globally* |
| **Single Item Lookup** | `GET https://api.dailymotion.com/user/{username_or_id}` | `GET https://api.dailymotion.com/v2/profiles/{id}` |
| **Partner Me Endpoint** | `GET https://api.dailymotion.com/me` | `GET https://api.dailymotion.com/v2/me` |
| **HTTP Method** | `GET` | `GET` |
| **Auth Requirements** | Public search/lookup allowed; `/me` requires token | Mandatory Bearer token (`Authorization: Bearer <token>`) |
| **Required Scopes** | Public: None; Partner: `manage_videos` or `read` | `read_channels read_users` or `profile.read` |
| **Supported Search Filters** | `search`, `sort` (`relevance`, `recent`, `popular`) | Direct lookup by profile handle/ID |
| **Supported Metadata Fields** | `id`, `screenname`, `username`, `avatar_720_url`, `views_total`, `videos_total`, `fans_total`, `description`, `url` | `id`, `display_name`, `username`, `avatar`, `metrics`, `description`, `canonical_url` |
| **Pagination Mechanism** | `page` (1-indexed), `limit` (max 100) | `page`, `limit` or `cursor` |
| **Known Limitations** | High page offsets can exceed the 1,000 item window cap. | Global user search unavailable in v2. |
| **Support Status** | Officially supported & active. | Officially recommended & active. |

---

### 3.3 Playlists

| Dimension | Legacy API v1 | Modern REST API v2 |
| :--- | :--- | :--- |
| **Resource Type** | Playlist (`playlist`) | Playlist (`playlist`) |
| **Official Documentation** | [Legacy /playlists](https://developers.dailymotion.com/v0/docs/welcome) | [API v2 Playlists](https://developers.dailymotion.com/reference/perform-an-api-call) |
| **Global Search Endpoint** | `GET https://api.dailymotion.com/playlists?search={q}` *(HTTP 403 Forbidden without partner token)* | *Not supported globally* |
| **Owner Playlists** | `GET https://api.dailymotion.com/user/{id}/playlists` | `GET https://api.dailymotion.com/v2/profiles/{id}/playlists` |
| **Playlist Videos** | `GET https://api.dailymotion.com/playlist/{id}/videos` | `GET https://api.dailymotion.com/v2/playlists/{id}/videos` |
| **HTTP Method** | `GET` | `GET` |
| **Auth Requirements** | Public lookup allowed for `/user/{id}/playlists` and `/playlist/{id}/videos`; global search requires partner token | Mandatory Bearer token (`Authorization: Bearer <token>`) |
| **Required Scopes** | `manage_videos` | `read_playlists` or `playlist.read` |
| **Supported Search Filters** | `search` (authenticated only), `sort` | Direct lookup by playlist ID or owner profile |
| **Supported Metadata Fields** | `id`, `name`, `description`, `videos_total`, `thumbnail_url`, `owner` | `id`, `title`, `description`, `item_count`, `thumbnail`, `created_at` |
| **Pagination Mechanism** | `page`, `limit` | `page`, `limit` or `cursor` |
| **Known Limitations** | Unauthenticated `/playlists?search` yields HTTP 403. The app explicitly disables this endpoint and guides users to owner-scoped queries. | Deep playlist operations require partner token. |
| **Support Status** | Officially supported with restrictions. | Officially recommended & active. |

---

### 3.4 Livestreams

| Dimension | Legacy API v1 | Modern REST API v2 |
| :--- | :--- | :--- |
| **Resource Type** | Live Video (`video` with `live=live_onair`) | Livestream (`livestream`) |
| **Official Documentation** | [Legacy Live Streaming](https://developers.dailymotion.com/v0/docs/welcome) | [API v2 Livestreams](https://developers.dailymotion.com/reference/perform-an-api-call) |
| **Global Search Endpoint** | `GET https://api.dailymotion.com/videos?live=live_onair&search={q}` | `GET https://api.dailymotion.com/v2/profiles/{id}/livestreams` (Profile-scoped) |
| **Single Item Lookup** | `GET https://api.dailymotion.com/video/{id}` | `GET https://api.dailymotion.com/v2/livestreams/{id}` |
| **HTTP Method** | `GET` | `GET` |
| **Auth Requirements** | Public query allowed on `api.dailymotion.com` | Mandatory Bearer token (`Authorization: Bearer <token>`) |
| **Required Scopes** | Public: None; Partner: `manage_videos` | `read_videos` or `video.read` |
| **Supported Search Filters** | `live=live_onair`, `search`, `sort` | Profile ID filter, active status |
| **Supported Metadata Fields** | `id`, `title`, `description`, `onair`, `audience`, `thumbnail_720_url`, `created_time` | `id`, `title`, `status`, `broadcast_state`, `viewer_count`, `thumbnails` |
| **Pagination Mechanism** | `page`, `limit` | `page`, `limit` or `cursor` |
| **Known Limitations** | On-air streams fluctuate dynamically; metadata refresh required on reconnect. | V2 livestream discovery requires a known profile ID. |
| **Support Status** | Officially supported & active. | Officially recommended & active. |

---

## 4. Error Mapping & Diagnostic Classification

All error responses from both V1 and V2 are intercepted and converted by `normalizeDailymotionError` into typed `DailymotionNormalizedError` records with safe redaction.

| HTTP Status | Provider Reason | Normalized Code | Category | User Remedy Action |
| :--- | :--- | :--- | :--- | :--- |
| **400** | `invalid_scope` | `AUTH_INVALID_SCOPE` | `auth` | Automatically falls back from `bundle.public` to granular read scopes. |
| **401** | `invalid_token` / `invalid_credentials` | `AUTH_EXPIRED_TOKEN` / `AUTH_MISSING_CREDENTIALS` | `auth` | Refresh OAuth token or check API key and secret in Settings. |
| **403** | `missing_permission` / `forbidden` | `HTTP_FORBIDDEN` | `http_provider` | Explains permission limitation (e.g. unauthenticated playlist search). |
| **404** | `object_not_found` / `RECORD_NOT_FOUND` | `HTTP_NOT_FOUND` | `http_provider` | Informs user resource does not exist or has been deleted. |
| **429** | `rate_limit_exceeded` | `HTTP_RATE_LIMITED` | `http_provider` | Automatically retries with jittered exponential backoff and `Retry-After`. |
| **500, 502, 503** | `internal_server_error` | `HTTP_SERVER_ERROR` | `http_provider` | Retries up to 3 times before displaying service unavailable banner. |
| **Network Failure** | `UND_ERR_CONNECT_TIMEOUT` | `NETWORK_TIMEOUT` | `network` | Prompts user to check network connection and retry. |
| **Cross-Version Violation**| Incompatible query on version | `APP_UNSUPPORTED_RESOURCE` | `integration` | Explains why endpoint is unsupported and provides one-click version switch. |
