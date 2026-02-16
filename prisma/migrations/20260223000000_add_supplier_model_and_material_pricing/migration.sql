-- CreateEnum
CREATE TYPE "PriceListStatus" AS ENUM ('PENDING', 'PROCESSING', 'REVIEW', 'APPLIED', 'FAILED');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "contact_email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "default_margin_percent" DECIMAL(5,2) DEFAULT 0,
    "default_slab_length_mm" INTEGER,
    "default_slab_width_mm" INTEGER,
    "default_thickness_mm" INTEGER,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_uploads" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extracted_data" JSONB,
    "status" "PriceListStatus" NOT NULL DEFAULT 'PENDING',
    "materials_created" INTEGER NOT NULL DEFAULT 0,
    "materials_updated" INTEGER NOT NULL DEFAULT 0,
    "materials_discontinued" INTEGER NOT NULL DEFAULT 0,
    "materials_skipped" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "price_list_uploads_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add supplier and pricing fields to materials
ALTER TABLE "materials" ADD COLUMN "supplier_id" TEXT;
ALTER TABLE "materials" ADD COLUMN "wholesale_price" DECIMAL(10,2);
ALTER TABLE "materials" ADD COLUMN "product_code" TEXT;
ALTER TABLE "materials" ADD COLUMN "supplier_range" TEXT;
ALTER TABLE "materials" ADD COLUMN "surface_finish" TEXT;
ALTER TABLE "materials" ADD COLUMN "margin_override_percent" DECIMAL(5,2);
ALTER TABLE "materials" ADD COLUMN "is_discontinued" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "materials" ADD COLUMN "discontinued_at" TIMESTAMP(3);

-- AlterTable: Add material margin adjust to quote_options
ALTER TABLE "quote_options" ADD COLUMN "material_margin_adjust_percent" DECIMAL(5,2) DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_name_key" ON "suppliers"("company_id", "name");
CREATE INDEX "suppliers_company_id_idx" ON "suppliers"("company_id");

-- CreateIndex
CREATE INDEX "price_list_uploads_supplier_id_idx" ON "price_list_uploads"("supplier_id");
CREATE INDEX "price_list_uploads_company_id_idx" ON "price_list_uploads"("company_id");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_uploads" ADD CONSTRAINT "price_list_uploads_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
