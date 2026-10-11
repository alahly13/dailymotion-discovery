// Version-isolated endpoint configuration for the two Dailymotion integrations.
//
// What this controls: base URLs, token endpoints, scopes, and global filter
// defaults per API version.
// Why it exists: the operator runs ONE Dailymotion account with TWO separately
// configured integrations. Each profile owns its URLs/credentials/scopes;
// nothing falls back across versions.
//
// Host truth (live-verified 2026-10-11):
// - V1 partner host `partner.api.dailymotion.com/rest` REQUIRES a token
//   (anonymous → 401 invalid_token). Authenticated V1 traffic uses it.
// - V1 public host `api.dailymotion.com` serves anonymous public discovery.
//   Same version, documented public host — used only when no V1 token exists.
// - V2 unified host `api.dailymotion.com/v2` always requires Bearer.
// Scope truth (official docs):
// - V1 token endpoint REQUIRES `scope` (422 without). Platform scopes:
//   manage_videos, manage_players, manage_playlists, manage_subtitles,
//   email, userinfo. Default `userinfo` = least privilege for discovery.
// - V2 `scope` defaults to `bundle.public` (read-only public content).
// Family-filter truth: env `DAILYMOTION_FAMILY_FILTER` accepts
// "true"/"false"/unset. Unset (or anything unparseable) means OMIT the param
// so the API default (filter ON) applies — a missing variable can never
// silently disable the safety filter. Explicit "false" is a deliberate
// opt-out and must be shown with a warning in the UI.
// Scope: server-side discovery code. Never import into client components.

import type { ApiVersion } from "./types";

export const DAILYMOTION_V1_PUBLIC_BASE_URL = "https://api.dailymotion.com";
export const DAILYMOTION_V1_PARTNER_BASE_URL = "https://partner.api.dailymotion.com/rest";
export const DAILYMOTION_V2_BASE_URL = "https://api.dailymotion.com/v2";
export const DAILYMOTION_V1_TOKEN_URL = "https://partner.api.dailymotion.com/oauth/v1/token";
export const DAILYMOTION_V2_TOKEN_URL = "https://oauth2.dailymotion.com/v2/token";

function cleanUrl(value: string | undefined, fallback: string): string {
  const cleaned = (value ?? "").trim().replace(/\/+$/, "");
  return cleaned || fallback;
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

export interface VersionProfile {
  version: ApiVersion;
  /** Public V1 discovery base (DAILYMOTION_API_BASE_URL_V1). Unused for v2. */
  publicBaseUrl: string;
  /** Authenticated Partner base (v1) / unified base (v2). */
  baseUrl: string;
  /** Null for v2 (no anonymous discovery). Equals publicBaseUrl for v1. */
  anonymousBaseUrl: string | null;
  tokenUrl: string;
  key: string;
  secret: string;
  scope: string;
  hasCredentials: boolean;
}

let warnedPartnerAlias = false;
let warnedBareAlias = false;

/**
 * Canonical V1 profile.
 * - Public discovery: DAILYMOTION_API_BASE_URL_V1 (default public host).
 * - Partner ops: DAILYMOTION_PARTNER_API_BASE_URL_V1 (default Partner host).
 * Backward compat: a V1 base URL containing "partner" is honored as the
 * Partner base (warns once; move it to the partner var). The two hosts are
 * never treated as interchangeable beyond this explicit alias rule.
 */
export function getV1Profile(): VersionProfile {
  const v1Base = clean(process.env.DAILYMOTION_API_BASE_URL_V1);
  const partnerVar = clean(process.env.DAILYMOTION_PARTNER_API_BASE_URL_V1);
  const v1IsPartner = /partner/i.test(v1Base);
  if (v1IsPartner && !warnedPartnerAlias) {
    warnedPartnerAlias = true;
    console.warn("[WARN] DAILYMOTION_API_BASE_URL_V1 points at the Partner host. Move it to DAILYMOTION_PARTNER_API_BASE_URL_V1; the V1 var is for the public host. Removal of this alias is planned — see .env.example.");
  }
  const publicBaseUrl = v1Base && !v1IsPartner ? v1Base.replace(/\/+$/, "") : DAILYMOTION_V1_PUBLIC_BASE_URL;
  const baseUrl = partnerVar
    ? partnerVar.replace(/\/+$/, "")
    : v1IsPartner
      ? v1Base.replace(/\/+$/, "")
      : DAILYMOTION_V1_PARTNER_BASE_URL;
  const tokenUrl = cleanUrl(process.env.DAILYMOTION_OAUTH_TOKEN_URL_V1, DAILYMOTION_V1_TOKEN_URL);
  const key = clean(process.env.PRIVATE_DAILYMOTION_API_KEY_V1);
  const secret = clean(process.env.PRIVATE_DAILYMOTION_API_KEY_SECRET_V1);
  const scope = clean(process.env.DAILYMOTION_API_SCOPE_V1) || "userinfo";
  return {
    version: "v1",
    publicBaseUrl,
    baseUrl,
    anonymousBaseUrl: publicBaseUrl,
    tokenUrl,
    key,
    secret,
    scope,
    hasCredentials: key.length > 0 && secret.length > 0,
  };
}

export function getV2Profile(): VersionProfile {
  const baseUrl = cleanUrl(process.env.DAILYMOTION_API_BASE_URL_V2, DAILYMOTION_V2_BASE_URL);
  const tokenUrl = cleanUrl(process.env.DAILYMOTION_OAUTH_TOKEN_URL_V2, DAILYMOTION_V2_TOKEN_URL);
  const key = clean(process.env.PRIVATE_DAILYMOTION_API_KEY_V2);
  const secret = clean(process.env.PRIVATE_DAILYMOTION_API_KEY_SECRET_V2);
  const scope = clean(process.env.DAILYMOTION_API_SCOPE_V2) || "bundle.public";
  return {
    version: "v2",
    publicBaseUrl: DAILYMOTION_V2_BASE_URL,
    baseUrl,
    anonymousBaseUrl: null,
    tokenUrl,
    key,
    secret,
    scope,
    hasCredentials: key.length > 0 && secret.length > 0,
  };
}

export function getVersionProfile(version: ApiVersion): VersionProfile {
  return version === "v1" ? getV1Profile() : getV2Profile();
}

/** Legacy accessor kept for backward compatibility (canonical public base). */
export function getV1Env(): { baseUrl: string; partnerBaseUrl: string; key: string; secret: string; hasCredentials: boolean } {
  const profile = getV1Profile();
  return { baseUrl: profile.publicBaseUrl, partnerBaseUrl: profile.baseUrl, key: profile.key, secret: profile.secret, hasCredentials: profile.hasCredentials };
}

/** Legacy accessor kept for backward compatibility (v2 profile base). */
export function getV2Env(): { baseUrl: string; key: string; secret: string; hasCredentials: boolean } {
  const profile = getV2Profile();
  return { baseUrl: profile.baseUrl, key: profile.key, secret: profile.secret, hasCredentials: profile.hasCredentials };
}

/** Token-cache safety margin in seconds (configurable, default 60). */
export function tokenSafetyMarginSeconds(): number {
  const text = clean(process.env.TOKEN_CACHE_SAFETY_MARGIN_SECONDS);
  if (!text) return 60; // unset/empty = documented default (never 0 by accident)
  const raw = Number(text);
  if (!Number.isFinite(raw) || raw < 0) return 60;
  return Math.min(Math.trunc(raw), 3600);
}

/** Deprecated bare-var usage warning (server log, names only, once). */
export function warnDeprecatedEnvAliases(): void {
  if (!warnedBareAlias && (clean(process.env.DAILYMOTION_API_BASE_URL) || clean(process.env.DAILYMOTION_API_KEY))) {
    warnedBareAlias = true;
    console.warn("[WARN] DAILYMOTION_API_BASE_URL / DAILYMOTION_API_KEY are deprecated aliases kept only for the pre-existing legacy client. Use DAILYMOTION_API_BASE_URL_V1 (+ DAILYMOTION_PARTNER_API_BASE_URL_V1) and PRIVATE_DAILYMOTION_API_KEY_V1[_SECRET_V1]. Removal planned — see .env.example.");
  }
}

/** Tri-state family filter: null = omit (API default ON = safe). */
export function parseFamilyFilterEnv(): boolean | null {
  const raw = clean(process.env.DAILYMOTION_FAMILY_FILTER).toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return null;
}

/** Localization default for v1 global param (`detect` per operator config). */
export function defaultLocalization(): string {
  return clean(process.env.DAILYMOTION_LOCALIZATION) || "detect";
}

export const VERSION_DOC_URLS: Record<ApiVersion, { guides: string; reference: string; auth: string }> = {
  v1: {
    guides: "https://developers.dailymotion.com/v0/docs",
    reference: "https://developers.dailymotion.com/v0/reference",
    auth: "https://developers.dailymotion.com/v0/docs/authenticate.md",
  },
  v2: {
    guides: "https://developers.dailymotion.com/docs",
    reference: "https://developers.dailymotion.com/reference",
    auth: "https://developers.dailymotion.com/docs/authenticate.md",
  },
};
