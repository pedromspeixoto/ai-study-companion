-- Add chunk_index column to embeddings table
ALTER TABLE "embeddings" ADD COLUMN IF NOT EXISTS "chunk_index" integer;
--> statement-breakpoint
-- Create index on resource_id and chunk_index for efficient queries
CREATE INDEX IF NOT EXISTS "idx_embeddings_resource_chunk" ON "embeddings" ("resource_id", "chunk_index");