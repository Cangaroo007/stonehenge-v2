# Fix DATABASE_URL in Railway Dashboard

## The Problem

The health endpoint shows:
```
"error": "the URL must start with the protocol `postgresql://` or `postgres://`"
```

This means DATABASE_URL is **empty or invalid** when the app runs, even though it looks correct in Railway Variables.

## The Fix

### Option 1: Set DATABASE_URL as Raw Value (Recommended)

1. **Go to Railway Dashboard** → stonehenge-v2 → **Variables**
2. **Find DATABASE_URL**
3. **Click three dots (...)** → **Edit**
4. **Change from "Reference" to "Raw Value"**
5. **Paste this EXACT value:**
   ```
   postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway
   ```
6. **Click Save**
7. **Go to Deployments** → **Redeploy**

### Option 2: Check Variable Reference

If you want to keep using a Reference:
1. Make sure the Reference is pointing to the **correct Postgres service**
2. Make sure it's referencing **DATABASE_URL** (not DATABASE_PUBLIC_URL)
3. The referenced value should start with `postgresql://`

## Why This Happens

Variable References sometimes don't resolve properly if:
- The services aren't in the same environment
- The reference is circular
- There's a Railway bug

Using a raw value is more reliable.

## After Fix

Once you redeploy, test:
```bash
curl https://stonehenge-v2-production.up.railway.app/api/health
```

Should return:
```json
{"status":"ok","database":"connected"}
```

Then try logging in again!
