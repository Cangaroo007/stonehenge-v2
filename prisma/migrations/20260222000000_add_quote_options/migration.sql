-- CreateTable
CREATE TABLE "quote_options" (
    "id" SERIAL NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" DECIMAL(10,2),
    "discountAmount" DECIMAL(10,2),
    "gstAmount" DECIMAL(10,2),
    "total" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_option_overrides" (
    "id" SERIAL NOT NULL,
    "optionId" INTEGER NOT NULL,
    "pieceId" INTEGER NOT NULL,
    "materialId" INTEGER,
    "thicknessMm" INTEGER,
    "edgeTop" TEXT,
    "edgeBottom" TEXT,
    "edgeLeft" TEXT,
    "edgeRight" TEXT,
    "cutouts" JSONB,
    "lengthMm" INTEGER,
    "widthMm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_option_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_options_quoteId_idx" ON "quote_options"("quoteId");

-- CreateIndex
CREATE INDEX "quote_option_overrides_optionId_idx" ON "quote_option_overrides"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_option_overrides_optionId_pieceId_key" ON "quote_option_overrides"("optionId", "pieceId");

-- AddForeignKey
ALTER TABLE "quote_options" ADD CONSTRAINT "quote_options_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_option_overrides" ADD CONSTRAINT "quote_option_overrides_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "quote_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
