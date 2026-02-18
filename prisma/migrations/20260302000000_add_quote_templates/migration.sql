-- CreateTable
CREATE TABLE "quote_templates" (
    "id" TEXT NOT NULL,
    "company_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "company_name" TEXT,
    "company_abn" TEXT,
    "company_phone" TEXT,
    "company_email" TEXT,
    "company_address" TEXT,
    "logo_url" TEXT,
    "show_piece_breakdown" BOOLEAN NOT NULL DEFAULT true,
    "show_edge_details" BOOLEAN NOT NULL DEFAULT true,
    "show_cutout_details" BOOLEAN NOT NULL DEFAULT true,
    "show_material_per_piece" BOOLEAN NOT NULL DEFAULT false,
    "show_room_totals" BOOLEAN NOT NULL DEFAULT true,
    "show_itemised_breakdown" BOOLEAN NOT NULL DEFAULT false,
    "show_slab_count" BOOLEAN NOT NULL DEFAULT false,
    "show_piece_descriptions" BOOLEAN NOT NULL DEFAULT true,
    "pricing_mode" TEXT NOT NULL DEFAULT 'room_total',
    "show_gst" BOOLEAN NOT NULL DEFAULT true,
    "gst_label" TEXT NOT NULL DEFAULT 'GST (10%)',
    "currency_symbol" TEXT NOT NULL DEFAULT '$',
    "terms_and_conditions" TEXT,
    "validity_days" INTEGER NOT NULL DEFAULT 30,
    "footer_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_templates_company_id_idx" ON "quote_templates"("company_id");

-- AddForeignKey
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
