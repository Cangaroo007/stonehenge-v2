ALTER TABLE "quote_pieces" ADD COLUMN IF NOT EXISTS "material_collection_only" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quote_pieces" ADD COLUMN IF NOT EXISTS "material_collection_name" TEXT;
