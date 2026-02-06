# Railway Deployment Issue - Prisma Migration P3009

## Current Problem

Railway deployment keeps crashing with this error:

```
Error: P3009

migrate found failed migrations in the target database, new migrations will not be applied.
The `20260129000001_add_service_rate_model` migration started at 2026-01-29 20:22:05.154986 UTC failed
```

## What We've Done

1. ✅ **Deleted the migration file** from code (`prisma/migrations/20260129000001_add_service_rate_model/`)
2. ✅ **Removed broken service-rates API files** that were causing build errors
3. ✅ **Added R2 environment variables** to Railway (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)
4. ✅ **Pushed all changes** to GitHub (commits are on main branch)
5. ❌ **Database cleanup FAILED** - The `_prisma_migrations` table appeared empty when we checked via Railway UI, but Prisma still sees the failed migration

## The Core Issue

The PostgreSQL database on Railway still has a failed migration record for `20260129000001_add_service_rate_model` in the `_prisma_migrations` table. Even though the table appeared empty when we viewed it in the Railway UI, Prisma continues to detect the failed migration and blocks all deployments.

## What Needs to Happen

We need to delete the failed migration record from the `_prisma_migrations` table in the Railway PostgreSQL database.

## Solution Options

### Option 1: SQL Command via Railway UI

1. Go to Railway dashboard → Click **Postgres** service (elephant icon)
2. Click **Database** tab → **Data** sub-tab
3. Click on the `_prisma_migrations` table
4. Find and delete any row with `migration_name = '20260129000001_add_service_rate_model'`

OR run this SQL query:

```sql
DELETE FROM "_prisma_migrations" 
WHERE migration_name = '20260129000001_add_service_rate_model';
```

### Option 2: Using Railway CLI

```bash
# Install Railway CLI (Mac with Homebrew)
brew install railway

# Login to Railway
railway login

# Link to the project
railway link

# Run SQL to delete the failed migration
railway run psql $DATABASE_URL -c "DELETE FROM \"_prisma_migrations\" WHERE migration_name = '20260129000001_add_service_rate_model';"
```

### Option 3: Direct PostgreSQL Connection

1. In Railway → Postgres service → **Database** tab → **Config** sub-tab
2. Copy the **DATABASE_URL** connection string
3. Install psql (if not installed): `brew install postgresql`
4. Connect: `psql "YOUR_DATABASE_URL_HERE"`
5. Run: `DELETE FROM "_prisma_migrations" WHERE migration_name = '20260129000001_add_service_rate_model';`
6. Verify: `SELECT * FROM "_prisma_migrations" WHERE migration_name LIKE '%service_rate%';`
7. Exit: `\q`

## Expected Outcome

After deleting the migration record from the database:

1. Railway deployment should build successfully
2. App should start without P3009 errors
3. Logs should show:
   ```
   ✓ Ready in XXXms
   [R2] Endpoint: ✅ configured
   [R2] Access Key: ✅ configured
   [R2] Secret Key: ✅ configured
   ```
4. Drawing upload to Cloudflare R2 should work

## Current Codebase State

- **Migrations folder**: Has 8 migrations (not 9 - the service_rate one is deleted)
- **Service-rates files**: Deleted (were causing TypeScript build errors)
- **R2 credentials**: Set in Railway environment variables
- **GitHub**: All changes pushed to main branch
- **Railway**: Configured to auto-deploy from GitHub main branch

## Questions for Troubleshooting

1. Why does the `_prisma_migrations` table appear empty in the Railway UI but Prisma still detects the failed migration?
2. Could there be a caching issue with Railway or Prisma?
3. Could the migration record be in a different schema or a different database instance?
4. Is there a way to force Prisma to ignore failed migrations without database access?

## Recent Logs

Latest deployment attempt timestamp: 2026-01-30T00:50:42.000000000Z

Error repeats in logs showing:
- "9 migrations found in prisma/migrations" (but code only has 8)
- Same P3009 error every time
- Continuous crash loop

## Contact Info

- GitHub Repo: https://github.com/Cangaroo007/stonehenge
- Railway Project: stonehenge (production environment)
- PostgreSQL Service: In same Railway project
