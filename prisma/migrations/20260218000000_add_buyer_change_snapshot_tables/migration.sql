-- CreateTable
CREATE TABLE "buyer_change_snapshots" (
    "id" SERIAL NOT NULL,
    "unitId" INTEGER NOT NULL,
    "quoteId" INTEGER NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_change_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_change_records" (
    "id" SERIAL NOT NULL,
    "unitId" INTEGER NOT NULL,
    "changeType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pieceName" TEXT,
    "roomName" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "costDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "buyer_change_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "buyer_change_snapshots_unitId_idx" ON "buyer_change_snapshots"("unitId");

-- CreateIndex
CREATE INDEX "buyer_change_snapshots_quoteId_idx" ON "buyer_change_snapshots"("quoteId");

-- CreateIndex
CREATE INDEX "buyer_change_records_unitId_idx" ON "buyer_change_records"("unitId");

-- AddForeignKey
ALTER TABLE "buyer_change_snapshots" ADD CONSTRAINT "buyer_change_snapshots_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "unit_block_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_change_snapshots" ADD CONSTRAINT "buyer_change_snapshots_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_change_records" ADD CONSTRAINT "buyer_change_records_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "unit_block_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
