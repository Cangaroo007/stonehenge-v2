-- AlterTable
ALTER TABLE "client_tiers" ADD COLUMN "custom_price_list" JSONB;

-- Comment
COMMENT ON COLUMN "client_tiers"."custom_price_list" IS 'Tier-specific price list (JSON structure) for service rates, cutouts, and other pricing overrides';
