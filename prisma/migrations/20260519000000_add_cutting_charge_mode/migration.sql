CREATE TYPE "CuttingChargeMode" AS ENUM ('FULL_PERIMETER', 'FINISHED_EDGES_ONLY');

ALTER TABLE "pricing_settings"
  ADD COLUMN "cutting_charge_mode" "CuttingChargeMode" NOT NULL DEFAULT 'FULL_PERIMETER';
