-- CreateTable
CREATE TABLE "slab_optimizations" (
    "id" TEXT NOT NULL,
    "quoteId" INTEGER,
    "slabWidth" INTEGER NOT NULL DEFAULT 3000,
    "slabHeight" INTEGER NOT NULL DEFAULT 1400,
    "kerfWidth" INTEGER NOT NULL DEFAULT 3,
    "totalSlabs" INTEGER NOT NULL,
    "totalWaste" DECIMAL(10,2) NOT NULL,
    "wastePercent" DECIMAL(5,2) NOT NULL,
    "placements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slab_optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "slab_optimizations_quoteId_idx" ON "slab_optimizations"("quoteId");

-- AddForeignKey
ALTER TABLE "slab_optimizations" ADD CONSTRAINT "slab_optimizations_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
