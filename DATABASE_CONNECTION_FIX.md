# Railway Database Connection Fix - CRITICAL

## 🔴 Current Issue

**Error:** `P1001: Can't reach database server at Postgres.railway.internal:5432`

**Root Cause:** The PostgreSQL database service is either:
1. Not running
2. Not properly linked to the stonehenge-v2 service
3. Using wrong connection credentials

---

## Quick Diagnosis Checklist

### Check #1: Is PostgreSQL Service Running?

In Railway Dashboard:
1. Go to your Project
2. Look for a **PostgreSQL** service card
3. Check if it shows "Active" status

**If you DON'T see a PostgreSQL service:**
- You need to add one (see Fix #1 below)

**If PostgreSQL shows "Crashed" or "Failed":**
- Click on it and check logs
- May need to restart or recreate

---

### Check #2: Are Services Linked?

In Railway Dashboard:
1. Click on your **stonehenge-v2** service
2. Go to **Settings** → **Service Variables**
3. Look for `DATABASE_URL` variable

**Should look like:**
```
postgresql://postgres:PASSWORD@Postgres.railway.internal:5432/railway
```

**If DATABASE_URL is missing or looks wrong:**
- Services aren't properly linked (see Fix #2 below)

---

### Check #3: Correct DATABASE_URL Format

The DATABASE_URL should be automatically provided by Railway when you link the database.

**Correct format:**
```
postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway
```

**Note:** The hostname might be lowercase `postgres.railway.internal` not `Postgres.railway.internal`

---

## Fix #1: Add PostgreSQL Database (If Missing)

If you don't have a PostgreSQL service in your project:

### Via Railway Dashboard:

1. Go to your Project
2. Click **"+ New"** button
3. Select **"Database"**
4. Choose **"PostgreSQL"**
5. Railway will create and start the database
6. Go to Step 2 to link it

---

## Fix #2: Link Database to App Service

### Option A: Automatic (Recommended)

1. Go to your Project in Railway
2. Click on **stonehenge-v2** service
3. Go to **Settings** tab
4. Scroll down to **Service Variables**
5. Look for a section about **"Reference Variables"** or **"Add Service"**
6. Click **"+ New Variable"**
7. Select **"Reference"** → Choose your PostgreSQL service
8. This should automatically add `DATABASE_URL`

### Option B: Manual

1. Click on your **PostgreSQL** service
2. Go to **Variables** or **Connect** tab
3. Copy the **Connection URL** (should look like `postgresql://...`)
4. Go to **stonehenge-v2** service
5. Go to **Variables** tab
6. Add a new variable:
   - Key: `DATABASE_URL`
   - Value: Paste the connection URL
7. **IMPORTANT:** Add `?sslmode=disable` to the end:
   ```
   postgresql://postgres:PASSWORD@postgres.railway.internal:5432/railway?sslmode=disable
   ```

---

## Fix #3: Check Database Service Health

### In Railway Dashboard:

1. Click on **PostgreSQL** service
2. Check the **Deployments** tab
3. Look at the logs - should show:
   ```
   database system is ready to accept connections
   ```

### If Database is Unhealthy:

1. Go to **Settings** → **Restart Service**
2. Wait for it to restart (usually 30-60 seconds)
3. Check logs again

---

## Fix #4: Update railway.toml (Use Private URL)

Railway provides two database URLs:
- `DATABASE_URL` - Private internal URL (faster, more reliable)
- `DATABASE_PUBLIC_URL` - Public URL (for external access)

**Update your `railway.toml`:**

```toml
[build]
buildCommand = "npx prisma generate && npm run build"

[build.cache]
paths = ["node_modules", ".next/cache"]

[deploy]
# Use DATABASE_URL instead of DATABASE_PUBLIC_URL for internal connections
startCommand = "npx prisma migrate deploy && npm run start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**Remove any explicit `DATABASE_URL="$DATABASE_PUBLIC_URL"` override!**

Railway will automatically inject the correct `DATABASE_URL` as an environment variable.

---

## Fix #5: Verify Railway Service Dependencies

Railway might be starting your app before the database is ready.

### Add Service Dependency:

1. In Railway Dashboard, go to **stonehenge-v2** service
2. Go to **Settings** tab
3. Look for **"Service Dependencies"** or **"Start Order"**
4. Add PostgreSQL as a dependency
5. This ensures PostgreSQL starts before your app

---

## Step-by-Step Fix Process

### Step 1: Verify Database Exists and is Running

```bash
# Using Railway CLI
railway status

# Should show both services:
# - stonehenge-v2 (web)
# - postgresql (database)
```

### Step 2: Check DATABASE_URL is Set

```bash
# Using Railway CLI
railway variables

# Look for DATABASE_URL in the output
```

### Step 3: Test Database Connection Manually

```bash
# Using Railway CLI - connect to your app's shell
railway run bash

# Once inside, try connecting to the database
npx prisma db push --preview-feature

# Or test with psql if available
psql $DATABASE_URL -c "SELECT 1;"
```

### Step 4: Update Code (if needed)

If the issue is with our `railway.toml` trying to override DATABASE_URL:

```bash
cd /Users/seanstone/Downloads/stonehenge-v2

# Edit railway.toml to remove DATABASE_URL override
# The file should NOT manually set DATABASE_URL
```

### Step 5: Redeploy

```bash
git add railway.toml
git commit -m "Fix: Remove DATABASE_URL override in railway.toml"
git push origin main
```

---

## Most Likely Solution

Based on the error, here's what probably happened:

### The Issue:
Our previous `railway.toml` had:
```toml
startCommand = "DATABASE_URL=\"$DATABASE_PUBLIC_URL\" npx prisma migrate deploy..."
```

We changed it to:
```toml
startCommand = "npx prisma migrate deploy && npm run start"
```

**BUT** Railway might not have a `DATABASE_URL` environment variable set because the services aren't linked!

### The Fix:

**In Railway Dashboard:**

1. **Go to PostgreSQL service** → **Variables** or **Connect** tab
2. **Copy the internal connection URL** (should have `postgres.railway.internal`)
3. **Go to stonehenge-v2 service** → **Variables** tab
4. **Click "+ New Variable"**
5. **Add:**
   - Name: `DATABASE_URL`
   - Value: `postgresql://postgres:[PASSWORD]@postgres.railway.internal:5432/railway?sslmode=disable`
   
   (Use the actual password from the PostgreSQL service)

6. **Save**
7. **Redeploy** from Deployments tab

---

## Expected Behavior After Fix

When properly configured, you should see:

```
Starting Container
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "railway", schema "public" at "postgres.railway.internal:5432"

11 migrations found in prisma/migrations

No pending migrations to apply.

> stonehenge@0.1.0 start
> next start -H 0.0.0.0 -p ${PORT:-3000}

✓ Ready in 430ms
```

---

## Troubleshooting Commands

### Check if Railway CLI is Linked:
```bash
railway whoami
railway status
```

### View Environment Variables:
```bash
railway variables
```

### View Database Logs:
```bash
railway logs --service postgresql
```

### View App Logs:
```bash
railway logs
```

### Force Redeploy:
```bash
railway up --detach
```

---

## Alternative: Create New PostgreSQL Service

If nothing works, create a fresh database:

1. **Remove old PostgreSQL service** (if exists and broken)
2. **Add new PostgreSQL service:**
   - Click "+ New" → "Database" → "PostgreSQL"
3. **Link to your app:**
   - Railway should automatically inject `DATABASE_URL`
4. **Redeploy your app**
5. **Run migrations:**
   ```bash
   railway run npm run db:migrate
   railway run npm run db:seed
   ```

---

## Critical Action Required NOW

🚨 **You need to set up the DATABASE_URL in Railway Dashboard:**

1. Check if PostgreSQL service exists and is running
2. Get the connection URL from PostgreSQL service
3. Add it as `DATABASE_URL` variable in stonehenge-v2 service
4. Make sure it ends with `?sslmode=disable`
5. Redeploy

**Without a proper DATABASE_URL, the app cannot start.**

---

## Summary

**Problem:** App can't reach PostgreSQL database  
**Cause:** DATABASE_URL not properly configured or services not linked  
**Fix:** Set DATABASE_URL in Railway Variables using the internal connection URL  
**Time:** 5-10 minutes  

**Next Action:** Go to Railway Dashboard and set up DATABASE_URL variable.
