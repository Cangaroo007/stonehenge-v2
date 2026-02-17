-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('WATERFALL', 'SPLASHBACK', 'RETURN', 'RETURN_END', 'WINDOW_SILL', 'ISLAND', 'MITRE_JOIN', 'BUTT_JOIN', 'LAMINATION');

-- AlterTable: convert relation_type from text to enum
ALTER TABLE "piece_relationships" ALTER COLUMN "relation_type" SET DATA TYPE "RelationshipType" USING "relation_type"::"RelationshipType";

-- AlterTable: add new columns
ALTER TABLE "piece_relationships" ADD COLUMN "notes" TEXT;
ALTER TABLE "piece_relationships" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
