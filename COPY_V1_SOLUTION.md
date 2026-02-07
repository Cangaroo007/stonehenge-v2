# SOLUTION: Copy Working V1 Setup to V2

## The Real Problem

Your **stonehenge v1 IS WORKING** perfectly on Railway. 

Your **stonehenge-v2** has the same code but can't connect because it's in a **different Railway setup**.

## Why V1 Works

V1 uses:
- `DATABASE_URL=postgresql://...@postgres.railway.internal:5432/railway` ← This hostname EXISTS and WORKS
- Simple `next start` command
- No special flags or configuration

## Why V2 Doesn't Work

V2's Postgres service has a different name/configuration:
- The `postgres.railway.internal` hostname doesn't exist in v2's environment
- We've been using the public proxy which works for migrations but causes 502 errors

## FASTEST SOLUTION

### Option 1: Use V1's Database (Recommended - 2 minutes)

Connect v2 to v1's working database:

1. **Get V1's DATABASE_URL:**
   ```bash
   cd /Users/seanstone/Downloads/stonehenge
   railway variables | grep "DATABASE_URL " -A 3
   ```
   Copy the full value (should be `postgresql://...@postgres.railway.internal:5432/railway`)

2. **Set it in V2:**
   - Go to Railway Dashboard → stonehenge-v2 → Variables
   - Edit `DATABASE_URL`
   - Paste V1's DATABASE_URL value
   - Save

3. **Redeploy V2**

**Result:** V2 will share V1's database. Both apps will work.

---

### Option 2: Fresh PostgreSQL for V2 (10 minutes)

Create a NEW properly configured Postgres for v2:

1. **In Railway Dashboard:**
   - Go to "friendly-simplicity" project
   - Find the existing **"Postgres"** service (the broken one)
   - Delete it or rename it to "Postgres-old"

2. **Add New PostgreSQL:**
   - Click "+ New"
   - Select "Database" → "PostgreSQL"  
   - Railway will create it with a lowercase name: `postgres`

3. **Link to stonehenge-v2:**
   - Click stonehenge-v2 service
   - Variables → "+ New Variable"
   - Select "Variable Reference"
   - Name: `DATABASE_URL`
   - Service: Select the new postgres service
   - Variable: `DATABASE_URL`
   - Save

4. **Run Migrations:**
   ```bash
   cd /Users/seanstone/Downloads/stonehenge-v2
   railway run npx prisma migrate deploy
   ```

5. **Redeploy**

**Result:** V2 has its own fresh database that works properly.

---

### Option 3: Deploy V2 to V1's Project (5 minutes)

Instead of fixing v2's project, deploy v2 TO the working v1 project:

1. **In Railway Dashboard:**
   - Go to your WORKING v1 project (where stonehenge v1 is)
   - Click "+ New" → "Empty Service"
   - Connect to GitHub → Select stonehenge-v2 repo
   - Railway will automatically use the existing postgres service

2. **It will just work** because it inherits the working setup

---

## My Recommendation

**Try Option 1 first** (use v1's database). It's the fastest and both versions can coexist.

If you want v2 completely separate, do Option 2 (fresh postgres).

---

## Why This Happened

Railway's private networking creates hostnames based on the service name. Your v2's Postgres service is named/configured differently than v1's, so the hostname is different or doesn't exist.

The key is: **V1 WORKS** → Use its working setup!

---

## Test Command After Fix

```bash
curl https://stonehenge-v2-production.up.railway.app/api/health
```

Should return:
```json
{"status":"ok","database":"connected"}
```

Then you're DONE! 🎉
