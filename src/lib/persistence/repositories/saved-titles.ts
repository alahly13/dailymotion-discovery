// Saved-titles repository (Prisma; relational truth for saves/playlists).
//
// Identity: canonical Video via (platform, platformVideoId) — titles are
// NEVER identity. Provenance (apiVersion/sourceQuery) lives on SavedVideo
// rows so the same video saved via v1 and v2 keeps both origins.
// Membership (collectionId row) is distinct from global saves (null
// collectionId); deleting a global row never touches playlist rows.
// Scope: server-only, called by the batch orchestrator and sync routes.

import type { PrismaClient } from "@prisma/client";
import { toPersistenceError } from "./errors";

export interface CanonicalVideoInput {
  platform: string;
  platformVideoId: string;
  resourceType?: string;
  title: string;
  url?: string | null;
  thumbnailUrl?: string | null;
  description?: string | null;
  durationSeconds?: number | null;
  language?: string | null;
  ownerName?: string | null;
  channelName?: string | null;
}

export interface SaveTitleInput extends CanonicalVideoInput {
  collectionId?: string | null;
  position?: number | null;
  apiVersion?: string | null;
  sourceQuery?: string | null;
  sourcePage?: string | null;
  favorite?: boolean;
}

/** Find-or-create the canonical video; merges richer metadata on revisit. */
export async function upsertCanonicalVideo(db: PrismaClient, input: CanonicalVideoInput) {
  try {
    const existing = await db.video.findUnique({
      where: { platform_platformVideoId: { platform: input.platform, platformVideoId: input.platformVideoId } },
    });
    const patch: Record<string, unknown> = { resourceType: input.resourceType ?? "video" };
    // Merge-only: never overwrite stored metadata with empty incoming values.
    for (const [key, value] of Object.entries({
      title: input.title,
      url: input.url,
      thumbnailUrl: input.thumbnailUrl,
      description: input.description,
      durationSeconds: input.durationSeconds,
      language: input.language,
      ownerName: input.ownerName,
      channelName: input.channelName,
    })) {
      if (value !== undefined && value !== null && value !== "") patch[key] = value;
    }
    if (!existing) {
      return db.video.create({ data: { platform: input.platform, platformVideoId: input.platformVideoId, title: input.title, ...(patch as object) } });
    }
    // Preserve richer stored metadata: only fill gaps.
    const fill: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const current = (existing as unknown as Record<string, unknown>)[key];
      if ((current === null || current === undefined || current === "") && value !== undefined) fill[key] = value;
    }
    if (Object.keys(fill).length === 0) return existing;
    return db.video.update({ where: { id: existing.id }, data: fill });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

/** Save a title globally (collectionId null) or into a collection. */
export async function saveTitle(db: PrismaClient, input: SaveTitleInput) {
  const video = await upsertCanonicalVideo(db, input);
  try {
    const existing = await db.savedVideo.findFirst({
      where: { videoId: video.id, collectionId: input.collectionId ?? null, apiVersion: input.apiVersion ?? null },
    });
    if (existing) return { video, saved: existing, created: false };
    let position = input.position ?? null;
    if (input.collectionId && position === null) {
      const last = await db.savedVideo.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { position: "desc" },
      });
      position = (last?.position ?? -1) + 1;
    }
    const saved = await db.savedVideo.create({
      data: {
        videoId: video.id,
        collectionId: input.collectionId ?? null,
        position,
        apiVersion: input.apiVersion ?? null,
        sourceQuery: input.sourceQuery ?? null,
        sourcePage: input.sourcePage ?? null,
        favorite: input.favorite ?? false,
      },
    });
    return { video, saved, created: true };
  } catch (error) {
    throw toPersistenceError(error);
  }
}

/** Remove save rows for (video, collection, version) only — never siblings. */
export async function unsaveTitle(db: PrismaClient, videoId: string, collectionId: string | null, apiVersion?: string | null) {
  try {
    const where: Record<string, unknown> = { videoId, collectionId };
    if (apiVersion !== undefined) where.apiVersion = apiVersion;
    return db.savedVideo.deleteMany({ where });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function listSavedTitles(db: PrismaClient, collectionId?: string | null) {
  try {
    return db.savedVideo.findMany({
      where: collectionId === undefined ? {} : { collectionId },
      include: { video: true },
      orderBy: [{ collectionId: "asc" }, { position: "asc" }, { savedAt: "desc" }],
      take: 1000,
    });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function createCollection(db: PrismaClient, name: string, description?: string | null) {
  try {
    return db.collection.create({ data: { name: name.trim().slice(0, 120), description: description?.slice(0, 2000) ?? null } });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function renameCollection(db: PrismaClient, id: string, name: string, description?: string | null) {
  try {
    return db.collection.update({ where: { id }, data: { name: name.trim().slice(0, 120), description: description?.slice(0, 2000) ?? null } });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

/** Delete a collection; member rows detach (SetNull) — global saves kept. */
export async function deleteCollection(db: PrismaClient, id: string) {
  try {
    return db.collection.delete({ where: { id } });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

/** Reorder members transactionally by video id order. */
export async function reorderMembers(db: PrismaClient, collectionId: string, videoIds: string[]) {
  try {
    await db.$transaction(
      videoIds.map((videoId, index) =>
        db.savedVideo.updateMany({ where: { collectionId, videoId }, data: { position: index } })
      )
    );
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function countSavedTitles(db: PrismaClient): Promise<number> {
  try {
    return db.savedVideo.count();
  } catch (error) {
    throw toPersistenceError(error);
  }
}
