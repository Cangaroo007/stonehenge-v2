-- CreateTable
CREATE TABLE "drawing_corrections" (
    "id" SERIAL NOT NULL,
    "drawing_id" TEXT,
    "analysis_id" INTEGER,
    "quote_id" INTEGER,
    "piece_id" INTEGER,
    "company_id" INTEGER NOT NULL,
    "correction_type" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "original_value" JSONB,
    "corrected_value" JSONB NOT NULL,
    "ai_confidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "drawing_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drawing_corrections_company_id_idx" ON "drawing_corrections"("company_id");

-- CreateIndex
CREATE INDEX "drawing_corrections_drawing_id_idx" ON "drawing_corrections"("drawing_id");

-- CreateIndex
CREATE INDEX "drawing_corrections_correction_type_idx" ON "drawing_corrections"("correction_type");

-- CreateIndex
CREATE INDEX "drawing_corrections_created_at_idx" ON "drawing_corrections"("created_at");

-- AddForeignKey
ALTER TABLE "drawing_corrections" ADD CONSTRAINT "drawing_corrections_drawing_id_fkey" FOREIGN KEY ("drawing_id") REFERENCES "drawings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawing_corrections" ADD CONSTRAINT "drawing_corrections_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "quote_drawing_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
