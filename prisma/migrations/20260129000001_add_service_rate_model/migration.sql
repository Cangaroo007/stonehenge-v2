-- CreateEnum (only if doesn't exist)
DO $$ BEGIN
    CREATE TYPE "ServiceType" AS ENUM ('CUTTING', 'POLISHING', 'INSTALLATION', 'WATERFALL_END');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum (only if doesn't exist)
DO $$ BEGIN
    CREATE TYPE "RateUnit" AS ENUM ('LINEAR_METER', 'SQUARE_METER', 'FIXED', 'PER_KM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable (only if doesn't exist)
CREATE TABLE IF NOT EXISTS "service_rates" (
    "id" SERIAL NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rate20mm" DECIMAL(10,2) NOT NULL,
    "rate40mm" DECIMAL(10,2) NOT NULL,
    "unit" "RateUnit" NOT NULL,
    "minimumCharge" DECIMAL(10,2),
    "minimumQty" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (only if doesn't exist)
DO $$ BEGIN
    CREATE UNIQUE INDEX "service_rates_serviceType_key" ON "service_rates"("serviceType");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;
