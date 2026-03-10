-- AlterTable
ALTER TABLE "quote_pieces" ADD COLUMN "apron_parent_id" INTEGER;
ALTER TABLE "quote_pieces" ADD COLUMN "apron_position" TEXT;

-- AddForeignKey
ALTER TABLE "quote_pieces" ADD CONSTRAINT "quote_pieces_apron_parent_id_fkey" FOREIGN KEY ("apron_parent_id") REFERENCES "quote_pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
