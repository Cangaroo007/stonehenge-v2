-- SQL Script to Fix Failed Migration in Railway Database
-- Run this in Railway's PostgreSQL database

-- Step 1: Check the failed migration
SELECT migration_name, started_at, finished_at, applied_steps_count 
FROM "_prisma_migrations" 
WHERE migration_name = '20260129100252_add_lamination_summary';

-- Step 2: Mark it as rolled back (run this after verifying step 1)
UPDATE "_prisma_migrations" 
SET finished_at = NOW(), 
    applied_steps_count = 0,
    logs = 'Manually rolled back - column already exists'
WHERE migration_name = '20260129100252_add_lamination_summary';

-- Step 3: Verify the fix
SELECT migration_name, finished_at, applied_steps_count 
FROM "_prisma_migrations" 
WHERE migration_name = '20260129100252_add_lamination_summary';

-- Step 4: Verify the column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'slab_optimizations' 
AND column_name = 'laminationSummary';
