-- CreateTable
CREATE TABLE "piece_relationships" (
    "id" SERIAL NOT NULL,
    "source_piece_id" INTEGER NOT NULL,
    "target_piece_id" INTEGER NOT NULL,
    "relation_type" TEXT NOT NULL,
    "side" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piece_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "piece_relationships_source_piece_id_target_piece_id_key" ON "piece_relationships"("source_piece_id", "target_piece_id");

-- AddForeignKey
ALTER TABLE "piece_relationships" ADD CONSTRAINT "piece_relationships_source_piece_id_fkey" FOREIGN KEY ("source_piece_id") REFERENCES "quote_pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_relationships" ADD CONSTRAINT "piece_relationships_target_piece_id_fkey" FOREIGN KEY ("target_piece_id") REFERENCES "quote_pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
