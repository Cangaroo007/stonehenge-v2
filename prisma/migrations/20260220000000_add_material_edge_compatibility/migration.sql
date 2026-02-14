-- CreateTable
CREATE TABLE "material_edge_compatibility" (
    "id" SERIAL NOT NULL,
    "fabrication_category" "FabricationCategory" NOT NULL,
    "edge_type_id" TEXT NOT NULL,
    "is_allowed" BOOLEAN NOT NULL DEFAULT true,
    "warning_message" TEXT,
    "pricing_settings_id" TEXT NOT NULL,

    CONSTRAINT "material_edge_compatibility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_edge_compatibility_fabrication_category_edge_type_id_key" ON "material_edge_compatibility"("fabrication_category", "edge_type_id", "pricing_settings_id");

-- AddForeignKey
ALTER TABLE "material_edge_compatibility" ADD CONSTRAINT "material_edge_compatibility_edge_type_id_fkey" FOREIGN KEY ("edge_type_id") REFERENCES "edge_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_edge_compatibility" ADD CONSTRAINT "material_edge_compatibility_pricing_settings_id_fkey" FOREIGN KEY ("pricing_settings_id") REFERENCES "pricing_settings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
