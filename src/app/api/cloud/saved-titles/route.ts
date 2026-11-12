import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getPrismaClient } from "@/lib/prisma/client";
import { PersistenceUnavailableError, toPersistenceError } from "@/lib/persistence/repositories/errors";
import {
  deleteSavedVideoById,
  listSavedTitles,
  saveTitle,
  unsaveTitle,
  updateSavedVideo,
} from "@/lib/persistence/repositories/saved-titles";

const SaveTitlePayloadSchema = z.object({
  platform: z.string().trim().min(1).default("dailymotion"),
  platformVideoId: z.string().trim().min(1, "platformVideoId is required."),
  resourceType: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1, "title is required.").max(500),
  url: z.string().trim().max(2000).nullable().optional(),
  thumbnailUrl: z.string().trim().max(2000).nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
  language: z.string().trim().max(24).nullable().optional(),
  ownerName: z.string().trim().max(200).nullable().optional(),
  channelName: z.string().trim().max(200).nullable().optional(),
  collectionId: z.string().trim().min(1).nullable().optional(),
  apiVersion: z.enum(["v1", "v2"]).nullable().optional(),
  sourceQuery: z.string().max(1000).nullable().optional(),
  sourcePage: z.string().max(200).nullable().optional(),
  favorite: z.boolean().optional(),
});

const PatchSavedTitleSchema = z.object({
  savedVideoId: z.string().trim().min(1, "savedVideoId is required."),
  favorite: z.boolean().optional(),
  collectionId: z.string().trim().min(1).nullable().optional(),
});

function persistenceFailureResponse(error: unknown, fallbackMessage: string) {
  const mapped = toPersistenceError(error);
  if (mapped instanceof PersistenceUnavailableError) {
    return NextResponse.json({ ok: false, error: mapped.message, reason: "unavailable" }, { status: 503 });
  }
  return NextResponse.json(
    { ok: false, error: mapped.message || fallbackMessage, reason: "unknown" },
    { status: 500 },
  );
}

/**
 * GET /api/cloud/saved-titles — list persisted SavedVideo rows with canonical Video metadata.
 * Admin-gated because saved workspace rows live in the operator-owned Postgres store.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const collectionParam = url.searchParams.get("collectionId");
  const collectionId =
    collectionParam === null ? undefined : collectionParam === "none" ? null : collectionParam.trim() || undefined;

  try {
    const db = getPrismaClient();
    const items = await listSavedTitles(db, collectionId);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return persistenceFailureResponse(error, "Could not load saved titles.");
  }
}

/** POST /api/cloud/saved-titles — persist a single video or add it to a collection. */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = SaveTitlePayloadSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { ok: false, error: body.error.issues[0]?.message ?? "Invalid save payload.", reason: "user_input_error" },
      { status: 400 },
    );
  }

  try {
    const db = getPrismaClient();
    const result = await saveTitle(db, body.data);
    return NextResponse.json({ ok: true, ...result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return persistenceFailureResponse(error, "Could not save title.");
  }
}

/** PATCH /api/cloud/saved-titles — toggle favorite or assign collection for a saved row. */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = PatchSavedTitleSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { ok: false, error: body.error.issues[0]?.message ?? "Invalid update payload.", reason: "user_input_error" },
      { status: 400 },
    );
  }

  try {
    const db = getPrismaClient();
    const item = await updateSavedVideo(db, body.data.savedVideoId, {
      favorite: body.data.favorite,
      collectionId: body.data.collectionId,
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return persistenceFailureResponse(error, "Could not update saved title.");
  }
}

/** DELETE /api/cloud/saved-titles — delete by savedVideoId or (videoId, collectionId, apiVersion). */
export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const queryId = url.searchParams.get("id")?.trim();
  const body = queryId ? null : ((await request.json().catch(() => null)) as Record<string, unknown> | null);
  const savedVideoId = queryId || (typeof body?.savedVideoId === "string" ? body.savedVideoId.trim() : "");

  try {
    const db = getPrismaClient();
    if (savedVideoId) {
      await deleteSavedVideoById(db, savedVideoId);
      return NextResponse.json({ ok: true, deleted: 1 });
    }
    const videoId = typeof body?.videoId === "string" ? body.videoId.trim() : "";
    if (!videoId) {
      return NextResponse.json(
        { ok: false, error: "Provide savedVideoId or videoId to delete.", reason: "user_input_error" },
        { status: 400 },
      );
    }
    const collectionId = typeof body?.collectionId === "string" ? body.collectionId : null;
    const apiVersion = typeof body?.apiVersion === "string" ? body.apiVersion : undefined;
    const deleted = await unsaveTitle(db, videoId, collectionId, apiVersion);
    return NextResponse.json({ ok: true, deleted: deleted.count });
  } catch (error) {
    return persistenceFailureResponse(error, "Could not delete saved title.");
  }
}
