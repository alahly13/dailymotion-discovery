// GET /api/saved-titles/cloud-manifest — Read Authoritative Cloudflare R2 Saved Titles Manifest
//
// What this controls:
// Reads the current committed manifest for the authenticated owner from private R2 bucket.
// Completely isolates user A from user B.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/auth-service";
import { R2WorkerClient } from "@/lib/storage/r2-worker-client";
import { savedTitlesManifestKey } from "@/lib/storage/r2-canonical-paths";
import type { SavedTitlesManifest } from "@/lib/saved-titles/types";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const r2Client = new R2WorkerClient();
  if (!r2Client.configured) {
    return NextResponse.json({
      ok: true,
      configured: false,
      manifest: {
        manifestVersion: 1,
        manifestType: "saved-titles",
        provider: "dailymotion-discovery",
        owner: { ownerId: auth.ownerId },
        manifestId: `st-manifest-${auth.ownerId}`,
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entries: [],
      },
      message: "R2 Worker not configured. Showing local records only.",
    });
  }

  const manifestKey = savedTitlesManifestKey(auth.ownerId);

  try {
    const cloudObj = await r2Client.getObjectJson<SavedTitlesManifest>(auth.ownerId, manifestKey);
    if (!cloudObj || !cloudObj.data) {
      return NextResponse.json({
        ok: true,
        configured: true,
        manifest: {
          manifestVersion: 1,
          manifestType: "saved-titles",
          provider: "dailymotion-discovery",
          owner: { ownerId: auth.ownerId },
          manifestId: `st-manifest-${auth.ownerId}`,
          revision: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          entries: [],
        },
      });
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      manifest: cloudObj.data,
      sha256: cloudObj.sha256,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Failed to retrieve cloud manifest: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 }
    );
  }
}
