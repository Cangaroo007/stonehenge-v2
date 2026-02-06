#!/bin/bash
# Script to fix the failed migration in Railway database

echo "🔍 Step 1: Checking the failed migration..."
railway run psql -d $DATABASE_URL -c "SELECT migration_name, started_at, finished_at, applied_steps_count FROM \"_prisma_migrations\" WHERE migration_name = '20260129100252_add_lamination_summary';"

echo ""
echo "🔧 Step 2: Marking the failed migration as rolled back..."
railway run psql -d $DATABASE_URL -c "UPDATE \"_prisma_migrations\" SET finished_at = NOW(), applied_steps_count = 0, logs = 'Manually rolled back - column already exists' WHERE migration_name = '20260129100252_add_lamination_summary';"

echo ""
echo "✅ Step 3: Verifying the fix..."
railway run psql -d $DATABASE_URL -c "SELECT migration_name, finished_at, applied_steps_count FROM \"_prisma_migrations\" WHERE migration_name = '20260129100252_add_lamination_summary';"

echo ""
echo "🔍 Step 4: Checking if laminationSummary column exists..."
railway run psql -d $DATABASE_URL -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'slab_optimizations' AND column_name = 'laminationSummary';"

echo ""
echo "✅ Done! You can now redeploy on Railway."
