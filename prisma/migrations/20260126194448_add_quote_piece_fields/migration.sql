-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "default_price_book_id" TEXT;

-- AlterTable
ALTER TABLE "quote_pieces" ADD COLUMN     "cutouts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "edge_bottom" TEXT,
ADD COLUMN     "edge_left" TEXT,
ADD COLUMN     "edge_right" TEXT,
ADD COLUMN     "edge_top" TEXT,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'Piece';

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "price_book_id" TEXT;

-- CreateTable
CREATE TABLE "price_books" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "defaultThickness" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_book_rules" (
    "id" TEXT NOT NULL,
    "price_book_id" TEXT NOT NULL,
    "pricing_rule_id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "price_book_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_books_name_key" ON "price_books"("name");

-- CreateIndex
CREATE UNIQUE INDEX "price_book_rules_price_book_id_pricing_rule_id_key" ON "price_book_rules"("price_book_id", "pricing_rule_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_default_price_book_id_fkey" FOREIGN KEY ("default_price_book_id") REFERENCES "price_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_book_rules" ADD CONSTRAINT "price_book_rules_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_book_rules" ADD CONSTRAINT "price_book_rules_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "pricing_rules_engine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
