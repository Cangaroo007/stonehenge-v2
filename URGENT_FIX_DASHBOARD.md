# URGENT FIX NEEDED - Railway Dashboard

## Problem Found ✅

`Postgres.railway.internal` hostname **does not exist** in your Railway environment. DNS lookup returns `NXDOMAIN`.

This means the private networking between services isn't configured properly.

## Solution: Use Public Database URL

Since private networking doesn't work, we must use the **public** database URL.

---

## DO THIS NOW in Railway Dashboard:

### Step 1: Update DATABASE_URL Variable

1. Go to Railway Dashboard → **stonehenge-v2** service
2. Click **Variables** tab
3. Find `DATABASE_URL`
4. Click the **three dots** (...) → **Edit**
5. **Remove the Variable Reference**
6. Set it to **Raw Value** instead
7. **Copy this value** from the `DATABASE_PUBLIC_URL` variable:
   ```
   postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway
   ```
8. Click **Save**

### Step 2: Redeploy

1. Go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment
3. Wait ~2 minutes for deployment to complete

---

## What This Does

The latest code (commit `46b6613`) now:
```toml
startCommand = "DATABASE_URL=$DATABASE_PUBLIC_URL npx prisma migrate deploy && npm run start"
```

This tells Railway:
1. Use `DATABASE_PUBLIC_URL` for migrations (works externally)
2. App runtime will use whatever `DATABASE_URL` is set to

By setting `DATABASE_URL` to the same public URL, everything uses the working connection.

---

## Why Private Networking Doesn't Work

Possible reasons:
1. Postgres service name is capitalized (`Postgres`) but should be lowercase (`postgres`)
2. Services are in different Railway regions
3. Private networking isn't enabled for your project
4. There's a Railway configuration issue

**For now:** Public URL works fine. You can investigate private networking later.

---

## Expected Result After Fix

**Logs should show:**
```
Starting Container
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "railway", schema "public" at "switchyard.proxy.rlwy.net:40455"

16 migrations found in prisma/migrations
No pending migrations to apply.

> stonehenge@0.1.0 start
> next start

   ▲ Next.js 14.1.0
   - Local:        http://localhost:8080

 ✓ Ready in 390ms
```

**Then test:**
```bash
curl https://stonehenge-v2-production.up.railway.app/api/health
```

Should return:
```json
{"status":"ok","database":"connected","timestamp":"..."}
```

---

## Quick Steps Summary

1. ✅ Go to stonehenge-v2 Variables
2. ✅ Edit DATABASE_URL → Change from Reference to Raw Value
3. ✅ Set value to: `postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway`
4. ✅ Save
5. ✅ Redeploy
6. ✅ Test with curl command above

---

**This should finally work!** 🤞

The app has been waiting to run properly - we just need the database connection to use the public URL since private networking isn't available.
