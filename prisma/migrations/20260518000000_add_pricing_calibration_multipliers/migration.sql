ALTER TABLE "pricing_settings"
  ADD COLUMN "cutting_labour_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  ADD COLUMN "edge_finish_labour_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  ADD COLUMN "cutout_labour_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0;
