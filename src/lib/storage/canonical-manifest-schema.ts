import { z } from "zod";
import crypto from "node:crypto";

/**
 * Strict 2026 Schema & Validation for Dailymotion Discovery Manifests.
 * Conforms to YouTube Discovery reference persistence architecture.
 */

export const CanonicalManifestPartSchema = z.object({
  partIndex: z.number().int().positive(),
  key: z.string().min(1),
  sha256: z.string().length(64),
  byteCount: z.number().int().nonnegative(),
  recordCount: z.number().int().nonnegative(),
});

export type CanonicalManifestPart = z.infer<typeof CanonicalManifestPartSchema>;

export const CanonicalManifestSummarySchema = z.object({
  videoCount: z.number().int().nonnegative().default(0),
  channelCount: z.number().int().nonnegative().default(0),
  playlistCount: z.number().int().nonnegative().default(0),
  totalItems: z.number().int().nonnegative(),
  partCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
});

export type CanonicalManifestSummary = z.infer<typeof CanonicalManifestSummarySchema>;

export const CanonicalManifestIntegritySchema = z.object({
  algorithm: z.literal("SHA-256"),
  manifestChecksum: z.string().length(64),
  aggregatePartsChecksum: z.string().length(64),
});

export type CanonicalManifestIntegrity = z.infer<typeof CanonicalManifestIntegritySchema>;

export const CanonicalManifestSourceSchema = z.object({
  apiVersion: z.enum(["v1", "v2", "unified"]),
  page: z.string().min(1),
  resourceType: z.string().optional(),
});

export type CanonicalManifestSource = z.infer<typeof CanonicalManifestSourceSchema>;

export const DailymotionCanonicalManifestSchema = z.object({
  manifestVersion: z.literal(1),
  application: z.literal("dailymotion-discovery"),
  provider: z.literal("dailymotion"),
  ownerId: z.string().min(1),
  generationId: z.string().min(1),
  dataset: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  source: CanonicalManifestSourceSchema,
  query: z.record(z.string(), z.unknown()).default({}),
  filters: z.record(z.string(), z.unknown()).default({}),
  pagination: z.record(z.string(), z.unknown()).default({}),
  summary: CanonicalManifestSummarySchema,
  integrity: CanonicalManifestIntegritySchema,
  parts: z.array(CanonicalManifestPartSchema),
  recovery: z
    .object({
      status: z.enum(["staged", "uploaded", "verified", "committed", "failed"]),
      retryCount: z.number().int().nonnegative().default(0),
      lastError: z.string().optional(),
    })
    .optional(),
});

export type DailymotionCanonicalManifest = z.infer<typeof DailymotionCanonicalManifestSchema>;

export function computeSha256(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function validateCanonicalManifest(data: unknown): {
  success: boolean;
  data?: DailymotionCanonicalManifest;
  error?: string;
} {
  const result = DailymotionCanonicalManifestSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues || [];
    return {
      success: false,
      error: issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") || result.error.message,
    };
  }
  return {
    success: true,
    data: result.data,
  };
}

export interface BuildCanonicalManifestParams {
  ownerId: string;
  generationId: string;
  dataset: string;
  source: CanonicalManifestSource;
  parts: CanonicalManifestPart[];
  query?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  pagination?: Record<string, unknown>;
  videoCount?: number;
  channelCount?: number;
  playlistCount?: number;
  createdAt?: string;
}

export function buildCanonicalManifest(params: BuildCanonicalManifestParams): {
  manifest: DailymotionCanonicalManifest;
  manifestJson: string;
  manifestChecksum: string;
} {
  const now = new Date().toISOString();
  const createdAt = params.createdAt || now;
  const parts = [...params.parts].sort((a, b) => a.partIndex - b.partIndex);

  const totalBytes = parts.reduce((acc, p) => acc + p.byteCount, 0);
  const totalItems = parts.reduce((acc, p) => acc + p.recordCount, 0);

  const aggregatePartsChecksum = computeSha256(
    parts.map((p) => `${p.partIndex}:${p.sha256}:${p.byteCount}`).join("\n")
  );

  const preManifest: Omit<DailymotionCanonicalManifest, "integrity"> & {
    integrity: { algorithm: "SHA-256"; aggregatePartsChecksum: string; manifestChecksum: string };
  } = {
    manifestVersion: 1,
    application: "dailymotion-discovery",
    provider: "dailymotion",
    ownerId: params.ownerId,
    generationId: params.generationId,
    dataset: params.dataset,
    createdAt,
    updatedAt: now,
    source: params.source,
    query: params.query || {},
    filters: params.filters || {},
    pagination: params.pagination || {},
    summary: {
      videoCount: params.videoCount ?? 0,
      channelCount: params.channelCount ?? 0,
      playlistCount: params.playlistCount ?? 0,
      totalItems,
      partCount: parts.length,
      totalBytes,
    },
    integrity: {
      algorithm: "SHA-256",
      aggregatePartsChecksum,
      manifestChecksum: "0".repeat(64), // placeholder for self-checksum computation
    },
    parts,
    recovery: {
      status: "verified",
      retryCount: 0,
    },
  };

  const initialJson = JSON.stringify(preManifest, null, 2);
  const manifestChecksum = computeSha256(initialJson);

  preManifest.integrity.manifestChecksum = manifestChecksum;
  const manifestJson = JSON.stringify(preManifest, null, 2);

  return {
    manifest: preManifest,
    manifestJson,
    manifestChecksum,
  };
}
