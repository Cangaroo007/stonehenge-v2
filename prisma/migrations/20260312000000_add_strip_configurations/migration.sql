CREATE TABLE "strip_configurations" (
  "id" TEXT NOT NULL,
  "company_id" INTEGER NOT NULL,
  "stripType" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "stripWidthMm" INTEGER NOT NULL,
  "visibleWidthMm" INTEGER NOT NULL,
  "laminationWidthMm" INTEGER NOT NULL DEFAULT 40,
  "kerfLossMm" INTEGER NOT NULL DEFAULT 8,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "strip_configurations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "strip_configurations_company_id_stripType_key"
   ON "strip_configurations"("company_id", "stripType");

CREATE INDEX "strip_configurations_company_id_idx"
   ON "strip_configurations"("company_id");
