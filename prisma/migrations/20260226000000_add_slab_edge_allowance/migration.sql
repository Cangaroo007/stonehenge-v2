-- AlterTable
ALTER TABLE "pricing_settings" ADD COLUMN "slab_edge_allowance_mm" INTEGER;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN "slab_edge_allowance_mm" INTEGER;
