-- AlterTable: Add grain_matching_surcharge_percent to pricing_settings
ALTER TABLE "pricing_settings" ADD COLUMN "grain_matching_surcharge_percent" DECIMAL(5,2) NOT NULL DEFAULT 15.0;
