/**
 * Authoritative Type Definitions & Schemas for Saved Titles Manifest System (2026)
 *
 * Scope: Personal, owner-scoped collection of search terms, titles, URLs, resource IDs,
 * and manually added references.
 */

import { z } from "zod";

export type SavedTitleKind =
  | "search_query"
  | "url"
  | "resource_id"
  | "handle"
  | "text_reference";

export type SavedTitleStatus =
  | "pending_sync"
  | "uploading"
  | "cloud_synced"
  | "upload_failed";

export interface SavedTitleSource {
  workspace: "global-search" | "link-explorer" | "channel-explorer" | "admin-manual" | string;
  label: "Global Search" | "Link Explorer" | "Channel Explorer" | "Admin Manual" | string;
  apiVersion: "v1" | "v2" | null;
  resourceType?: string | null;
}

export interface SavedTitleAddedBy {
  type: "search-action" | "link-action" | "channel-action" | "administrator" | "user-manual";
  userId?: string;
  email?: string;
}

export interface SavedTitleSyncReceipt {
  revision?: number;
  generationId?: string;
  sha256?: string;
  uploadedAt?: string;
  targetObjectKey?: string;
}

export interface SavedTitleEntry {
  id: string;
  ownerId: string;
  kind: SavedTitleKind;
  value: string;
  displayTitle: string;
  source: SavedTitleSource;
  addedBy: SavedTitleAddedBy;
  createdAt: string;
  updatedAt: string;
  resourceType: string | null;
  canonicalUrl: string | null;
  notes?: string | null;
  status: SavedTitleStatus;
  syncedAt?: string | null;
  syncReceipt?: SavedTitleSyncReceipt | null;
  isDeleted?: boolean;
}

export interface SavedTitlesManifest {
  manifestVersion: number;
  manifestType: "saved-titles";
  provider: "dailymotion-discovery";
  owner: {
    ownerId: string;
  };
  manifestId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  entries: SavedTitleEntry[];
}

export const SavedTitleSourceSchema = z.object({
  workspace: z.string(),
  label: z.string(),
  apiVersion: z.enum(["v1", "v2"]).nullable(),
  resourceType: z.string().nullable().optional(),
});

export const SavedTitleAddedBySchema = z.object({
  type: z.enum(["search-action", "link-action", "channel-action", "administrator", "user-manual"]),
  userId: z.string().optional(),
  email: z.string().optional(),
});

export const SavedTitleSyncReceiptSchema = z.object({
  revision: z.number().optional(),
  generationId: z.string().optional(),
  sha256: z.string().optional(),
  uploadedAt: z.string().optional(),
  targetObjectKey: z.string().optional(),
});

export const SavedTitleEntrySchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  kind: z.enum(["search_query", "url", "resource_id", "handle", "text_reference"]),
  value: z.string().min(1),
  displayTitle: z.string().min(1),
  source: SavedTitleSourceSchema,
  addedBy: SavedTitleAddedBySchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  resourceType: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  notes: z.string().nullable().optional(),
  status: z.enum(["pending_sync", "uploading", "cloud_synced", "upload_failed"]),
  syncedAt: z.string().nullable().optional(),
  syncReceipt: SavedTitleSyncReceiptSchema.nullable().optional(),
  isDeleted: z.boolean().optional(),
});

export const SavedTitlesManifestSchema = z.object({
  manifestVersion: z.number().int().positive(),
  manifestType: z.literal("saved-titles"),
  provider: z.literal("dailymotion-discovery"),
  owner: z.object({
    ownerId: z.string().min(1),
  }),
  manifestId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  entries: z.array(SavedTitleEntrySchema),
});
