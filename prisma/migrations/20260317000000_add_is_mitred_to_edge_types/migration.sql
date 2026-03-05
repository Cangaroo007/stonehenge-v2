-- AlterTable
ALTER TABLE "edge_types" ADD COLUMN "isMitred" BOOLEAN NOT NULL DEFAULT false;

-- Update known mitred edge types
UPDATE "edge_types" SET "isMitred" = true WHERE id IN ('cmlar3eu20006znatmv7mbivv', 'cmlar3etp0003znat3ru2w1hc');
