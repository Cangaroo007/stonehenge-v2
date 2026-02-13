-- CreateTable
CREATE TABLE "edge_type_category_rates" (
    "id" SERIAL NOT NULL,
    "edge_type_id" TEXT NOT NULL,
    "fabrication_category" "FabricationCategory" NOT NULL,
    "rate20mm" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "rate40mm" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pricing_settings_id" TEXT NOT NULL,

    CONSTRAINT "edge_type_category_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "edge_type_category_rates_edge_type_id_fabrication_category_pr_key" ON "edge_type_category_rates"("edge_type_id", "fabrication_category", "pricing_settings_id");

-- AddForeignKey
ALTER TABLE "edge_type_category_rates" ADD CONSTRAINT "edge_type_category_rates_edge_type_id_fkey" FOREIGN KEY ("edge_type_id") REFERENCES "edge_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edge_type_category_rates" ADD CONSTRAINT "edge_type_category_rates_pricing_settings_id_fkey" FOREIGN KEY ("pricing_settings_id") REFERENCES "pricing_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
