# Railway Production Deployment Fix Guide

## Current Issue

**Status:** 🔴 Application failed to respond  
**URL:** stonehenge-production.up.railway.app  
**Error:** Request ID: Ab47WgVmRK0Bch3tLPU1MQ

---

## Root Causes (Likely Issues)

### 1. 🔴 Database SSL Connection (Same as Local)
The production DATABASE_URL is using the Railway PostgreSQL connection without SSL parameters, causing the same TLS certificate error we had locally.

### 2. 🔴 Double Migration Execution
The Railway config runs migrations twice:
- Once in `railway.toml`: `npx prisma migrate deploy && npm run start`
- Again in `package.json` start script: `prisma migrate deploy && next start`

This is redundant and could cause timing issues.

### 3. ⚠️ Missing Environment Variables
Railway deployment might be missing critical environment variables.

---

## Quick Fix (In Railway Dashboard)

### Step 1: Fix Database Connection String ⚡ CRITICAL

1. Go to **Railway Dashboard** → Your Project → **Variables** tab
2. Find the `DATABASE_URL` variable (should be auto-generated)
3. Edit it to add `?sslmode=disable` at the end:

```bash
# Example - yours will have different credentials:
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:PORT/railway?sslmode=disable
```

**Note:** Just add `?sslmode=disable` to the end of your existing DATABASE_URL

---

### Step 2: Check Environment Variables

Make sure these are set in **Railway → Variables**:

**Critical:**
- `DATABASE_URL` - (with ?sslmode=disable)
- `JWT_SECRET` - Set to a strong random value (NOT the example from .env!)
- `NODE_ENV=production`

**Application (copy from your .env):**
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_CURRENCY`
- `NEXT_PUBLIC_TAX_RATE`
- `NEXT_PUBLIC_TAX_NAME`
- All `COMPANY_*` variables

---

### Step 3: Trigger Redeploy

After updating variables:
1. Go to **Deployments** tab in Railway
2. Click **Redeploy** on the latest deployment
3. Watch the logs for errors

---

## Detailed Fix (Update Code + Redeploy)

If the quick fix doesn't work, update your code:

### Fix 1: Update package.json

Change the start script to remove duplicate migration:

```json
{
  "scripts": {
    "start": "next start"
  }
}
```

**Current start script:**
```json
"start": "prisma migrate deploy && next start"
```

**Change to:**
```json
"start": "next start"
```

Railway will handle migrations via `railway.toml`.

---

### Fix 2: Update railway.toml (Optional Alternative)

If you prefer migrations in package.json, update railway.toml:

```toml
[build]
buildCommand = "npx prisma generate && npm run build"

[build.cache]
paths = ["node_modules", ".next/cache"]

[deploy]
startCommand = "npm run start"
```

**Remove** `npx prisma migrate deploy &&` from startCommand since package.json already does it.

---

## Checking Railway Logs

To see what's actually failing:

1. **Railway Dashboard** → Your Project → **Deployments**
2. Click on the latest deployment
3. Look for errors in:
   - **Build Logs** - Check if build succeeded
   - **Deploy Logs** - Check if deployment started
   - **Application Logs** - Check for runtime errors

### Common Errors You Might See:

**"Error opening a TLS connection: bad certificate format"**
- **Fix:** Add `?sslmode=disable` to DATABASE_URL

**"P1001: Can't reach database server"**
- **Fix:** Check DATABASE_URL is correct
- **Fix:** Ensure PostgreSQL service is running in Railway

**"Module not found" or build errors**
- **Fix:** Check all dependencies are in package.json
- **Fix:** Clear build cache and redeploy

**"Port already in use" or timeout**
- **Fix:** Ensure Next.js is using Railway's PORT variable (should be automatic)

---

## Complete Environment Variables List

Copy these to **Railway → Variables** (update values as needed):

```bash
# Database (Railway auto-generates, just add ?sslmode=disable)
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:PORT/railway?sslmode=disable

# Security
JWT_SECRET=generate-a-strong-random-secret-here-DO-NOT-USE-EXAMPLE
NODE_ENV=production

# Application
NEXT_PUBLIC_APP_NAME=Stone Henge
NEXT_PUBLIC_CURRENCY=AUD
NEXT_PUBLIC_TAX_RATE=10
NEXT_PUBLIC_TAX_NAME=GST

# Company Details
COMPANY_NAME=Northcoast Stone Pty Ltd
COMPANY_ABN=57 120 880 355
COMPANY_ADDRESS=20 Hitech Drive, KUNDA PARK Queensland 4556, Australia
COMPANY_PHONE=0754767636
COMPANY_FAX=0754768636
COMPANY_EMAIL=admin@northcoaststone.com.au

# Google Maps (optional but recommended)
GOOGLE_MAPS_API_KEY=your-google-maps-api-key

# R2 Storage (optional - for file uploads)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=stonehenge-drawings

# Anthropic AI (optional - for drawing analysis)
ANTHROPIC_API_KEY=your-anthropic-api-key
```

---

## Step-by-Step Railway Fix Process

### Option 1: Quick Fix (No Code Changes)

1. ✅ Open Railway Dashboard
2. ✅ Go to your project → Variables
3. ✅ Edit `DATABASE_URL` → Add `?sslmode=disable` at the end
4. ✅ Verify `JWT_SECRET` is set to a strong value (not the example!)
5. ✅ Add all other environment variables from above
6. ✅ Go to Deployments → Click "Redeploy"
7. ✅ Watch logs for success
8. ✅ Test site at stonehenge-production.up.railway.app

---

### Option 2: Full Fix (With Code Updates)

1. ✅ Update `package.json` locally (remove migration from start script)
2. ✅ Commit and push to GitHub:
   ```bash
   git add package.json
   git commit -m "Fix: Remove duplicate migration from start script"
   git push
   ```
3. ✅ Railway will auto-deploy (if connected to GitHub)
4. ✅ OR manually redeploy in Railway Dashboard
5. ✅ Check Railway Variables (same as Option 1, steps 2-5)
6. ✅ Test site

---

## After Deployment Succeeds

### 1. Test the Production Site

- Visit: https://stonehenge-production.up.railway.app
- Should see login page
- Try logging in (you may need to seed the database first)

### 2. Seed Database (If Needed)

If you get "No users found" or can't log in:

**Option A: Via Railway CLI**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run seed command
railway run npm run db:seed
```

**Option B: Via Railway Dashboard**
1. Go to project settings
2. Find "One-off command" or similar
3. Run: `npm run db:seed`

### 3. Monitor Application

- Check **Railway Dashboard → Metrics** for:
  - Memory usage
  - CPU usage
  - Response times
- Check **Logs** for any warnings or errors

---

## SSL Configuration (Long-term Fix)

**Current:** Using `sslmode=disable` (works but not ideal for production)

**For proper production security:**

1. Contact Railway Support about SSL certificate issue
2. Ask for the correct SSL configuration for PostgreSQL
3. Update to use `sslmode=require` with proper certificate validation
4. Test thoroughly

**Alternative:** Migrate to a different database provider:
- Neon (https://neon.tech) - Great PostgreSQL alternative
- Supabase (https://supabase.com) - PostgreSQL with built-in features
- Planetscale (https://planetscale.com) - MySQL alternative

---

## Troubleshooting Common Issues

### Issue: "Application failed to respond"

**Causes:**
1. Database connection failed
2. Build failed
3. Server crashed on startup
4. Missing environment variables

**Fixes:**
1. Check Railway logs for specific error
2. Verify DATABASE_URL includes `?sslmode=disable`
3. Ensure all environment variables are set
4. Check build logs for compilation errors

---

### Issue: Build succeeds but deployment fails

**Check:**
1. Start command in railway.toml is correct
2. package.json start script is correct
3. Port configuration (Next.js should auto-detect Railway's PORT)
4. Database migrations can connect

---

### Issue: "Module not found" errors

**Fix:**
1. Ensure dependency is in `dependencies` not `devDependencies`
2. Clear Railway build cache
3. Redeploy

---

### Issue: Database migrations fail

**Fix:**
1. Check DATABASE_URL is correct
2. Ensure PostgreSQL service is running in Railway
3. Check migration history: `railway run npx prisma migrate status`
4. Manually resolve if needed: `railway run npx prisma migrate resolve`

---

## Verification Checklist

After making changes, verify:

- [ ] DATABASE_URL has `?sslmode=disable` in Railway
- [ ] JWT_SECRET is set to a strong, unique value
- [ ] All NEXT_PUBLIC_* variables are set
- [ ] All COMPANY_* variables are set
- [ ] Build succeeds in Railway logs
- [ ] Deployment starts without errors
- [ ] Application responds at production URL
- [ ] Can access login page
- [ ] Database queries work (check logs)

---

## Next Steps After Site is Running

1. **Test thoroughly:**
   - Login functionality
   - Create quotes
   - Database operations
   - File uploads (if R2 is configured)

2. **Set up monitoring:**
   - Railway built-in metrics
   - Consider external monitoring (UptimeRobot, etc.)

3. **Configure domain:**
   - Add custom domain in Railway
   - Update DNS records
   - Enable SSL certificate

4. **Security review:**
   - Rotate JWT_SECRET if it was ever committed
   - Review all API endpoints
   - Check authentication flows

---

## Support Resources

- **Railway Docs:** https://docs.railway.app
- **Railway Discord:** https://discord.gg/railway
- **Prisma Docs:** https://www.prisma.io/docs/
- **Next.js Deployment:** https://nextjs.org/docs/deployment

---

## Summary

**Primary Issue:** Database SSL connection failing (same as local environment)

**Primary Fix:** Add `?sslmode=disable` to DATABASE_URL in Railway Dashboard

**Secondary Issue:** Duplicate migration execution

**Secondary Fix:** Remove migrations from package.json start script (let Railway handle it)

**Time to Fix:** 10-15 minutes

---

**Status:** Ready to fix  
**Next Action:** Update DATABASE_URL in Railway Dashboard and redeploy
