-- Add auditable pricing override records for NCS-style manual judgement.
CREATE TABLE "quote_pricing_overrides" (
  "id" SERIAL NOT NULL,
  "quote_id" INTEGER NOT NULL,
  "piece_id" INTEGER,
  "company_id" INTEGER NOT NULL,
  "category" TEXT NOT NULL,
  "override_type" TEXT NOT NULL,
  "value" DECIMAL(12,4) NOT NULL,
  "reason" TEXT,
  "source" TEXT DEFAULT 'manual',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quote_pricing_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_pricing_overrides_quote_id_idx" ON "quote_pricing_overrides"("quote_id");
CREATE INDEX "quote_pricing_overrides_piece_id_idx" ON "quote_pricing_overrides"("piece_id");
CREATE INDEX "quote_pricing_overrides_company_id_idx" ON "quote_pricing_overrides"("company_id");
CREATE INDEX "quote_pricing_overrides_category_override_type_idx" ON "quote_pricing_overrides"("category", "override_type");

ALTER TABLE "quote_pricing_overrides"
  ADD CONSTRAINT "quote_pricing_overrides_quote_id_fkey"
  FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_pricing_overrides"
  ADD CONSTRAINT "quote_pricing_overrides_piece_id_fkey"
  FOREIGN KEY ("piece_id") REFERENCES "quote_pieces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Store expected-vs-extracted examples for drawing-reader training and review.
CREATE TABLE "ai_quote_learning_examples" (
  "id" SERIAL NOT NULL,
  "quote_id" INTEGER,
  "drawing_id" TEXT,
  "analysis_id" INTEGER,
  "company_id" INTEGER NOT NULL,
  "source_quote_number" TEXT,
  "source_system" TEXT DEFAULT 'NCS_ACRUAL',
  "expected_data" JSONB NOT NULL,
  "extracted_data" JSONB,
  "comparison_data" JSONB,
  "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
  "notes" TEXT,
  "created_by" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_quote_learning_examples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_quote_learning_examples_quote_id_idx" ON "ai_quote_learning_examples"("quote_id");
CREATE INDEX "ai_quote_learning_examples_drawing_id_idx" ON "ai_quote_learning_examples"("drawing_id");
CREATE INDEX "ai_quote_learning_examples_analysis_id_idx" ON "ai_quote_learning_examples"("analysis_id");
CREATE INDEX "ai_quote_learning_examples_company_id_idx" ON "ai_quote_learning_examples"("company_id");
CREATE INDEX "ai_quote_learning_examples_status_idx" ON "ai_quote_learning_examples"("status");

ALTER TABLE "ai_quote_learning_examples"
  ADD CONSTRAINT "ai_quote_learning_examples_quote_id_fkey"
  FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_quote_learning_examples"
  ADD CONSTRAINT "ai_quote_learning_examples_drawing_id_fkey"
  FOREIGN KEY ("drawing_id") REFERENCES "drawings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_quote_learning_examples"
  ADD CONSTRAINT "ai_quote_learning_examples_analysis_id_fkey"
  FOREIGN KEY ("analysis_id") REFERENCES "quote_drawing_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
