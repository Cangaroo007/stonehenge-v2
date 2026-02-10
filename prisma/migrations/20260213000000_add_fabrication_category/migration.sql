-- CreateEnum
CREATE TYPE "FabricationCategory" AS ENUM ('ENGINEERED', 'NATURAL_HARD', 'NATURAL_SOFT', 'NATURAL_PREMIUM', 'SINTERED');

-- AlterTable: materials
ALTER TABLE "materials" ADD COLUMN "fabrication_category" "FabricationCategory" NOT NULL DEFAULT 'ENGINEERED';
