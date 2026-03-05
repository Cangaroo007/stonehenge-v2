-- CreateTable
CREATE TABLE "drawing_learning_rules" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "drawing_type" TEXT,
    "field_name" TEXT NOT NULL,
    "condition" TEXT,
    "correct_value" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "correction_count" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "approved_by" TEXT,

    CONSTRAINT "drawing_learning_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drawing_learning_rules_company_id_idx" ON "drawing_learning_rules"("company_id");

-- CreateIndex
CREATE INDEX "drawing_learning_rules_drawing_type_field_name_idx" ON "drawing_learning_rules"("drawing_type", "field_name");

-- AddForeignKey
ALTER TABLE "drawing_learning_rules" ADD CONSTRAINT "drawing_learning_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
