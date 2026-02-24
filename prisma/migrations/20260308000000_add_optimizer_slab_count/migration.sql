-- AlterTable
ALTER TABLE "quotes" ADD COLUMN "optimizer_run_at" TIMESTAMP(3);
ALTER TABLE "quotes" ADD COLUMN "optimizer_slab_count" INTEGER;
