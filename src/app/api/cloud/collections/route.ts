import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getPrismaClient } from "@/lib/prisma/client";
import { PersistenceUnavailableError, toPersistenceError } from "@/lib/persistence/repositories/errors";
import { createCollection, listCollections } from "@/lib/persistence/repositories/saved-titles";

const CreateCollectionSchema = z.object({
  name: z.string().trim().min(1, "Collection name is required.").max(120),
  description: z.string().trim().max(2000).nullable().optional(),
});

function failureResponse(error: unknown, fallback: string) {
  const mapped = toPersistenceError(error);
  if (mapped instanceof PersistenceUnavailableError) {
    return NextResponse.json({ ok: false, error: mapped.message, reason: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: mapped.message || fallback, reason: "unknown" }, { status: 500 });
}

/** GET /api/cloud/collections — list collections with saved video counts (admin only). */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const db = getPrismaClient();
    const collections = await listCollections(db);
    return NextResponse.json({ ok: true, collections });
  } catch (error) {
    return failureResponse(error, "Could not list collections.");
  }
}

/** POST /api/cloud/collections — create a persisted collection in Postgres (admin only). */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = CreateCollectionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { ok: false, error: body.error.issues[0]?.message ?? "Invalid collection payload.", reason: "user_input_error" },
      { status: 400 },
    );
  }

  try {
    const db = getPrismaClient();
    const collection = await createCollection(db, body.data.name, body.data.description ?? null);
    return NextResponse.json({ ok: true, collection }, { status: 201 });
  } catch (error) {
    return failureResponse(error, "Could not create collection.");
  }
}
