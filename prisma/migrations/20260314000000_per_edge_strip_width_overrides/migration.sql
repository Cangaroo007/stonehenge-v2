ALTER TABLE "quote_pieces" DROP COLUMN IF EXISTS "strip_width_override_mm";
ALTER TABLE "quote_pieces" ADD COLUMN "strip_width_overrides" JSONB;
