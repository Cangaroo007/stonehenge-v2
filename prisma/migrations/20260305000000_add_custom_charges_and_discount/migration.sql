-- CreateTable
CREATE TABLE "quote_custom_charges" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_custom_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_custom_charges_quote_id_idx" ON "quote_custom_charges"("quote_id");

-- CreateIndex
CREATE INDEX "quote_custom_charges_company_id_idx" ON "quote_custom_charges"("company_id");

-- CreateIndex
CREATE INDEX "quote_custom_charges_company_id_description_idx" ON "quote_custom_charges"("company_id", "description");

-- AddForeignKey
ALTER TABLE "quote_custom_charges" ADD CONSTRAINT "quote_custom_charges_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add discount fields to quotes
ALTER TABLE "quotes" ADD COLUMN "discount_type" TEXT;
ALTER TABLE "quotes" ADD COLUMN "discount_value" DECIMAL(10,2);
ALTER TABLE "quotes" ADD COLUMN "discount_applies_to" TEXT DEFAULT 'ALL';
