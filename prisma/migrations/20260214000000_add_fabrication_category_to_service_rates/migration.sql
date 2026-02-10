-- AlterTable: Add fabricationCategory to service_rates
-- Default to ENGINEERED so existing rows remain valid
ALTER TABLE "service_rates" ADD COLUMN "fabricationCategory" "FabricationCategory" NOT NULL DEFAULT 'ENGINEERED';

-- Drop old unique constraint (pricing_settings_id, serviceType)
DROP INDEX IF EXISTS "service_rates_pricing_settings_id_serviceType_key";

-- Create new unique constraint (pricing_settings_id, serviceType, fabricationCategory)
CREATE UNIQUE INDEX "service_rates_pricing_settings_id_serviceType_fabricationCategory_key"
  ON "service_rates"("pricing_settings_id", "serviceType", "fabricationCategory");
