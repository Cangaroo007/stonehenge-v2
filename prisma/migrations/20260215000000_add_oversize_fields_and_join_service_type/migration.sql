-- AlterEnum: Add JOIN to ServiceType
ALTER TYPE "ServiceType" ADD VALUE 'JOIN';

-- AlterTable: Add oversize fields to quote_pieces
ALTER TABLE "quote_pieces" ADD COLUMN "isOversize" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quote_pieces" ADD COLUMN "joinCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "quote_pieces" ADD COLUMN "joinLengthMm" INTEGER;
