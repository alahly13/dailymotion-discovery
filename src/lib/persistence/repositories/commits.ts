// Batch-commit + data-migration ledgers (Prisma). Scope: server-only.

import type { Prisma, PrismaClient } from "@prisma/client";
import { toPersistenceError } from "./errors";

export async function getBatchCommit(db: PrismaClient, idempotencyKey: string) {
  try {
    return db.batchCommit.findUnique({ where: { idempotencyKey } });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function recordBatchCommit(
  db: PrismaClient,
  entry: {
    idempotencyKey: string;
    status: string;
    revision?: number;
    savedUpserts?: number;
    historyAppended?: number;
    snapshotPath?: string | null;
    snapshotChecksum?: string | null;
    result?: Record<string, unknown> | null;
    error?: Record<string, unknown> | null;
  }
) {
  try {
    return db.batchCommit.upsert({
      where: { idempotencyKey: entry.idempotencyKey },
      create: {
        idempotencyKey: entry.idempotencyKey,
        status: entry.status,
        revision: entry.revision ?? 1,
        savedUpserts: entry.savedUpserts ?? 0,
        historyAppended: entry.historyAppended ?? 0,
        snapshotPath: entry.snapshotPath ?? null,
        snapshotChecksum: entry.snapshotChecksum ?? null,
        resultJson: (entry.result ?? undefined) as Prisma.InputJsonValue | undefined,
        errorJson: (entry.error ?? undefined) as Prisma.InputJsonValue | undefined,
        completedAt: new Date(),
      },
      update: {
        status: entry.status,
        revision: entry.revision ?? 1,
        savedUpserts: entry.savedUpserts ?? 0,
        historyAppended: entry.historyAppended ?? 0,
        snapshotPath: entry.snapshotPath ?? null,
        snapshotChecksum: entry.snapshotChecksum ?? null,
        resultJson: (entry.result ?? undefined) as Prisma.InputJsonValue | undefined,
        errorJson: (entry.error ?? undefined) as Prisma.InputJsonValue | undefined,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function listBatchCommits(db: PrismaClient, take = 20) {
  try {
    return db.batchCommit.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(Math.max(take, 1), 100) });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function listDataMigrationRuns(db: PrismaClient) {
  try {
    return db.dataMigrationRun.findMany({ orderBy: { updatedAt: "desc" }, take: 100 });
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function upsertStorageDocument(
  db: PrismaClient,
  entry: { domain: string; apiVersion?: string | null; path: string; revision: number; checksum: string; byteSize: number }
) {
  try {
    return db.storageDocument.upsert({
      where: { path: entry.path },
      create: { domain: entry.domain, apiVersion: entry.apiVersion ?? null, path: entry.path, revision: entry.revision, checksum: entry.checksum, byteSize: BigInt(entry.byteSize) },
      update: { revision: entry.revision, checksum: entry.checksum, byteSize: BigInt(entry.byteSize) },
    });
  } catch (error) {
    throw toPersistenceError(error);
  }
}
