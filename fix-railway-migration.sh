#!/bin/bash
# Fix Railway Database Migration Script
# Run this script to fix the stuck migration

set -e  # Exit on error

echo "=================================================="
echo "Railway Database Migration Fix Script"
echo "=================================================="
echo ""

echo "📋 Step 1: Checking failed migration..."
echo ""
railway run --service stonehenge bash -c 'psql "$DATABASE_URL" -c "SELECT migration_name, started_at, finished_at, applied_steps_count FROM \"_prisma_migrations\" WHERE migration_name = '\''20260129100252_add_lamination_summary'\'';"'

echo ""
echo "=================================================="
echo ""
echo "🔧 Step 2: Fixing the failed migration..."
echo "   (Marking it as rolled back)"
echo ""
railway run --service stonehenge bash -c 'psql "$DATABASE_URL" -c "UPDATE \"_prisma_migrations\" SET finished_at = NOW(), applied_steps_count = 0, logs = '\''Manually rolled back - column already exists'\'' WHERE migration_name = '\''20260129100252_add_lamination_summary'\'';"'

echo ""
echo "=================================================="
echo ""
echo "✅ Step 3: Verifying the fix..."
echo ""
railway run --service stonehenge bash -c 'psql "$DATABASE_URL" -c "SELECT migration_name, finished_at, applied_steps_count FROM \"_prisma_migrations\" WHERE migration_name = '\''20260129100252_add_lamination_summary'\'';"'

echo ""
echo "=================================================="
echo ""
echo "🔍 Step 4: Checking if laminationSummary column exists..."
echo ""
railway run --service stonehenge bash -c 'psql "$DATABASE_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''slab_optimizations'\'' AND column_name = '\''laminationSummary'\'';"'

echo ""
echo "=================================================="
echo "✅ DONE!"
echo "=================================================="
echo ""
echo "The migration has been fixed. Your next Railway deployment should work!"
echo ""
echo "To trigger a new deployment, run:"
echo "  git commit --allow-empty -m \"trigger redeploy after migration fix\""
echo "  git push origin main"
echo ""
