-- CreateEnum
CREATE TYPE "CurvedSurchargeMode" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "pricing_settings"
  ADD COLUMN "curved_cutting_mode" "CurvedSurchargeMode" NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "curved_polishing_mode" "CurvedSurchargeMode" NOT NULL DEFAULT 'FIXED';
