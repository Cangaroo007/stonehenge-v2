-- CreateTable
CREATE TABLE "unit_type_templates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "unitTypeCode" TEXT NOT NULL,
    "description" TEXT,
    "projectId" INTEGER,
    "sourceDrawingId" INTEGER,
    "templateData" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_type_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unit_type_templates_unitTypeCode_projectId_key" ON "unit_type_templates"("unitTypeCode", "projectId");

-- AddForeignKey
ALTER TABLE "unit_type_templates" ADD CONSTRAINT "unit_type_templates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "unit_block_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (templateId on unit_block_units)
ALTER TABLE "unit_block_units" ADD CONSTRAINT "unit_block_units_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "unit_type_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
