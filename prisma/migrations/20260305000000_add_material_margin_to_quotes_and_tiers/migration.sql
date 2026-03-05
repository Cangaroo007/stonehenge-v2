-- AlterTable: Add material margin fields to quotes
ALTER TABLE "quotes" ADD COLUMN "material_margin_percent" DECIMAL(5,2);
ALTER TABLE "quotes" ADD COLUMN "material_margin_source" TEXT;

-- AlterTable: Add material margin percent to client_tiers
ALTER TABLE "client_tiers" ADD COLUMN "material_margin_percent" DECIMAL(5,2);
