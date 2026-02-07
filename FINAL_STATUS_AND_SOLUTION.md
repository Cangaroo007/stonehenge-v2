# Stonehenge V2 - Final Status & Remaining Issue

## Progress Made ✅

### Fixed Issues:
1. ✅ **Railway configuration** - Matched working v1 setup
2. ✅ **Database connection** - Using PUBLIC_URL works for migrations
3. ✅ **Build process** - Completes successfully 
4. ✅ **App startup** - Next.js starts and shows "Ready"
5. ✅ **Migrations** - All 16 migrations apply successfully

## Remaining Issue ❌

**Problem:** 502 "Application failed to respond" despite app being "Ready"

**Root Cause:** The PostgreSQL database at `Postgres.railway.internal` doesn't exist/isn't reachable. We're using the PUBLIC proxy URL which works for migrations but something is preventing Railway from routing traffic to the app.

## Current Configuration

```toml
# railway.toml
[deploy]
startCommand = "npx prisma migrate deploy && npm run start"
```

```json
// package.json
"start": "next start"
```

```
# Environment
DATABASE_URL=postgresql://...@switchyard.proxy.rlwy.net:40455/railway?sslmode=disable
PORT=8080
```

## Why 502 Persists

The app logs show:
```
✓ Ready in 367ms
- Local: http://localhost:8080
```

But Railway edge returns 502. This suggests:

### Hypothesis: Missing PostgreSQL Service Link

The `Postgres.railway.internal` hostname not resolving means:
- PostgreSQL service doesn't exist in the v2 project, OR
- PostgreSQL service isn't properly linked to stonehenge-v2 service

**Railway provides two connection methods:**
1. **Internal** (`*.railway.internal`) - Fast, direct connection between services
2. **Public** (`switchyard.proxy.rlwy.net`) - External proxy, slower

We're using the public URL because internal doesn't exist!

## Solution Required

### IN RAILWAY DASHBOARD:

#### Step 1: Check if PostgreSQL Exists
1. Go to "friendly-simplicity" project
2. Look for a **PostgreSQL service card**
3. If it doesn't exist → **ADD IT**

#### Step 2: Add PostgreSQL Service (if missing)
1. Click "+ New"
2. Select "Database"
3. Choose "PostgreSQL"
4. Wait for it to provision (~1 minute)

#### Step 3: Link Services
1. Click on **stonehenge-v2** service
2. Go to **Settings** → **Service Variables**
3. Click "+ New Variable"  
4. Select **"Reference"**
5. Choose your **PostgreSQL** service
6. This should auto-inject `DATABASE_URL` with the internal URL

#### Step 4: Verify DATABASE_URL
After linking, the DATABASE_URL should look like:
```
postgresql://postgres:PASSWORD@Postgres.railway.internal:5432/railway
```

NOT:
```
postgresql://...@switchyard.proxy.rlwy.net:40455/railway
```

#### Step 5: Redeploy
1. Go to Deployments
2. Click "Redeploy"
3. Watch logs for successful connection

## Expected Success Output

```
Starting Container
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "railway", schema "public" at "Postgres.railway.internal:5432"

16 migrations found in prisma/migrations
No pending migrations to apply.

> stonehenge@0.1.0 start
> next start

   ▲ Next.js 14.1.0
   - Local:        http://localhost:8080

 ✓ Ready in 367ms
```

Then when you visit the URL:
- ✅ https://stonehenge-v2-production.up.railway.app/api/health returns `{"status": "ok"}`
- ✅ https://stonehenge-v2-production.up.railway.app/ shows login page

## Alternative: If PostgreSQL Service Exists

If the PostgreSQL service DOES exist but isn't linked:

### Check Service Name:
```bash
cd /Users/seanstone/Downloads/stonehenge-v2
railway service list
```

### Force Link Database:
In Railway Dashboard:
1. Go to PostgreSQL service
2. Copy the **internal connection URL** (should have `.railway.internal`)
3. Go to stonehenge-v2 service
4. Variables → Edit `DATABASE_URL`
5. Replace with the internal URL
6. Remove our manual `?sslmode=disable` - let Railway handle SSL
7. Redeploy

## Why This Matters

The 502 error is likely because:
- Railway's health check can't reach the database through the public proxy
- Or there's a timeout issue with the external connection
- Or Railway expects services to use internal networking

Using the internal `railway.internal` hostname is the **correct** Railway pattern.

## Next Actions

**YOU NEED TO DO THIS IN RAILWAY DASHBOARD:**

1. Check if PostgreSQL service exists in friendly-simplicity project
2. If not, add it
3. Link it to stonehenge-v2
4. Let Railway inject the correct DATABASE_URL
5. Redeploy

**DO NOT** manually set DATABASE_URL to the public proxy URL - that's what we did as a workaround, but it's not the correct solution.

## Files Changed

Latest commit: `1a6aba2`  
- `railway.toml` - Simplified to match v1
- `package.json` - Removed all port/host flags  
- `next.config.js` - Removed standalone mode

## Summary

**We fixed everything EXCEPT the database service link problem.**

The app is ready to run - it just needs a properly linked PostgreSQL service using internal Railway networking.

Once the PostgreSQL service is linked correctly, the app should work immediately.

---

**Status:** 🟡 Awaiting Railway Dashboard configuration to link PostgreSQL service properly
