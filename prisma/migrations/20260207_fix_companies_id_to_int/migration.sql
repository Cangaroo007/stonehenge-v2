-- AlterTable: Fix companies.id from UUID/String to Int
-- This matches the actual data in the database which uses integer IDs

-- First, drop the foreign key constraint from user table
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "user_company_id_fkey";

-- Alter companies.id from UUID to INTEGER
-- Note: This assumes the existing data is already integers stored incorrectly as strings
-- If there's existing UUID data, this would need a data migration first
ALTER TABLE "companies" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "companies" ALTER COLUMN "id" SET DATA TYPE INTEGER USING "id"::INTEGER;
ALTER TABLE "companies" ALTER COLUMN "id" SET DEFAULT nextval(pg_get_serial_sequence('companies', 'id'));

-- Create sequence if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS companies_id_seq OWNED BY "companies"."id";
SELECT setval('companies_id_seq', (SELECT COALESCE(MAX(id), 1) FROM "companies"));
ALTER TABLE "companies" ALTER COLUMN "id" SET DEFAULT nextval('companies_id_seq');

-- Alter user.company_id from UUID to INTEGER
ALTER TABLE "user" ALTER COLUMN "company_id" SET DATA TYPE INTEGER USING "company_id"::INTEGER;

-- Recreate the foreign key constraint
ALTER TABLE "user" ADD CONSTRAINT "user_company_id_fkey" 
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") 
  ON DELETE NO ACTION ON UPDATE NO ACTION;
