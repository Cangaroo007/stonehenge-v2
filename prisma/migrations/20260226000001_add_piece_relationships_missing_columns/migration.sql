-- AlterTable
-- Add missing columns to piece_relationships (schema evolved but migration was never created)
-- Railway error: "The column piece_relationships.relationship_type does not exist"

-- CreateEnum (RelationshipType may already exist from another migration - use IF NOT EXISTS pattern)
DO $$ BEGIN
  CREATE TYPE "RelationshipType" AS ENUM ('WATERFALL', 'SPLASHBACK', 'RETURN', 'WINDOW_SILL', 'MITRE_JOIN', 'BUTT_JOIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add columns if they don't exist (idempotent for safety)
ALTER TABLE "piece_relationships" ADD COLUMN IF NOT EXISTS "relationship_type" "RelationshipType";
ALTER TABLE "piece_relationships" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "piece_relationships" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
