-- CreateEnum
CREATE TYPE "DrawingClass" AS ENUM ('A_PENCIL_SKETCH', 'B_SHOP_DRAWING', 'C_CAD_BENCHTOP', 'D_CABINETRY_PACK', 'E_CONSTRUCTION_PLAN');

-- CreateEnum
CREATE TYPE "DrawingFormat" AS ENUM ('PDF', 'JPEG', 'PNG', 'HEIC', 'DXF', 'DWG', 'IFC');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "drawing_imports" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "quote_id" INTEGER,
    "original_url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "page_count" INTEGER,
    "drawing_class" "DrawingClass",
    "drawing_format" "DrawingFormat",
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drawing_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawing_import_runs" (
    "id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "drawing_import_id" INTEGER NOT NULL,
    "pipeline" TEXT NOT NULL,
    "status" "ImportRunStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "confidence" DECIMAL(4,3),
    "output_pieces" JSONB NOT NULL DEFAULT '[]',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "cost_aud" DECIMAL(8,4),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawing_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_events" (
    "id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "drawing_import_id" INTEGER,
    "quote_id" INTEGER,
    "input_json" JSONB NOT NULL,
    "output_json" JSONB NOT NULL,
    "final_json" JSONB,
    "diff_json" JSONB,
    "confidence" DECIMAL(4,3),
    "model" TEXT,
    "prompt_version" TEXT,
    "drawing_class" "DrawingClass",
    "duration_ms" INTEGER,
    "cost_aud" DECIMAL(8,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ai_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drawing_imports_company_id_idx" ON "drawing_imports"("company_id");

-- CreateIndex
CREATE INDEX "drawing_imports_quote_id_idx" ON "drawing_imports"("quote_id");

-- CreateIndex
CREATE INDEX "drawing_import_runs_drawing_import_id_idx" ON "drawing_import_runs"("drawing_import_id");

-- CreateIndex
CREATE INDEX "drawing_import_runs_company_id_pipeline_idx" ON "drawing_import_runs"("company_id", "pipeline");

-- CreateIndex
CREATE INDEX "ai_events_company_id_idx" ON "ai_events"("company_id");

-- CreateIndex
CREATE INDEX "ai_events_kind_idx" ON "ai_events"("kind");

-- CreateIndex
CREATE INDEX "ai_events_drawing_class_idx" ON "ai_events"("drawing_class");

-- CreateIndex
CREATE INDEX "ai_events_created_at_idx" ON "ai_events"("created_at");

-- AddForeignKey
ALTER TABLE "drawing_imports" ADD CONSTRAINT "drawing_imports_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_imports" ADD CONSTRAINT "drawing_imports_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_import_runs" ADD CONSTRAINT "drawing_import_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_import_runs" ADD CONSTRAINT "drawing_import_runs_drawing_import_id_fkey" FOREIGN KEY ("drawing_import_id") REFERENCES "drawing_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_drawing_import_id_fkey" FOREIGN KEY ("drawing_import_id") REFERENCES "drawing_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_events" ADD CONSTRAINT "ai_events_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

