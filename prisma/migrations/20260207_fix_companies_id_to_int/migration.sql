-- AlterTable: Fix companies.id from UUID/String to Int
-- The database already has integer IDs, so this migration just updates the schema to match

-- This is a schema-only change. The database already has:
-- - companies.id as INTEGER
-- - user.company_id as INTEGER  
-- We're just updating Prisma's understanding to match reality.

-- No actual database changes needed - marking as applied
SELECT 1;
