-- AlterTable
ALTER TABLE "unit_block_units" ADD COLUMN "originalQuoteSnapshot" JSONB,
ADD COLUMN "lastChangeAt" TIMESTAMP(3),
ADD COLUMN "changeNotes" TEXT,
ADD COLUMN "costDelta" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN "changeHistory" JSONB;
