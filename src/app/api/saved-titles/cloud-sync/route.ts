// POST /api/saved-titles/cloud-sync — Explicit Two-Phase Cloudflare R2 Upload for Saved Titles
//
// What this controls:
// 1. Authoritative server-side owner resolution via requireAuth().
// 2. Merges local pending entries into canonical R2 manifest without discarding previous cloud entries.
// 3. Verifies SHA-256 integrity digest before commit.
// 4. Returns verified sync receipt.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/auth-service";
import { executeSavedTitlesCloudSync } from "@/lib/saved-titles/cloud-sync-service";
import type { SavedTitleEntry } from "@/lib/saved-titles/types";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let body: { pendingEntries?: SavedTitleEntry[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON request payload.", reason: "user_input_error" },
      { status: 400 }
    );
  }

  const pendingEntries = Array.isArray(body.pendingEntries) ? body.pendingEntries : [];
  if (pendingEntries.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No pending records provided for cloud synchronization.", reason: "empty_batch" },
      { status: 400 }
    );
  }

  // Authoritatively scope to verified server owner UUID
  const result = await executeSavedTitlesCloudSync({
    ownerId: auth.ownerId,
    pendingEntries,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error || "Cloud synchronization failed.",
        phase: result.phase,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    receipt: result.receipt,
    committedIds: result.committedIds,
    totalCloudEntries: result.totalCloudEntries,
    revision: result.revision,
    generationId: result.generationId,
  });
}
