-- CreateTable
CREATE TABLE "drawings" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quoteId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "analysisData" JSONB,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "drawings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drawings_quoteId_idx" ON "drawings"("quoteId");

-- CreateIndex
CREATE INDEX "drawings_customerId_idx" ON "drawings"("customerId");

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
