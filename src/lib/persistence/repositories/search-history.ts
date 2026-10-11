// Search-history repository (Prisma; one row per submitted search).
// Client-generated ids make appends idempotent (retries return existing).
// Never stores secrets, tokens, or auth headers — enforced by the batch
// schema (paramsJson is filtered before insert). Scope: server-only.

import type { Prisma, PrismaClient } from "@prisma/client";
import { toPersistenceError } from "./errors";

export interface HistoryAppendInput {
  id: string;
  apiVersion: string;
  query: string;
  resource?: string;
  mode?: string;
  params?: Record<string, unknown>;
  sort?: string | null;
  pageSize?: number | null;
  status?: string;
  resultCount?: number | null;
  error?: Record<string, unknown> | null;
  submittedAt?: Date;
  completedAt?: Date | null;
  snapshotPath?: string | null;
  snapshotRevision?: number | null;
  snapshotChecksum?: string | null;
}

const SECRET_KEYS = ["authorization", "token", "access_token", "client_secret", "api_key", "apikey", "secret", "password", "cookie", "set-cookie"];

function sanitizeParams(params: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (SECRET_KEYS.includes(key.toLowerCase())) continue;
    if (typeof value === "string" && value.length > 2000) continue;
    clean[key] = value;
  }
  return clean;
}

/** Idempotent append: existing id → return row, no duplicate. */
export async function appendHistory(db: PrismaClient, input: HistoryAppendInput) {
  try {
    const existing = await db.searchHistory.findUnique({ where: { id: input.id } });
    if (existing) return { row: existing, created: false };
    const row = await db.searchHistory.create({
      data: {
        id: input.id,
        apiVersion: input.apiVersion,
        query: input.query.slice(0, 2000),
        resource: input.resource ?? "general",
        mode: input.mode ?? "search",
        paramsJson: (sanitizeParams(input.params) ?? undefined) as Prisma.InputJsonValue | undefined,
        sort: input.sort ?? null,
        pageSize: input.pageSize ?? null,
        status: input.status ?? "completed",
        resultCount: input.resultCount ?? null,
        errorJson: (input.error ?? undefined) as Prisma.InputJsonValue | undefined,
        submittedAt: input.submittedAt ?? new Date(),
        completedAt: input.completedAt ?? null,
        snapshotPath: input.snapshotPath ?? null,
        snapshotRevision: input.snapshotRevision ?? null,
        snapshotChecksum: input.snapshotChecksum ?? null,
      },
    });
    return { row, created: true };
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function listHistory(db: PrismaClient, apiVersion?: string, take = 200) {
  try {
    return db.searchHistory.findMany({
      where: apiVersion ? { apiVersion } : {},
      orderBy: { submittedAt: "desc" },
      take: Math.min(Math.max(take, 1), 500),
    });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function countHistory(db: PrismaClient, apiVersion?: string): Promise<number> {
  try {
    return db.searchHistory.count({ where: apiVersion ? { apiVersion } : {} });
  } catch (error) {
    throw toPersistenceError(error);
  }
}
