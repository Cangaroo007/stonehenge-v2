-- CreateTable
CREATE TABLE "unit_type_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "unitTypeCode" TEXT NOT NULL,
    "description" TEXT,
    "templateData" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_type_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finish_tier_mappings" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "finishLevel" TEXT NOT NULL,
    "colourScheme" TEXT,
    "materialAssignments" JSONB NOT NULL,
    "edgeOverrides" JSONB,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finish_tier_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_type_templates_unitTypeCode_key" ON "unit_type_templates"("unitTypeCode");

-- CreateIndex
CREATE UNIQUE INDEX "finish_tier_mappings_templateId_finishLevel_colourScheme_key" ON "finish_tier_mappings"("templateId", "finishLevel", "colourScheme");

-- AddForeignKey
ALTER TABLE "finish_tier_mappings" ADD CONSTRAINT "finish_tier_mappings_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "unit_type_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
