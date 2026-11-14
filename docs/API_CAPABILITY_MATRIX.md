# Dailymotion API Capability Matrix: Legacy API v1 vs REST API v2

This document provides the definitive comparison matrix between Dailymotion Legacy API (v1) and Modern REST API (v2) for the Dailymotion Discovery architecture.

---

## 1. Executive Architecture Summary

| Architectural Dimension | Legacy API (v1) | Modern REST API (v2) |
| :--- | :--- | :--- |
| **Base URLs** | `https://api.dailymotion.com`<br>`https://partner.api.dailymotion.com/rest` | `https://api.dailymotion.com/v2` |
| **OAuth2 Token URL** | `https://partner.api.dailymotion.com/oauth/v1/token` | `https://oauth2.dailymotion.com/v2/token` |
| **Token Lifetime** | ~10 hours (`expires_in: 36000`) | 30 minutes (`expires_in: 1800`) |
| **Public Unauthenticated Search** | **Supported** (`GET /videos?search=...`) | **Not Supported** (All endpoints require Bearer token) |
| **Global Free-Text Search** | **Full Catalog** (`/videos`, `/users`) | **Catalog/Profile-Scoped Only** (`/v2/profiles/{id}/videos`) |
| **Pagination Model** | Offset-based: `page` & `limit` | Cursor-based: opaque `cursor`, `page`, `limit` |
| **Result Window Cap** | Up to 1,000 items (`page * limit <= 1000`) | Deep catalog paging via opaque cursors |
| **Response Envelope** | `{ page, limit, explicit, total, has_more, list: [...] }` | `{ data: [...], pagination: { current_page, total_items, has_more, ... } }` |
| **Field Filtering Syntax** | `?fields=id,title,description,duration,views_total` | `?fields=id,title,description,duration,owner...` |

---

## 2. Resource-by-Resource Capability Comparison

### 2.1 Video Resources

| Capability | Legacy API (v1) | Modern REST API (v2) | Architecture / Client Strategy |
| :--- | :--- | :--- | :--- |
| **Global Keyword Search** | `GET /videos?search={q}` (Public) | None | Route global queries to v1; inform user on v2 |
| **Direct Video Lookup** | `GET /video/{id}` | `GET /v2/videos/{id}` | Both return video metadata; v2 requires Bearer token |
| **Profile Video Catalog** | `GET /user/{id}/videos` | `GET /v2/profiles/{id}/videos` | Unified in Link Explorer and Channel Explorer |
| **Related Videos** | `GET /video/{id}/related` | Profile-scoped or tag-derived | Handled gracefully with fallback |
| **Duration Filters** | `longer_than={min}`, `shorter_than={max}` | Local result filtering post-fetch | Server filter on v1, local filter on v2 |
| **Date Range Filters** | `created_after={unix}`, `created_before={unix}` | `created_after={iso}`, `created_before={iso}` | Normalized in `query-serialization.ts` |
| **Safety / Explicit Filters** | `explicit={0|1}`, `family_filter={true|false}` | `is_explicit={true|false}`, `is_for_kids={true|false}` | Unified in UI via tri-state controls |

### 2.2 Channel / Profile / User Resources

| Capability | Legacy API (v1) | Modern REST API (v2) | Architecture / Client Strategy |
| :--- | :--- | :--- | :--- |
| **Global Channel Search** | `GET /users?search={q}` | None | V1 provides unauthenticated user search |
| **Channel / Profile Metadata** | `GET /user/{id}` or `GET /channel/{id}` | `GET /v2/profiles/{id}` | Direct profile metadata resolution |
| **Current User Profile** | `GET /me` (Requires authenticated token) | `GET /v2/me` | Surfaces partner account identity |
| **Channel Subscriptions / Stats** | `views_total`, `videos_total`, `fans_total` | Profile object attributes | Normalized into `DiscoveryItem.extra` |

### 2.3 Playlists

| Capability | Legacy API (v1) | Modern REST API (v2) | Architecture / Client Strategy |
| :--- | :--- | :--- | :--- |
| **Global Playlist Search** | `GET /playlists?search={q}` (HTTP 403 Forbidden without auth) | None | Explicitly disabled; owner-scoped alternatives offered |
| **Owner Playlists** | `GET /user/{id}/playlists` | `GET /v2/profiles/{id}/playlists` | Supported when channel/profile is identified |
| **Playlist Videos** | `GET /playlist/{id}/videos` | `GET /v2/playlists/{id}/videos` | Supported for deep playlist exploration |

### 2.4 Livestreams

| Capability | Legacy API (v1) | Modern REST API (v2) | Architecture / Client Strategy |
| :--- | :--- | :--- | :--- |
| **Live Video Discovery** | `GET /videos?live=live_onair` | `GET /v2/profiles/{id}/livestreams` | V1 provides global discovery; V2 is profile-scoped |
| **Livestream Lookup** | `GET /video/{id}` | `GET /v2/livestreams/{id}` | Type-routed in ResultCard with pulsing indicator |

---

## 3. Link Explorer Strategy Mapping

When a user provides a Dailymotion URL or ID into the Link Explorer, the system detects the resource and maps it as follows:

| Detected Resource | Canonical Input Example | V1 Resolution Path | V2 Resolution Path |
| :--- | :--- | :--- | :--- |
| **Video** | `https://www.dailymotion.com/video/x8n8x8` | `GET /video/x8n8x8` | `GET /v2/videos/x8n8x8` |
| **Channel / Profile** | `https://www.dailymotion.com/lemonde` | `GET /user/lemonde` + `/user/lemonde/videos` | `GET /v2/profiles/lemonde` + `/v2/profiles/lemonde/videos` |
| **Playlist** | `https://www.dailymotion.com/playlist/x88apm` | `GET /playlist/x88apm/videos` | `GET /v2/playlists/x88apm` + `/v2/playlists/x88apm/videos` |
| **Livestream** | `https://www.dailymotion.com/live/x8n8x8` | `GET /video/x8n8x8` | `GET /v2/livestreams/x8n8x8` |
| **Search Query** | `https://www.dailymotion.com/search/news` | `GET /videos?search=news` | Redirect to V1 Global Search with query |

---

## 4. Error Codes & Recovery Matrix

| Status Code | Error Reason | Legacy v1 Behavior | Modern v2 Behavior | Recovery / UI Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **401 Unauthorized** | Missing or expired token | Returns `invalid_token` on Partner host | Returns `Unauthorized` on all endpoints | Fallback to public host (v1) or display Setup Guide (v2) |
| **403 Forbidden** | Missing scope or permission | Ocurrs on unauthenticated `/playlists` | Returns structured `MISSING_PERMISSIONS` | Direct user to owner-scoped query or explain requirement |
| **404 Not Found** | Resource does not exist | `object_not_found` | `RECORD_NOT_FOUND` | Honest "Resource not found" UI alert |
| **429 Too Many Requests** | Rate limit reached | Standard HTTP 429 | Standard HTTP 429 with Retry-After header | Exponential backoff retry (up to 3 attempts) |
