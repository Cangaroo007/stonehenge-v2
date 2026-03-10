-- AlterTable
ALTER TABLE "quote_pieces" ADD COLUMN "piece_type" TEXT DEFAULT 'BENCHTOP';
ALTER TABLE "quote_pieces" ADD COLUMN "join_method" TEXT;
ALTER TABLE "pricing_settings" ADD COLUMN "splashback_top_edge_id" VARCHAR(255);
