-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'REVIEW', 'SENT', 'ACCEPTED', 'DECLINED', 'REVISION', 'IN_PRODUCTION', 'COMPLETED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN "status_changed_at" TIMESTAMP(3),
ADD COLUMN "status_changed_by" TEXT,
ADD COLUMN "sent_at" TIMESTAMP(3),
ADD COLUMN "accepted_at" TIMESTAMP(3),
ADD COLUMN "declined_at" TIMESTAMP(3),
ADD COLUMN "declined_reason" TEXT,
ADD COLUMN "revision_number" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "parent_quote_id" INTEGER;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_parent_quote_id_fkey" FOREIGN KEY ("parent_quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
