# Production Site Fix - Quick Start

## 🔴 Problem
Your production site at **stonehenge-production.up.railway.app** shows "Application failed to respond"

## ⚡ Quick Fix (5 minutes)

### Step 1: Fix Database Connection in Railway

1. Open **Railway Dashboard**: https://railway.app/
2. Go to your **stonehenge-production** project
3. Click **Variables** tab
4. Find `DATABASE_URL` variable
5. Click **Edit** and add `?sslmode=disable` to the end:

```
Before: postgresql://postgres:xxxxx@host:port/railway
After:  postgresql://postgres:xxxxx@host:port/railway?sslmode=disable
```

6. **Save** the variable

### Step 2: Verify Other Variables

Still in the **Variables** tab, make sure you have:

**Critical:**
- `JWT_SECRET` - Must be set to a STRONG random value (not "your-super-secret...")
- `NODE_ENV` - Set to `production`

**Required for app to work:**
- `NEXT_PUBLIC_APP_NAME` = Stone Henge
- `NEXT_PUBLIC_CURRENCY` = AUD
- `NEXT_PUBLIC_TAX_RATE` = 10
- `NEXT_PUBLIC_TAX_NAME` = GST
- All `COMPANY_*` variables (name, ABN, address, phone, fax, email)

### Step 3: Push Code Fix

We already fixed your local code. Now push it to trigger a redeploy:

```bash
cd /Users/seanstone/Downloads/stonehenge

git add package.json
git commit -m "Fix: Remove duplicate migration from start script for Railway"
git push
```

Railway will automatically redeploy (if connected to GitHub).

**OR** manually redeploy in Railway:
1. Go to **Deployments** tab
2. Click **Redeploy** on latest deployment

### Step 4: Wait and Test

1. Wait 2-3 minutes for deployment to complete
2. Watch the **logs** in Railway for any errors
3. Visit: https://stonehenge-production.up.railway.app
4. You should see the login page!

---

## What We Fixed

### Local Issue (Already Fixed ✅)
- Database SSL connection
- Next.js config
- Project cleanup
- **Result:** Site works at localhost:3000

### Production Issues (To Fix)
1. **Database Connection:** Same SSL problem as local
   - **Fix:** Add `?sslmode=disable` to Railway DATABASE_URL
   
2. **Duplicate Migrations:** Running twice
   - **Fix:** Removed from package.json start script
   
3. **Missing Variables:** May not be set in Railway
   - **Fix:** Add all environment variables in Railway

---

## If Still Not Working

### Check Railway Logs

1. Railway Dashboard → **Deployments** → Click latest
2. Look at **Deploy Logs** for errors
3. Common errors:

**"Error opening a TLS connection"**
→ DATABASE_URL still missing `?sslmode=disable`

**"Module not found"**
→ Clear cache and redeploy

**"Cannot find module '@prisma/client'"**
→ Build step may have failed, check build logs

### Get Help

If you see errors in the logs, send me:
1. Screenshot of the error
2. Or copy/paste the error message

I'll help you debug it!

---

## Success Checklist

- [ ] Added `?sslmode=disable` to DATABASE_URL in Railway
- [ ] Set JWT_SECRET to a strong value in Railway
- [ ] Added all NEXT_PUBLIC_* variables
- [ ] Added all COMPANY_* variables
- [ ] Pushed code fix to GitHub
- [ ] Railway redeployed
- [ ] Site loads at stonehenge-production.up.railway.app
- [ ] Can see login page

---

## What's Different Between Local and Production?

### Local Development (Working ✅)
- Uses `.env` file
- Database: Railway PostgreSQL with `?sslmode=disable`
- Running on: localhost:3000
- Migrations run once

### Production on Railway (Fixing)
- Uses Railway Environment Variables
- Database: Same Railway PostgreSQL (needs `?sslmode=disable`)
- Running on: stonehenge-production.up.railway.app
- Migrations managed by Railway

---

## Detailed Fix Guide

For complete instructions, see: **RAILWAY_DEPLOYMENT_FIX.md**

That file includes:
- Complete environment variable list
- Detailed troubleshooting
- How to seed the database
- SSL long-term fix options
- Monitoring setup

---

## Time Estimates

- **Quick fix (Railway variables only):** 5 minutes
- **With code push:** 10 minutes
- **If you need to debug:** 15-20 minutes

---

## Next Steps After Site is Running

1. **Seed the database** (if you can't log in):
   ```bash
   railway run npm run db:seed
   ```

2. **Set up custom domain** (optional):
   - Railway Dashboard → Settings → Domains
   - Add your domain
   - Update DNS records

3. **Enable monitoring:**
   - Check Railway metrics
   - Set up Uptime monitoring (UptimeRobot, etc.)

---

**Ready? Start with Step 1 above!** ⚡
