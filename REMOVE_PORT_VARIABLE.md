# CRITICAL: Remove PORT=8080 Variable in Railway Dashboard

## The Real Problem Found! 🎯

**Issue:** I manually set `PORT=8080` in stonehenge-v2's environment variables. This is forcing Next.js to listen on port 8080, but Railway might be assigning a DIFFERENT port dynamically!

**Evidence:**
- V1 (working): NO PORT variable → Next.js auto-detects Railway's port ✅
- V2 (broken): PORT=8080 set → Next.js listens on wrong port ❌
- Railway returns `x-railway-fallback: true` → Backend not responding

## URGENT FIX - Do This in Railway Dashboard:

### Step 1: Remove PORT Variable

1. Go to Railway Dashboard → **stonehenge-v2** → **Variables** tab
2. Find the variable **`PORT`** with value `8080`
3. Click the **three dots (...)** → **"Remove"**
4. Click **"Save"** or confirm deletion

### Step 2: Redeploy

A new deployment is already triggered (build ID: 1c9cd50e-8277-48e3-853c-5449f539c606)

BUT you need to:
1. Go to **Deployments** tab
2. Wait for current build to finish (~1 minute)
3. **Redeploy again** (to pick up the removed PORT variable)

OR:
1. Remove the PORT variable NOW
2. The current deployment will pick it up

### Step 3: Test

After deployment completes:

```bash
curl https://stonehenge-v2-production.up.railway.app/api/health
```

Should return:
```json
{"status":"ok","database":"connected"}
```

---

## Why This Fixes It

Railway automatically injects a `PORT` environment variable when the container starts. Next.js reads this and binds to that port.

When we manually set `PORT=8080`, we overrode Railway's dynamic port assignment, causing a mismatch:
- Railway expects backend on port X
- Next.js listens on port 8080
- Requests go to port X → nobody listening → 502 error

By removing our manual PORT setting, Next.js will use Railway's automatically assigned port, and everything will work!

---

## This Should Be THE FIX! 🎉

The database is working, migrations run, app starts - we just had the wrong port!
