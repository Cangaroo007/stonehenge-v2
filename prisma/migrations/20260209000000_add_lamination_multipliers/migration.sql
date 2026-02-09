-- CreateEnum
CREATE TYPE "LaminationMethod" AS ENUM ('NONE', 'LAMINATED', 'MITRED');

-- AlterTable: pricing_settings
ALTER TABLE "pricing_settings" ADD COLUMN "laminated_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.30;
ALTER TABLE "pricing_settings" ADD COLUMN "mitred_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.50;

-- AlterTable: quote_pieces
ALTER TABLE "quote_pieces" ADD COLUMN "lamination_method" "LaminationMethod" NOT NULL DEFAULT 'NONE';
