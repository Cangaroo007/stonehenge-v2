-- Drop the existing CASCADE constraint
ALTER TABLE "quote_pieces" DROP CONSTRAINT "quote_pieces_apron_parent_id_fkey";

-- Re-add with SET NULL
ALTER TABLE "quote_pieces"
  ADD CONSTRAINT "quote_pieces_apron_parent_id_fkey"
  FOREIGN KEY ("apron_parent_id")
  REFERENCES "quote_pieces"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
