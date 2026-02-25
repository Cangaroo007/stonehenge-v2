-- AlterTable
ALTER TABLE "quote_pieces" ADD COLUMN "shape_type" TEXT DEFAULT 'RECTANGLE';
ALTER TABLE "quote_pieces" ADD COLUMN "shape_config" JSONB;
