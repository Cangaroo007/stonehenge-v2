-- CreateEnum: MaterialPricingBasis
CREATE TYPE "MaterialPricingBasis" AS ENUM ('PER_SLAB', 'PER_SQUARE_METRE');

-- CreateEnum: ServiceUnit
CREATE TYPE "ServiceUnit" AS ENUM ('LINEAR_METRE', 'SQUARE_METRE', 'FIXED', 'PER_SLAB', 'PER_KILOMETRE');

-- CreateEnum: UnitSystem
CREATE TYPE "UnitSystem" AS ENUM ('METRIC', 'IMPERIAL');

-- CreateEnum: CutoutRateCategory
CREATE TYPE "CutoutRateCategory" AS ENUM ('HOTPLATE', 'GPO', 'TAP_HOLE', 'DROP_IN_SINK', 'UNDERMOUNT_SINK', 'FLUSH_COOKTOP', 'BASIN', 'DRAINER_GROOVES', 'OTHER');

-- Add new values to ServiceType enum
ALTER TYPE "ServiceType" ADD VALUE 'TEMPLATING';
ALTER TYPE "ServiceType" ADD VALUE 'DELIVERY';

-- CreateTable: pricing_settings
CREATE TABLE "pricing_settings" (
    "id" TEXT NOT NULL,
    "organisation_id" TEXT NOT NULL,
    "material_pricing_basis" "MaterialPricingBasis" NOT NULL DEFAULT 'PER_SLAB',
    "cutting_unit" "ServiceUnit" NOT NULL DEFAULT 'LINEAR_METRE',
    "polishing_unit" "ServiceUnit" NOT NULL DEFAULT 'LINEAR_METRE',
    "installation_unit" "ServiceUnit" NOT NULL DEFAULT 'SQUARE_METRE',
    "unit_system" "UnitSystem" NOT NULL DEFAULT 'METRIC',
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "gst_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique organisation_id
CREATE UNIQUE INDEX "pricing_settings_organisation_id_key" ON "pricing_settings"("organisation_id");

-- Migrate service_rates: drop old data, recreate with new structure
-- Drop old unique index and constraints
DROP INDEX IF EXISTS "service_rates_serviceType_key";

-- Drop the old service_rates table (data will be re-seeded)
DROP TABLE IF EXISTS "service_rates";

-- Recreate service_rates with new structure
CREATE TABLE "service_rates" (
    "id" TEXT NOT NULL,
    "pricing_settings_id" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rate20mm" DECIMAL(10,2) NOT NULL,
    "rate40mm" DECIMAL(10,2) NOT NULL,
    "minimumCharge" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: composite unique on service_rates
CREATE UNIQUE INDEX "service_rates_pricing_settings_id_serviceType_key" ON "service_rates"("pricing_settings_id", "serviceType");

-- AddForeignKey: service_rates -> pricing_settings
ALTER TABLE "service_rates" ADD CONSTRAINT "service_rates_pricing_settings_id_fkey" FOREIGN KEY ("pricing_settings_id") REFERENCES "pricing_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: cutout_rates
CREATE TABLE "cutout_rates" (
    "id" TEXT NOT NULL,
    "pricing_settings_id" TEXT NOT NULL,
    "cutout_type" "CutoutRateCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rate" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cutout_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: composite unique on cutout_rates
CREATE UNIQUE INDEX "cutout_rates_pricing_settings_id_cutout_type_key" ON "cutout_rates"("pricing_settings_id", "cutout_type");

-- AddForeignKey: cutout_rates -> pricing_settings
ALTER TABLE "cutout_rates" ADD CONSTRAINT "cutout_rates_pricing_settings_id_fkey" FOREIGN KEY ("pricing_settings_id") REFERENCES "pricing_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: materials - add slab pricing fields
ALTER TABLE "materials" ADD COLUMN "price_per_slab" DECIMAL(10,2);
ALTER TABLE "materials" ADD COLUMN "price_per_square_metre" DECIMAL(10,2);
ALTER TABLE "materials" ADD COLUMN "slab_length_mm" INTEGER;
ALTER TABLE "materials" ADD COLUMN "slab_width_mm" INTEGER;
