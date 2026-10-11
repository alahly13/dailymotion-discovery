// Discovery API — v1 route: /api/discovery/v1/[resource].
//
// What this controls: server-side entry for every Legacy v1 workspace.
// Why it exists: keeps the v1 base URL, param dialect, and envelope behind
// one version-explicit boundary. Never calls v2.
// Scope: v1 pages. Query state mirrors the page URL so refresh/share works.

import { NextResponse } from "next/server";
import { getCapability } from "@/lib/discovery/capability-registry";
import type { DiscoveryResource } from "@/lib/discovery/types";
import {
  v1GetPlaylist,
  v1GetProfile,
  v1GetVideo,
  v1OwnerPlaylists,
  v1PlaylistVideos,
  v1ProfileVideos,
  v1RelatedVideos,
  v1SearchChannels,
  v1SearchLive,
  v1SearchVideos,
} from "@/lib/discovery/v1-search-service";
import type { V1VideoQuery } from "@/lib/discovery/query-serialization";

const RESOURCES: DiscoveryResource[] = ["general", "videos", "channels", "playlists", "users", "live"];

function str(value: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed ? value ?? undefined : undefined;
}

function num(value: string | null): number | undefined {
  if (value === null || value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** UI date (YYYY-MM-DD[THH:mm]) → unix seconds; start-of-day vs end-of-day. */
function dateToUnix(value: string | null, endOfDay: boolean): number | null {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z` : value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
}

function baseVideoFilters(url: URL): V1VideoQuery {
  const flags: string[] = [];
  if (url.searchParams.get("hd") === "1") flags.push("hd");
  if (url.searchParams.get("verified") === "1") flags.push("verified");
  const live = str(url.searchParams.get("live")) as V1VideoQuery["live"] | undefined;
  return {
    channel: str(url.searchParams.get("channel")),
    country: str(url.searchParams.get("country")),
    languages: url.searchParams.get("languages")?.split(",").map((s) => s.trim()).filter(Boolean),
    tags: str(url.searchParams.get("tags")),
    createdAfterUnix: dateToUnix(url.searchParams.get("createdAfter"), false),
    createdBeforeUnix: dateToUnix(url.searchParams.get("createdBefore"), true),
    longerThanMinutes: num(url.searchParams.get("longerThan")),
    shorterThanMinutes: num(url.searchParams.get("shorterThan")),
    owners: url.searchParams.get("owners")?.split(",").map((s) => s.trim()).filter(Boolean),
    live: live ?? null,
    flags,
    explicit: str(url.searchParams.get("explicit")),
    sort: str(url.searchParams.get("sort")),
    limit: num(url.searchParams.get("pageSize")),
    page: num(url.searchParams.get("page")),
    fields: str(url.searchParams.get("fields")),
    familyFilter: url.searchParams.get("familyFilter") === "false" ? false : null,
    localization: str(url.searchParams.get("localization")),
  };
}

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (!RESOURCES.includes(resource as DiscoveryResource)) {
    return NextResponse.json({ ok: false, error: `Unknown v1 resource: ${resource}.`, reason: "user_input_error" }, { status: 400 });
  }
  const typed = resource as DiscoveryResource;
  // Capability lookup validates the version/resource pair exists; never throws for known pairs.
  getCapability(typed, "v1");
  const url = new URL(request.url);
  const mode = (url.searchParams.get("mode") ?? "search").trim();
  const rawQuery = url.searchParams.get("q") ?? undefined;

  try {
    switch (typed) {
      case "general":
        return NextResponse.json(await v1SearchVideos({ ...baseVideoFilters(url), query: rawQuery }, "general"));
      case "videos": {
        if (mode === "lookup") return NextResponse.json(await v1GetVideo(url.searchParams.get("id") ?? ""));
        if (mode === "related") return NextResponse.json(await v1RelatedVideos(url.searchParams.get("id") ?? "", num(url.searchParams.get("pageSize")) ?? 10));
        return NextResponse.json(await v1SearchVideos({ ...baseVideoFilters(url), query: rawQuery }, "videos"));
      }
      case "channels": {
        if (mode === "lookup") return NextResponse.json(await v1GetProfile(url.searchParams.get("id") ?? "", "channels"));
        if (mode === "videos") return NextResponse.json(await v1ProfileVideos(url.searchParams.get("owner") ?? "", { ...baseVideoFilters(url), query: rawQuery }));
        return NextResponse.json(await v1SearchChannels({ search: rawQuery, query: rawQuery, country: str(url.searchParams.get("country")), language: str(url.searchParams.get("language")), sort: str(url.searchParams.get("sort")), limit: num(url.searchParams.get("pageSize")), page: num(url.searchParams.get("page")) }, "channels"));
      }
      case "playlists": {
        if (mode === "lookup") return NextResponse.json(await v1GetPlaylist(url.searchParams.get("id") ?? ""));
        if (mode === "videos") return NextResponse.json(await v1PlaylistVideos(url.searchParams.get("id") ?? "", num(url.searchParams.get("page")) ?? 1, num(url.searchParams.get("pageSize")) ?? 50));
        return NextResponse.json(await v1OwnerPlaylists({ owner: str(url.searchParams.get("owner")), sort: str(url.searchParams.get("sort")), limit: num(url.searchParams.get("pageSize")), page: num(url.searchParams.get("page")) }));
      }
      case "users": {
        if (mode === "lookup") return NextResponse.json(await v1GetProfile(url.searchParams.get("id") ?? "", "users"));
        return NextResponse.json(await v1SearchChannels({ search: rawQuery, query: rawQuery, country: str(url.searchParams.get("country")), language: str(url.searchParams.get("language")), sort: str(url.searchParams.get("sort")), limit: num(url.searchParams.get("pageSize")), page: num(url.searchParams.get("page")) }, "users"));
      }
      case "live":
        return NextResponse.json(
          await v1SearchLive({
            ...baseVideoFilters(url),
            query: rawQuery,
            live: (str(url.searchParams.get("live")) as V1VideoQuery["live"]) ?? "live_onair",
          })
        );
    }
  } catch {
    return NextResponse.json({ ok: false, error: "v1 discovery request failed.", reason: "unknown", apiVersion: "v1", resource: typed }, { status: 500 });
  }
}
