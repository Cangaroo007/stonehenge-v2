# Railway Production Debug - Quote Builder Error

## Issue
Error: `TypeError: x.isLoaded is not a function`  
Page: `/quotes/13/builder`  
Status: Affecting production, local build works fine

## Current Deploy
Commit: `0a08cd7` (PDF/Company settings work - before optimizer changes)

## What We Know
1. ✅ Build succeeds locally (42/42 pages generated)
2. ✅ Build succeeds on Railway
3. ❌ Runtime error in browser on production
4. ✅ Code compiles without TypeScript errors

## Possible Causes

### 1. Browser Cache (Most Likely!)
Old JavaScript bundle cached in browser from previous deploy

**Fix:**
- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Clear browser cache completely
- Try incognito mode

### 2. Hydration Mismatch
Server-rendered HTML doesn't match client-side React

**Check:**
- Look for "hydration" errors in console
- Check if error happens on initial load or after interaction

### 3. Missing Environment Variable
Some required env var not set on Railway

**Check:**
```bash
# Compare local vs Railway env vars
railway variables
```

### 4. Database Schema Mismatch
Migration didn't run properly on Railway

**Check:**
```bash
# Check migration status
railway run npx prisma migrate status
```

### 5. Specific Component Issue
One of these components is breaking:
- `DeliveryTemplatingCard` 
- `DistanceCalculator`
- `DrawingReferencePanel`

## Debug Steps

### Step 1: Clear Cache
```
1. Open in incognito/private window
2. Or clear all browser data
3. Try loading /quotes/13/builder again
```

### Step 2: Check Console for Full Error
```
1. F12 → Console tab
2. Look for full stack trace
3. Find which file/line is failing
```

### Step 3: Test Other Pages
```
- Try /quotes (list page)
- Try /dashboard  
- Try /settings
- If those work, issue is specific to quote builder
```

### Step 4: Check Railway Logs During Page Load
```bash
# Terminal 1: Watch logs
railway logs --follow

# Terminal 2/Browser: Load the page
# Check if any server errors appear in logs
```

### Step 5: Check Database
```bash
# Verify Company table has new fields
railway run npx prisma db pull
# Check if schema matches local
```

## Quick Fixes to Try

### Option A: Redeploy from Scratch
```bash
# Force a complete rebuild
railway up --detach
```

### Option B: Rollback to Known Good State
```bash
# If we need to go back further
git checkout e20cad1  # Before delivery/optimizer work
git push origin main --force
```

### Option C: Disable Problematic Component
Temporarily comment out in `page.tsx`:
```typescript
// <DeliveryTemplatingCard ... />
```

## Next Steps

1. **FIRST**: Try hard refresh / incognito
2. **SECOND**: Send full browser console error with stack trace
3. **THIRD**: Check Railway logs during page load
4. **LAST**: Deploy with component disabled to isolate issue
