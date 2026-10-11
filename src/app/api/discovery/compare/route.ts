// POST /api/discovery/compare — deliberate cross-version comparison.
//
// What this controls: side-by-side v1 + v2 execution for semantically
// equivalent operations (video lookup by id; profile video listing).
// Why it exists: comparison is opt-in and explicit — ordinary search pages
// never auto-switch versions. Datasets are NOT merged; no combined count.
// Scope: /compare page only.

import { NextResponse } from "next/server";
import type { DiscoveryOutcome } from "@/lib/discovery/types";
import { v1GetVideo, v1ProfileVideos } from "@/lib/discovery/v1-search-service";
import { v2GetVideo, v2ProfileVideos } from "@/lib/discovery/v2-search-service";

interface CompareBody {
  operation?: "video-lookup" | "profile-videos";
  id?: string;
  profileId?: string;
  limit?: number;
}

function toJson(outcome: DiscoveryOutcome): DiscoveryOutcome {
  return outcome;
}

export async function POST(request: Request) {
  let body: CompareBody;
  try {
    body = (await request.json()) as CompareBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body.", reason: "user_input_error" }, { status: 400 });
  }
  const operation = body.operation ?? "video-lookup";
  try {
    if (operation === "video-lookup") {
      const id = (body.id ?? "").trim();
      if (!id) return NextResponse.json({ ok: false, error: "Enter a video ID to compare.", reason: "user_input_error" }, { status: 400 });
      const [v1, v2] = await Promise.all([v1GetVideo(id), v2GetVideo(id)]);
      return NextResponse.json({
        ok: true,
        operation,
        v1: toJson(v1),
        v2: toJson(v2),
        fieldNotes: [
          "v1 identifies the video as `id`; v2 as `video_id`.",
          "v1 timestamps are unix seconds (`created_time`); v2 uses ISO-8601 (`created_at`).",
          "v1 owner fields are `owner.*`; v2 nests them under `profile.*`.",
          "v1 `channel` (category) maps to v2 `category`.",
          "v2 requires a Bearer token; v1 lookup is public.",
        ],
      });
    }
    const profileId = (body.profileId ?? "").trim();
    if (!profileId) return NextResponse.json({ ok: false, error: "Enter a profile ID to compare.", reason: "user_input_error" }, { status: 400 });
    const limit = Math.min(Math.max(Number(body.limit ?? 10), 1), 50);
    const [v1, v2] = await Promise.all([
      v1ProfileVideos(profileId, { limit, page: 1 }),
      v2ProfileVideos(profileId, { page: 1, pageSize: limit }, "videos"),
    ]);
    return NextResponse.json({
      ok: true,
      operation,
      v1: toJson(v1),
      v2: toJson(v2),
      fieldNotes: [
        "v1 paginates with `page`/`limit` + `has_more`; v2 with `page`/`page_size` + opaque `next`.",
        "v1 sorts profile videos with `sort=recent`; v2 sorts by `created_at` only.",
        "Counts are per-version and must not be summed.",
      ],
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Comparison failed.", reason: "unknown" }, { status: 500 });
  }
}
