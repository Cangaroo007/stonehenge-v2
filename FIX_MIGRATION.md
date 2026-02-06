# Fix Failed Prisma Migration

## Problem
Migration `20260129100252_add_lamination_summary` is stuck in failed state.
The column `laminationSummary` already exists in the database, but Prisma keeps trying to re-run the migration.

## Solution

Connect to Railway's PostgreSQL database and manually mark the migration as applied.

### Step 1: Connect to Railway Database

In Railway dashboard:
1. Go to your Postgres service
2. Click "Connect"
3. Copy the connection command (should look like this):

```bash
psql postgresql://postgres:PASSWORD@HOST:PORT/railway
```

### Step 2: Mark Migration as Applied

Once connected, run:

```sql
-- Mark the failed migration as rolled back
UPDATE "_prisma_migrations" 
SET finished_at = NOW(), 
    applied_steps_count = 0
WHERE migration_name = '20260129100252_add_lamination_summary';
```

### Step 3: Redeploy

After running the SQL command:
1. Go back to Railway deployment
2. Click "Redeploy" or trigger a new deploy

The migration should now be skipped since it's already applied.

---

## Alternative: Use Prisma CLI (If you have local access to production DB)

```bash
# Mark migration as applied without running it
npx prisma migrate resolve --applied 20260129100252_add_lamination_summary --schema ./prisma/schema.prisma
```

But this requires your DATABASE_URL to point to production, which is risky.

---

## What Happened?

The migration likely:
1. Started running
2. Created the column successfully
3. Then crashed for some other reason
4. Prisma marked it as "failed" even though the column was created
5. Now it tries to re-run and fails because column exists

This is why we need to manually tell Prisma: "Yes, this migration is done."
