// Discovery Route Redirection Helper
//
// What this controls: Server-side redirection from retired legacy discovery routes
// to the consolidated Global Search workspace (/global-search) and Link Explorer (/link-explorer).
// Why it exists: Preserves incoming bookmarks, query parameters, filters, and API version
// choices across both v1 and v2 while simplifying application navigation.
// Scope: Retired discovery page routes.

import { redirect } from "next/navigation";

export interface RedirectParamsOptions {
  v?: "v1" | "v2";
  type?: string;
}

export interface RedirectToLinkExplorerOptions {
  v?: "v1" | "v2";
  defaultKind?: string;
}

export async function redirectToGlobalSearch(
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>,
  defaults?: RedirectParamsOptions
): Promise<never> {
  const searchParams = await searchParamsPromise;
  const sp = new URLSearchParams();

  if (defaults?.v) {
    sp.set("v", defaults.v);
  }
  if (defaults?.type) {
    sp.set("type", defaults.type);
  }

  for (const [key, value] of Object.entries(searchParams)) {
    // If the caller provided a v or type in query params, it takes precedence
    if (typeof value === "string") {
      sp.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) sp.append(key, v);
    }
  }

  const qs = sp.toString();
  redirect(qs ? `/global-search?${qs}` : "/global-search");
}

export async function redirectToLinkExplorer(
  searchParamsPromise: Promise<Record<string, string | string[] | undefined>>,
  options?: RedirectToLinkExplorerOptions
): Promise<never> {
  const searchParams = await searchParamsPromise;
  const sp = new URLSearchParams();

  if (options?.v) {
    sp.set("v", options.v);
  }

  // Extract candidate target URL / ID / channel / playlist from common legacy query params
  const candidateUrl =
    (typeof searchParams.url === "string" && searchParams.url) ||
    (typeof searchParams.channel === "string" && searchParams.channel) ||
    (typeof searchParams.source === "string" && searchParams.source) ||
    (typeof searchParams.id === "string" && searchParams.id) ||
    (typeof searchParams.c === "string" && searchParams.c) ||
    (typeof searchParams.q === "string" && searchParams.q) ||
    (typeof searchParams.owner === "string" && searchParams.owner) ||
    "";

  if (candidateUrl) {
    sp.set("url", candidateUrl);
  }

  for (const [key, value] of Object.entries(searchParams)) {
    if (!["url", "channel", "source", "id", "c", "q", "owner", "v"].includes(key)) {
      if (typeof value === "string") {
        sp.set(key, value);
      } else if (Array.isArray(value)) {
        for (const v of value) sp.append(key, v);
      }
    }
  }

  const qs = sp.toString();
  redirect(qs ? `/link-explorer?${qs}` : "/link-explorer");
}

