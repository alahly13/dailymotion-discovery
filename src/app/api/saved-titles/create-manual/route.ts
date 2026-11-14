// POST /api/saved-titles/create-manual — Server-Verified Manual Saved Title Creation
//
// What this controls:
// 1. Validates server session and administrator privilege.
// 2. Authoritatively stamps `addedBy: { type: "administrator" }` ONLY if server-verified admin.
// 3. Analyzes input (URL, handle, ID, or text reference) while preserving the exact original value.
// 4. Returns the validated entry ready for local IndexedDB persistence.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/auth-service";
import { analyzeDailymotionUrlOrId } from "@/lib/platforms/dailymotion/dailymotion-url-analyzer";
import type { SavedTitleEntry, SavedTitleKind } from "@/lib/saved-titles/types";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let body: { input?: string; notes?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON request body.", reason: "user_input_error" },
      { status: 400 }
    );
  }

  const rawInput = (body.input || "").trim();
  if (!rawInput) {
    return NextResponse.json(
      { ok: false, error: "Title, URL, ID, or search reference is required.", reason: "user_input_error" },
      { status: 400 }
    );
  }

  const parsed = analyzeDailymotionUrlOrId(rawInput);

  let detectedKind: SavedTitleKind = "text_reference";
  if (rawInput.startsWith("http://") || rawInput.startsWith("https://") || rawInput.startsWith("dai.ly")) {
    detectedKind = "url";
  } else if (rawInput.startsWith("@") || rawInput.startsWith("channel:")) {
    detectedKind = "handle";
  } else if (/^[a-zA-Z0-9_-]{5,}$/.test(rawInput)) {
    detectedKind = "resource_id";
  } else if (parsed.kind === "search") {
    detectedKind = "search_query";
  }

  const resourceType = parsed.kind === "unsupported" || parsed.kind === "search" ? null : parsed.kind;
  const now = new Date().toISOString();
  const rand = Math.random().toString(36).slice(2, 8);
  const id = `st_man_${Date.now().toString(36)}_${rand}`;

  // Authoritative server-side addedBy metadata
  const addedBy = auth.isAdmin
    ? {
        type: "administrator" as const,
        userId: auth.user.id,
        email: auth.user.email,
      }
    : {
        type: "user-manual" as const,
        userId: auth.user.id,
        email: auth.user.email,
      };

  const sourceLabel = auth.isAdmin ? "Admin Manual" : "User Manual";

  const entry: SavedTitleEntry = {
    id,
    ownerId: auth.ownerId,
    kind: detectedKind,
    value: rawInput,
    displayTitle: parsed.displayLabel || rawInput,
    source: {
      workspace: "admin-manual",
      label: sourceLabel,
      apiVersion: null, // marked null/not_applicable unless verified provider origin
      resourceType,
    },
    addedBy,
    createdAt: now,
    updatedAt: now,
    resourceType,
    canonicalUrl: parsed.canonicalUrl || null,
    notes: (body.notes || "").trim() || null,
    status: "pending_sync",
  };

  return NextResponse.json({
    ok: true,
    entry,
  });
}
