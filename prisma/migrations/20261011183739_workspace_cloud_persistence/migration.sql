-- Workspace cloud persistence: durable token cache, search history,
-- batch-commit idempotency, data-migration ledger, storage registry, plus
-- additive saved-video provenance/ordering and video resource types.
--
-- Non-destructive: only CREATE TABLE / ADD COLUMN with safe defaults and
-- CREATE INDEX. No existing table is altered in place, no data is touched,
-- no applied migration is modified. Rollback: drop the five new tables and
-- the added columns (application degrades to local/browser persistence).
--
-- Authored manually (timestamp = real UTC creation time) because the
-- configured database is unreachable from this environment, so the Prisma
-- CLI generator cannot diff. Review with `prisma migrate diff` once
-- connectivity exists; treat this file as immutable after first apply.

-- AlterTable: videos.resource_type (default preserves existing rows)
ALTER TABLE "videos" ADD COLUMN "resource_type" TEXT NOT NULL DEFAULT 'video';

-- AlterTable: saved_videos provenance + ordering (all nullable/safe)
ALTER TABLE "saved_videos" ADD COLUMN "position" INTEGER;
ALTER TABLE "saved_videos" ADD COLUMN "api_version" TEXT;
ALTER TABLE "saved_videos" ADD COLUMN "source_query" TEXT;
ALTER TABLE "saved_videos" ADD COLUMN "source_page" TEXT;

-- CreateTable: api_version_token_cache (one row per API version)
CREATE TABLE "api_version_token_cache" (
  "version" TEXT NOT NULL PRIMARY KEY,
  "encrypted_token" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "auth_tag" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "obtained_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- CreateTable: search_history (one row per submitted search)
CREATE TABLE "search_history" (
  "id" UUID NOT NULL PRIMARY KEY,
  "owner_id" UUID,
  "api_version" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "resource" TEXT NOT NULL DEFAULT 'general',
  "mode" TEXT NOT NULL DEFAULT 'search',
  "params_json" JSONB,
  "sort" TEXT,
  "page_size" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "result_count" INTEGER,
  "error_json" JSONB,
  "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ(6),
  "snapshot_path" TEXT,
  "snapshot_revision" INTEGER,
  "snapshot_checksum" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- CreateTable: batch_commits (idempotency ledger)
CREATE TABLE "batch_commits" (
  "idempotency_key" TEXT NOT NULL PRIMARY KEY,
  "owner_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "saved_upserts" INTEGER NOT NULL DEFAULT 0,
  "history_appended" INTEGER NOT NULL DEFAULT 0,
  "snapshot_path" TEXT,
  "snapshot_checksum" TEXT,
  "result_json" JSONB,
  "error_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ(6)
);

-- CreateTable: data_migration_runs (application data-migration ledger)
CREATE TABLE "data_migration_runs" (
  "migration_key" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "source_domain" TEXT,
  "target_version" TEXT,
  "started_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "last_checkpoint" TEXT,
  "source_count" BIGINT NOT NULL DEFAULT 0,
  "imported_count" BIGINT NOT NULL DEFAULT 0,
  "merged_count" BIGINT NOT NULL DEFAULT 0,
  "skipped_count" BIGINT NOT NULL DEFAULT 0,
  "failed_count" BIGINT NOT NULL DEFAULT 0,
  "verified_count" BIGINT NOT NULL DEFAULT 0,
  "source_checksum" TEXT,
  "dest_checksum" TEXT,
  "error_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- CreateTable: storage_documents (known Storage paths + revisions)
CREATE TABLE "storage_documents" (
  "id" UUID NOT NULL PRIMARY KEY,
  "domain" TEXT NOT NULL,
  "api_version" TEXT,
  "path" TEXT NOT NULL UNIQUE,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "checksum" TEXT,
  "byte_size" BIGINT,
  "schema_version" TEXT NOT NULL DEFAULT '1',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX "videos_platform_resource_type_idx" ON "videos"("platform", "resource_type");
CREATE INDEX "saved_videos_collection_id_position_idx" ON "saved_videos"("collection_id", "position");
CREATE INDEX "search_history_owner_id_submitted_at_idx" ON "search_history"("owner_id", "submitted_at");
CREATE INDEX "search_history_api_version_submitted_at_idx" ON "search_history"("api_version", "submitted_at");
CREATE INDEX "batch_commits_owner_id_created_at_idx" ON "batch_commits"("owner_id", "created_at");
CREATE INDEX "storage_documents_domain_api_version_idx" ON "storage_documents"("domain", "api_version");

-- RLS (existing convention: enabled without broad public policies; the
-- privileged server layer enforces admin authorization per request).
ALTER TABLE "api_version_token_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "search_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "batch_commits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_migration_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storage_documents" ENABLE ROW LEVEL SECURITY;
