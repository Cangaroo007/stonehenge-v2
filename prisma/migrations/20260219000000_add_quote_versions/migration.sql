-- CreateTable
CREATE TABLE "quote_versions" (
    "id" TEXT NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "changeType" TEXT NOT NULL,
    "changeReason" TEXT,
    "changeSummary" TEXT,
    "changes" JSONB,
    "changedBy" TEXT,
    "changedByUserId" INTEGER,
    "rolledBackFromVersion" INTEGER,
    "subtotal" DECIMAL(10,2),
    "tax_amount" DECIMAL(10,2),
    "totalAmount" DECIMAL(10,2),
    "pieceCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_versions_quoteId_idx" ON "quote_versions"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_versions_quoteId_version_key" ON "quote_versions"("quoteId", "version");

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
