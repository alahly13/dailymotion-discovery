import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getPrismaClient } from "@/lib/prisma/client";
import { PersistenceUnavailableError, toPersistenceError } from "@/lib/persistence/repositories/errors";
import { deleteCollection, renameCollection, reorderMembers } from "@/lib/persistence/repositories/saved-titles";

const PatchCollectionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  reorderVideoIds: z.array(z.string().trim().min(1)).max(1000).optional(),
});

function handleError(error: unknown, fallback: string) {
  const mapped = toPersistenceError(error);
  if (mapped instanceof PersistenceUnavailableError) {
    return NextResponse.json({ ok: false, error: mapped.message, reason: "unavailable" }, { status: 503 });
  }
  const message = mapped.message || fallback;
  if (/P2025|not found|record to .* does not exist/i.test(message)) {
    return NextResponse.json({ ok: false, error: "Collection not found.", reason: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: false, error: message, reason: "unknown" }, { status: 500 });
}

/** PATCH /api/cloud/collections/[id] — rename or reorder saved members (admin only). */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  const body = PatchCollectionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { ok: false, error: body.error.issues[0]?.message ?? "Invalid collection update.", reason: "user_input_error" },
      { status: 400 },
    );
  }

  try {
    const db = getPrismaClient();
    let updated = null;
    if (body.data.name) {
      updated = await renameCollection(db, id, body.data.name, body.data.description);
    }
    if (body.data.reorderVideoIds) {
      await reorderMembers(db, id, body.data.reorderVideoIds);
    }
    return NextResponse.json({ ok: true, collection: updated });
  } catch (error) {
    return handleError(error, "Could not update collection.");
  }
}

/** DELETE /api/cloud/collections/[id] — delete a collection while preserving global saves. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await context.params;

  try {
    const db = getPrismaClient();
    await deleteCollection(db, id);
    return NextResponse.json({ ok: true, deletedId: id });
  } catch (error) {
    return handleError(error, "Could not delete collection.");
  }
}
