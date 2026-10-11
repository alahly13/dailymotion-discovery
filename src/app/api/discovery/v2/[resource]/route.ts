// Discovery API — v2 route: /api/discovery/v2/[resource].
//
// What this controls: server-side entry for every API v2 workspace.
// Why it exists: keeps the v2 base URL, Bearer flow, parent-scoped listing
// model, and `{data,pagination}` envelope behind one version-explicit
// boundary. Never calls v1. v2 has no global search — `mode=browse` needs a
// profile ID and says so explicitly.
// Scope: v2 pages.

import { NextResponse } from "next/server";
import { getCapability } from "@/lib/discovery/capability-registry";
import { toV2IsoDate } from "@/lib/discovery/query-serialization";
import type { DiscoveryResource } from "@/lib/discovery/types";
import {
  v2GetLivestream,
  v2GetPlaylist,
  v2GetProfile,
  v2GetUser,
  v2GetVideo,
  v2Me,
  v2PlaylistVideos,
  v2ProfileLivestreams,
  v2ProfilePlaylists,
  v2ProfileVideos,
} from "@/lib/discovery/v2-search-service";

const RESOURCES: DiscoveryResource[] = ["general", "videos", "channels", "playlists", "users", "live"];

function str(value: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed ? value ?? undefined : undefined;
}

function num(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function iso(value: string | null, endOfDay: boolean): string | null {
  if (!value) return null;
  const normalized = value.length <= 10 ? `${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z` : value;
  return toV2IsoDate(normalized);
}

export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  const { resource } = await context.params;
  if (!RESOURCES.includes(resource as DiscoveryResource)) {
    return NextResponse.json({ ok: false, error: `Unknown v2 resource: ${resource}.`, reason: "user_input_error" }, { status: 400 });
  }
  const typed = resource as DiscoveryResource;
  getCapability(typed, "v2");
  const url = new URL(request.url);
  const mode = (url.searchParams.get("mode") ?? "browse").trim();
  const profileId = url.searchParams.get("profileId") ?? url.searchParams.get("owner") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const page = num(url.searchParams.get("page"));
  const pageSize = num(url.searchParams.get("pageSize"));

  try {
    switch (typed) {
      case "general":
      case "videos": {
        if (mode === "lookup") return NextResponse.json(await v2GetVideo(id));
        return NextResponse.json(
          await v2ProfileVideos(profileId, {
            visibility: (str(url.searchParams.get("visibility")) as "public" | "private" | "password" | undefined) ?? null,
            tags: str(url.searchParams.get("tags")) ?? null,
            createdAfterIso: iso(url.searchParams.get("createdAfter"), false),
            createdBeforeIso: iso(url.searchParams.get("createdBefore"), true),
            sort: str(url.searchParams.get("sort")) ?? null,
            page, pageSize,
            fields: str(url.searchParams.get("fields")),
          }, typed)
        );
      }
      case "channels": {
        if (mode === "me") {
          const me = await v2Me();
          return NextResponse.json(me.ok ? { ok: true, data: me.data } : { ...me.failure, ok: false });
        }
        return NextResponse.json(await v2GetProfile(id || profileId, "channels"));
      }
      case "playlists": {
        if (mode === "lookup") return NextResponse.json(await v2GetPlaylist(id));
        if (mode === "videos") return NextResponse.json(await v2PlaylistVideos(id, page ?? 1, pageSize ?? 50));
        return NextResponse.json(await v2ProfilePlaylists(profileId, page ?? 1, pageSize ?? 50));
      }
      case "users": {
        if (mode === "me") {
          const me = await v2Me();
          return NextResponse.json(me.ok ? { ok: true, data: me.data } : { ...me.failure, ok: false });
        }
        return NextResponse.json(await v2GetUser(id || profileId));
      }
      case "live": {
        if (mode === "lookup") return NextResponse.json(await v2GetLivestream(id));
        return NextResponse.json(
          await v2ProfileLivestreams(profileId, {
            status: str(url.searchParams.get("status")) ?? null,
            visibility: str(url.searchParams.get("visibility")) ?? null,
            createdAfterIso: iso(url.searchParams.get("createdAfter"), false),
            createdBeforeIso: iso(url.searchParams.get("createdBefore"), true),
            tags: str(url.searchParams.get("tags")) ?? null,
            page, pageSize,
          })
        );
      }
    }
  } catch {
    return NextResponse.json({ ok: false, error: "v2 discovery request failed.", reason: "unknown", apiVersion: "v2", resource: typed }, { status: 500 });
  }
}
