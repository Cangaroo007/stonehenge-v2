-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "client_tier_id" TEXT,
ADD COLUMN     "client_type_id" TEXT;

-- AlterTable
ALTER TABLE "quote_files" ADD COLUMN     "analysis_json" JSONB;

-- CreateTable
CREATE TABLE "quote_drawing_analyses" (
    "id" SERIAL NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "analyzed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "drawing_type" TEXT NOT NULL,
    "raw_results" JSONB NOT NULL,
    "metadata" JSONB,
    "imported_pieces" TEXT[],

    CONSTRAINT "quote_drawing_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edge_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'polish',
    "baseRate" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edge_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cutout_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseRate" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cutout_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thickness_options" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "thickness_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules_engine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "clientTypeId" TEXT,
    "clientTierId" TEXT,
    "customerId" INTEGER,
    "minQuoteValue" DECIMAL(10,2),
    "maxQuoteValue" DECIMAL(10,2),
    "thicknessValue" INTEGER,
    "adjustmentType" TEXT NOT NULL,
    "adjustmentValue" DECIMAL(10,4) NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_engine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rule_edges" (
    "id" TEXT NOT NULL,
    "pricingRuleId" TEXT NOT NULL,
    "edgeTypeId" TEXT NOT NULL,
    "customRate" DECIMAL(10,2),
    "adjustmentType" TEXT,
    "adjustmentValue" DECIMAL(10,4),

    CONSTRAINT "pricing_rule_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rule_cutouts" (
    "id" TEXT NOT NULL,
    "pricingRuleId" TEXT NOT NULL,
    "cutoutTypeId" TEXT NOT NULL,
    "customRate" DECIMAL(10,2),
    "adjustmentType" TEXT,
    "adjustmentValue" DECIMAL(10,4),

    CONSTRAINT "pricing_rule_cutouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rule_materials" (
    "id" TEXT NOT NULL,
    "pricingRuleId" TEXT NOT NULL,
    "materialId" INTEGER NOT NULL,
    "customRate" DECIMAL(10,2),
    "adjustmentType" TEXT,
    "adjustmentValue" DECIMAL(10,4),

    CONSTRAINT "pricing_rule_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_drawing_analyses_quote_id_key" ON "quote_drawing_analyses"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "edge_types_name_key" ON "edge_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cutout_types_name_key" ON "cutout_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "thickness_options_name_key" ON "thickness_options"("name");

-- CreateIndex
CREATE UNIQUE INDEX "client_types_name_key" ON "client_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "client_tiers_name_key" ON "client_tiers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rule_edges_pricingRuleId_edgeTypeId_key" ON "pricing_rule_edges"("pricingRuleId", "edgeTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rule_cutouts_pricingRuleId_cutoutTypeId_key" ON "pricing_rule_cutouts"("pricingRuleId", "cutoutTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_rule_materials_pricingRuleId_materialId_key" ON "pricing_rule_materials"("pricingRuleId", "materialId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_client_type_id_fkey" FOREIGN KEY ("client_type_id") REFERENCES "client_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_client_tier_id_fkey" FOREIGN KEY ("client_tier_id") REFERENCES "client_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_drawing_analyses" ADD CONSTRAINT "quote_drawing_analyses_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules_engine" ADD CONSTRAINT "pricing_rules_engine_clientTypeId_fkey" FOREIGN KEY ("clientTypeId") REFERENCES "client_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules_engine" ADD CONSTRAINT "pricing_rules_engine_clientTierId_fkey" FOREIGN KEY ("clientTierId") REFERENCES "client_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rules_engine" ADD CONSTRAINT "pricing_rules_engine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rule_edges" ADD CONSTRAINT "pricing_rule_edges_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "pricing_rules_engine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rule_edges" ADD CONSTRAINT "pricing_rule_edges_edgeTypeId_fkey" FOREIGN KEY ("edgeTypeId") REFERENCES "edge_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rule_cutouts" ADD CONSTRAINT "pricing_rule_cutouts_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "pricing_rules_engine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rule_cutouts" ADD CONSTRAINT "pricing_rule_cutouts_cutoutTypeId_fkey" FOREIGN KEY ("cutoutTypeId") REFERENCES "cutout_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rule_materials" ADD CONSTRAINT "pricing_rule_materials_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "pricing_rules_engine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_rule_materials" ADD CONSTRAINT "pricing_rule_materials_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
