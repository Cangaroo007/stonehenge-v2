-- CreateEnum
CREATE TYPE "UnitBlockProjectType" AS ENUM ('APARTMENTS', 'TOWNHOUSES', 'COMMERCIAL', 'MIXED_USE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'QUOTING', 'QUOTED', 'SUBMITTED', 'APPROVED', 'IN_PRODUCTION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('PENDING', 'QUOTED', 'BUYER_CHANGE', 'UPGRADE', 'APPROVED', 'SOLD', 'ON_HOLD');

-- CreateTable
CREATE TABLE "unit_block_projects" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "projectType" "UnitBlockProjectType" NOT NULL DEFAULT 'APARTMENTS',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" INTEGER,
    "address" TEXT,
    "suburb" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "totalUnits" INTEGER NOT NULL DEFAULT 0,
    "totalLevels" INTEGER,
    "description" TEXT,
    "notes" TEXT,
    "volumeTier" TEXT,
    "volumeDiscount" DECIMAL(10,2) DEFAULT 0,
    "totalArea_sqm" DECIMAL(10,4) DEFAULT 0,
    "subtotalExGst" DECIMAL(10,2) DEFAULT 0,
    "discountAmount" DECIMAL(10,2) DEFAULT 0,
    "gstAmount" DECIMAL(10,2) DEFAULT 0,
    "grandTotal" DECIMAL(10,2) DEFAULT 0,
    "finishesRegisterId" INTEGER,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_block_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_block_units" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "level" INTEGER,
    "unitTypeCode" TEXT,
    "finishLevel" TEXT,
    "colourScheme" TEXT,
    "status" "UnitStatus" NOT NULL DEFAULT 'PENDING',
    "saleStatus" TEXT,
    "buyerChangeSpec" BOOLEAN NOT NULL DEFAULT false,
    "quoteId" INTEGER,
    "templateId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_block_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_block_files" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "unitTypeCode" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_block_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_block_units_quoteId_key" ON "unit_block_units"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_block_units_projectId_unitNumber_key" ON "unit_block_units"("projectId", "unitNumber");

-- AddForeignKey
ALTER TABLE "unit_block_projects" ADD CONSTRAINT "unit_block_projects_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_block_projects" ADD CONSTRAINT "unit_block_projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_block_units" ADD CONSTRAINT "unit_block_units_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "unit_block_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_block_units" ADD CONSTRAINT "unit_block_units_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_block_files" ADD CONSTRAINT "unit_block_files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "unit_block_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
