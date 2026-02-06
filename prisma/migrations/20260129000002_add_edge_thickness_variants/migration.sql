-- AlterTable: Add new columns to edge_types
ALTER TABLE "edge_types" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "edge_types" ADD COLUMN IF NOT EXISTS "rate20mm" DECIMAL(10,2);
ALTER TABLE "edge_types" ADD COLUMN IF NOT EXISTS "rate40mm" DECIMAL(10,2);
ALTER TABLE "edge_types" ADD COLUMN IF NOT EXISTS "minimumCharge" DECIMAL(10,2);
ALTER TABLE "edge_types" ADD COLUMN IF NOT EXISTS "minimumLength" DECIMAL(10,2);
ALTER TABLE "edge_types" ADD COLUMN IF NOT EXISTS "isCurved" BOOLEAN NOT NULL DEFAULT false;

-- Migrate existing baseRate to rate20mm and rate40mm (if they're null)
UPDATE "edge_types" 
SET "rate20mm" = 0, "rate40mm" = 0 
WHERE "rate20mm" IS NULL AND "rate40mm" IS NULL;

-- Create unique index on code (only if not exists)
DO $$ BEGIN
    CREATE UNIQUE INDEX "edge_types_code_key" ON "edge_types"("code");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;
