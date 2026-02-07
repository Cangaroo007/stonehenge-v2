# Stonehenge V2 - Deployment Diagnostic & Fix

## Current Status 🔴

**Issue:** "Application failed to respond" on Railway
**URL:** stonehenge-v2-production.up.railway.app
**Last Deploy:** Feb 6, 2026 @ 07:59:54Z
**Commit:** 848d027 / dd604e3

---

## What We Know

### ✅ What's Working:
1. Build completes successfully
2. Migrations run successfully ("No pending migrations to apply")
3. Next.js starts and shows "✓ Ready in 430ms"
4. App responds to initial requests (see logs showing drawing API calls)

### ❌ The Problem:
Railway shows "Application failed to respond" despite the app appearing to start correctly in logs.

---

## Root Cause Analysis

Based on the logs in `railway-runtime-error.log`, the app **IS** actually working! The logs show:
- Successful migration
- Next.js started on port 8080
- API requests being processed successfully
- R2 connections working

**The issue is likely:**

### 1. Health Check Failure (Most Likely)
Railway expects the app to respond to health checks within a timeout period. If Next.js takes too long to become "ready" or if there's no proper health check endpoint, Railway marks it as failed even though it's running.

### 2. Database Connection String Issue
The `railway.toml` uses `DATABASE_PUBLIC_URL` for migrations:
```toml
startCommand = "DATABASE_URL=\"$DATABASE_PUBLIC_URL\" npx prisma migrate deploy && npx next start -H 0.0.0.0 -p ${PORT:-3000}"
```

But the app itself might need `DATABASE_URL` set properly with SSL mode.

### 3. Port Binding Timing
The app might bind to the port BEFORE migrations complete, causing Railway's health check to hit the app before it's fully ready.

---

## Immediate Fixes to Try

### Fix #1: Simplify Start Command ⚡ (Quickest)

The current start command is doing too much in one line. Let's separate concerns:

**Update `railway.toml`:**

```toml
[build]
buildCommand = "npx prisma generate && npm run build"

[build.cache]
paths = ["node_modules", ".next/cache"]

[deploy]
startCommand = "npx prisma migrate deploy && npm run start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**Update `package.json`:**

```json
{
  "scripts": {
    "start": "next start -H 0.0.0.0 -p ${PORT:-3000}"
  }
}
```

This separates migration from startup and uses npm script which is more reliable.

---

### Fix #2: Add Health Check Endpoint

Railway needs to verify your app is healthy. Create a simple health check:

**Create: `src/app/api/health/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Quick DB ping
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 503 }
    );
  }
}
```

Then configure Railway to use this endpoint for health checks.

---

### Fix #3: Check Railway Environment Variables

The app needs these variables set in Railway Dashboard:

**Required:**
- `DATABASE_URL` - (with `?sslmode=disable` or proper SSL config)
- `DATABASE_PUBLIC_URL` - Railway should auto-provide this
- `JWT_SECRET` - Strong random string
- `NODE_ENV=production`

**Application:**
- `NEXT_PUBLIC_APP_NAME=Stone Henge`
- `NEXT_PUBLIC_CURRENCY=AUD`
- `NEXT_PUBLIC_TAX_RATE=10`
- `NEXT_PUBLIC_TAX_NAME=GST`

**Optional but recommended:**
- `GOOGLE_MAPS_API_KEY`
- `ANTHROPIC_API_KEY`
- R2 credentials (if using)

---

### Fix #4: Update next.config.js

The current config has a warning about invalid keys:

```
⚠ Invalid next.config.js options detected: 
⚠     Unrecognized key(s) in object: 'serverExternalPackages'
```

**Fix in `next.config.js`:**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    serverComponentsExternalPackages: ['sharp', 'pdf-to-img', '@napi-rs/canvas', 'pdfjs-dist'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '**.r2.dev',
      },
    ],
  },
  // Ensure proper port binding
  server: {
    port: process.env.PORT || 3000,
    hostname: '0.0.0.0',
  },
}

module.exports = nextConfig
```

---

## Step-by-Step Fix Process

### Step 1: Update Local Files

```bash
cd /Users/seanstone/Downloads/stonehenge-v2
```

1. **Update `railway.toml`** (use Fix #1 above)
2. **Update `package.json` start script** (use Fix #1 above)
3. **Create health check endpoint** (Fix #2 above)
4. **Fix `next.config.js`** (Fix #4 above)

### Step 2: Commit and Push

```bash
git add railway.toml package.json src/app/api/health/route.ts next.config.js
git commit -m "Fix Railway deployment: simplify start command and add health check"
git push origin main
```

### Step 3: Verify Railway Variables

1. Go to Railway Dashboard → Your Project → Variables
2. Check `DATABASE_URL` exists and has `?sslmode=disable`
3. Verify `JWT_SECRET` is set to a strong value
4. Add any missing environment variables

### Step 4: Configure Health Check (Optional)

In Railway Dashboard:
1. Go to Settings → Health Check
2. Set path to `/api/health`
3. Set timeout to 30 seconds
4. Set interval to 60 seconds

### Step 5: Redeploy

Railway should auto-deploy from GitHub push, or:
1. Go to Deployments tab
2. Click "Redeploy" on latest deployment
3. Watch build and deploy logs

---

## Alternative Quick Test

If you want to test immediately without code changes:

### In Railway Dashboard:

1. Go to **Settings** → **Deploy**
2. Change the Start Command to:
   ```bash
   npx prisma migrate deploy && npx next start -p $PORT
   ```
   (Remove the -H 0.0.0.0 to let Next.js use default behavior)

3. Click Save
4. Redeploy

---

## Debugging Steps

### Check if app is actually running:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# View real-time logs
railway logs --follow
```

### Look for:
1. "✓ Ready in XXXms" - App started
2. Any error messages after startup
3. Connection errors
4. Timeout errors

### Test the app manually:

If you have Railway CLI:
```bash
# Run a command in the Railway environment
railway run curl http://localhost:$PORT

# Or check if process is running
railway run ps aux | grep next
```

---

## Common Railway Issues

### Issue: "Application failed to respond"

**Possible causes:**
1. App crashed after starting → Check logs for errors
2. Health check timeout → App takes too long to start
3. Wrong port binding → App not listening on Railway's PORT
4. Database connection fails → Check DATABASE_URL

### Issue: "Port already in use"

**Fix:** Railway assigns a random PORT. Make sure you're using `process.env.PORT` or `$PORT`

### Issue: Build succeeds but deploy fails

**Check:**
1. Start command syntax
2. Migration errors
3. Missing environment variables
4. Node.js version compatibility

---

## Expected Behavior After Fix

1. ✅ Build completes in ~2-3 minutes
2. ✅ Migrations run successfully
3. ✅ Next.js starts and shows "Ready"
4. ✅ Health check passes (if configured)
5. ✅ Railway shows "Active" status
6. ✅ URL is accessible

---

## Verification Checklist

After deployment:

- [ ] Railway shows "Active" status (not "Failed to respond")
- [ ] Can access homepage at production URL
- [ ] Can access /api/health endpoint
- [ ] Login page loads
- [ ] Database queries work
- [ ] No errors in Railway logs

---

## If Nothing Works

### Nuclear Option: Fresh Deploy

1. Delete the current Railway service
2. Create new Railway project from scratch
3. Connect to GitHub repo
4. Add PostgreSQL database
5. Set all environment variables
6. Deploy

This ensures no cached state or misconfigurations.

---

## Summary

**Most Likely Issue:** Health check timeout or start command complexity

**Quick Fix:** Simplify railway.toml, add health check endpoint, ensure DATABASE_URL is correct

**Time to fix:** 15-30 minutes

**Next Action:** Apply Fix #1, #2, and #4, then commit and push

---

## Status: Ready to Fix

The app is actually working (based on logs), but Railway can't verify it's healthy. The fixes above should resolve this.
