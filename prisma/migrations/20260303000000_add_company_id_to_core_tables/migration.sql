-- Add company_id to quotes (nullable first, backfill, then NOT NULL)
ALTER TABLE "quotes" ADD COLUMN "company_id" INTEGER;
UPDATE "quotes" SET "company_id" = 1;
ALTER TABLE "quotes" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "quotes_company_id_idx" ON "quotes"("company_id");

-- Add company_id to customers (nullable first, backfill, then NOT NULL)
ALTER TABLE "customers" ADD COLUMN "company_id" INTEGER;
UPDATE "customers" SET "company_id" = 1;
ALTER TABLE "customers" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "customers_company_id_idx" ON "customers"("company_id");

-- Add company_id to materials (nullable first, backfill, then NOT NULL)
ALTER TABLE "materials" ADD COLUMN "company_id" INTEGER;
UPDATE "materials" SET "company_id" = 1;
ALTER TABLE "materials" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "materials" ADD CONSTRAINT "materials_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "materials_company_id_idx" ON "materials"("company_id");

-- Add company_id to unit_block_projects (nullable first, backfill, then NOT NULL)
ALTER TABLE "unit_block_projects" ADD COLUMN "company_id" INTEGER;
UPDATE "unit_block_projects" SET "company_id" = 1;
ALTER TABLE "unit_block_projects" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "unit_block_projects" ADD CONSTRAINT "unit_block_projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "unit_block_projects_company_id_idx" ON "unit_block_projects"("company_id");

-- Migrate pricing_settings from hardcoded 'default-org' to company-scoped ID
UPDATE "pricing_settings" SET "organisation_id" = 'company-1' WHERE "organisation_id" = 'default-org';
-- Also handle the legacy '1' org ID if it exists
UPDATE "pricing_settings" SET "organisation_id" = 'company-1' WHERE "organisation_id" = '1';
