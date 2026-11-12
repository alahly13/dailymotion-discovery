-- Additive migration for Cloudflare R2 immutable generations, personal research collections,
-- and saved search presets. Does NOT drop or mutate legacy Supabase tables or columns.

ALTER TABLE "batch_commits"
  ADD COLUMN IF NOT EXISTS "generation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "aggregate_sha256" TEXT,
  ADD COLUMN IF NOT EXISTS "storage_backend" TEXT NOT NULL DEFAULT 'supabase';

CREATE TABLE IF NOT EXISTS "saved_search_presets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" TEXT NOT NULL DEFAULT 'admin',
  "name" TEXT NOT NULL,
  "api_version" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'search',
  "query" TEXT NOT NULL,
  "api_params_json" JSONB,
  "local_filters_json" JSONB,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "pinned" BOOLEAN NOT NULL DEFAULT FALSE,
  "snapshot_json" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_search_presets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "saved_search_presets_owner_id_updated_at_idx" ON "saved_search_presets"("owner_id", "updated_at");
CREATE INDEX IF NOT EXISTS "saved_search_presets_api_version_resource_idx" ON "saved_search_presets"("api_version", "resource");

CREATE TABLE IF NOT EXISTS "research_collections" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL DEFAULT 'admin',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "research_collections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "research_collections_owner_id_updated_at_idx" ON "research_collections"("owner_id", "updated_at");

CREATE TABLE IF NOT EXISTS "research_collection_items" (
  "id" TEXT NOT NULL,
  "collection_id" TEXT NOT NULL,
  "item_key" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "api_version" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "snapshot_json" JSONB NOT NULL,
  "added_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "research_collection_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "research_collection_items_collection_id_fkey"
    FOREIGN KEY ("collection_id") REFERENCES "research_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "research_collection_items_collection_id_item_key_key" ON "research_collection_items"("collection_id", "item_key");
CREATE INDEX IF NOT EXISTS "research_collection_items_collection_id_position_idx" ON "research_collection_items"("collection_id", "position");

CREATE TABLE IF NOT EXISTS "storage_datasets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" TEXT NOT NULL,
  "dataset_slug" TEXT NOT NULL,
  "storage_backend" TEXT NOT NULL DEFAULT 'r2-worker',
  "bucket_name" TEXT NOT NULL DEFAULT 'dailymotion-discovery-private',
  "version_pointer_key" TEXT NOT NULL,
  "active_generation_id" TEXT,
  "active_manifest_key" TEXT,
  "active_aggregate_sha" TEXT,
  "active_record_count" INTEGER NOT NULL DEFAULT 0,
  "active_total_bytes" BIGINT NOT NULL DEFAULT 0,
  "last_synced_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "storage_datasets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "storage_datasets_owner_id_dataset_slug_key" ON "storage_datasets"("owner_id", "dataset_slug");
CREATE INDEX IF NOT EXISTS "storage_datasets_owner_id_last_synced_at_idx" ON "storage_datasets"("owner_id", "last_synced_at");

CREATE TABLE IF NOT EXISTS "storage_generations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "dataset_id" UUID NOT NULL,
  "owner_id" TEXT NOT NULL,
  "dataset_slug" TEXT NOT NULL,
  "generation_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "manifest_key" TEXT NOT NULL,
  "manifest_sha256" TEXT NOT NULL,
  "aggregate_sha256" TEXT NOT NULL,
  "record_count" INTEGER NOT NULL DEFAULT 0,
  "part_count" INTEGER NOT NULL DEFAULT 0,
  "total_bytes" BIGINT NOT NULL DEFAULT 0,
  "metadata_json" JSONB,
  "committed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "storage_generations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storage_generations_dataset_id_fkey"
    FOREIGN KEY ("dataset_id") REFERENCES "storage_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "storage_generations_generation_id_key" ON "storage_generations"("generation_id");
CREATE INDEX IF NOT EXISTS "storage_generations_dataset_id_created_at_idx" ON "storage_generations"("dataset_id", "created_at");
CREATE INDEX IF NOT EXISTS "storage_generations_owner_id_dataset_slug_status_idx" ON "storage_generations"("owner_id", "dataset_slug", "status");

CREATE TABLE IF NOT EXISTS "storage_manifest_parts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "generation_id" TEXT NOT NULL,
  "part_index" INTEGER NOT NULL,
  "object_key" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "byte_count" BIGINT NOT NULL,
  "record_count" INTEGER NOT NULL,
  "verified_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "storage_manifest_parts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "storage_manifest_parts_generation_id_fkey"
    FOREIGN KEY ("generation_id") REFERENCES "storage_generations"("generation_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "storage_manifest_parts_object_key_key" ON "storage_manifest_parts"("object_key");
CREATE UNIQUE INDEX IF NOT EXISTS "storage_manifest_parts_generation_id_part_index_key" ON "storage_manifest_parts"("generation_id", "part_index");
