# Drawing System Diagnostic - Jan 31, 2026

## Current Status

### ✅ What's Working
1. **R2 Upload**: Files successfully upload to Cloudflare R2
2. **Database Creation**: Records ARE being created in the `drawings` table
3. **Table Mapping**: Prisma model `Drawing` correctly maps to `drawings` table via `@@map("drawings")`

### 📊 Database Evidence
```sql
-- Query: SELECT COUNT(*) FROM "drawings";
Result: 15 drawings exist

-- Latest 5 drawings:
c73bf176... | Q985 Tops.pdf | Quote 8 | 2026-01-31 19:51:32
329a86d0... | New CNC.pdf   | Quote 9 | 2026-01-31 19:22:56
... (13 more)
```

### 🔍 R2 Evidence
- 8 files visible in Cloudflare R2 dashboard
- Path format: `drawings/4/8/[uuid].pdf`

### ❌ What's NOT Working
- **Display**: Drawings not appearing in the Quote Builder "Reference Drawing" panel

## Architecture Overview

### Upload Flow
1. User selects file → `DrawingImport.tsx`
2. File uploads to R2 → `/api/upload/drawing`
3. Returns `storageKey`, `filename`, `mimeType`, `fileSize`
4. Creates DB record → `POST /api/quotes/[id]/drawings`
5. Calls `createDrawing()` → Inserts into `drawings` table

### Display Flow
1. `DrawingReferencePanel.tsx` component mounts
2. Fetches drawings → `GET /api/quotes/[id]/drawings`
3. API queries `prisma.drawing.findMany()`
4. Returns array of drawings
5. Component renders thumbnails

## Issue Analysis

### Possible Causes

1. **GET Endpoint Not Being Called**
   - Frontend might not be triggering the fetch
   - Check browser Network tab for `/api/quotes/8/drawings` request

2. **GET Endpoint Failing Silently**
   - Authentication might be failing
   - Query might be returning empty despite data existing
   - Error being swallowed somewhere

3. **Frontend Rendering Issue**
   - Data arrives but doesn't render
   - Check if `drawings` state is being set
   - Check if `hasDrawings` condition is true

4. **Cache Issue**
   - Browser caching old empty response
   - Need hard refresh or cache clear

## Debugging Steps

### Step 1: Check if GET is being called
```javascript
// In browser console on Quote Builder page:
fetch('/api/quotes/8/drawings')
  .then(r => r.json())
  .then(d => console.log('API Response:', d))
  .catch(e => console.error('API Error:', e))
```

### Step 2: Check Railway Logs
```bash
railway logs --service stonehenge | grep "Get Drawings"
```

Look for:
- `[Get Drawings API] 📖 === REQUEST RECEIVED ===`
- `[Get Drawings API] ✅ Found drawings: X`

### Step 3: Check Browser Network Tab
1. Open DevTools → Network tab
2. Refresh page
3. Filter for "drawings"
4. Check `/api/quotes/[id]/drawings` request
5. Verify: Status 200? Response body has data?

### Step 4: Check React State
Add console.log to DrawingReferencePanel:
```typescript
useEffect(() => {
  // ... existing code ...
  const data = await response.json();
  console.log('🎨 Drawings fetched:', data); // ADD THIS
  setDrawings(data);
}, [quoteId, refreshKey]);
```

## Files Involved

### Backend
- `/src/app/api/quotes/[id]/drawings/route.ts` - GET/POST endpoints
- `/src/lib/services/drawingService.ts` - Database operations
- `/prisma/schema.prisma` - Table definition (line 847-875)

### Frontend
- `/src/app/(dashboard)/quotes/[id]/builder/components/DrawingReferencePanel.tsx` - Display component
- `/src/app/(dashboard)/quotes/[id]/builder/components/DrawingImport.tsx` - Upload component

### Upload Endpoints
- `/src/app/api/upload/drawing/route.ts` - R2 upload

## Recent Changes
- **Commit f4e3ca8**: Added enhanced logging to GET endpoint
- **Commit 899aad6**: Fixed migration issue
- **Commit 2b6c590**: Removed duplicate migration

## Next Actions

1. ✅ **DONE**: Enhanced GET endpoint logging
2. ⏳ **DEPLOYING**: Wait for Railway to deploy (2-3 min)
3. 🔄 **TODO**: Hard refresh browser after deploy
4. 🔍 **TODO**: Run diagnostic fetch in console
5. 📊 **TODO**: Check Railway logs for GET requests
6. 🐛 **TODO**: If still failing, add frontend logging

## Expected Behavior After Fix

When working correctly:
1. Page loads → Fetches drawings
2. Logs show: `[Get Drawings API] ✅ Found drawings: 5`
3. Frontend receives array of 5 drawing objects
4. Thumbnails appear in Reference Drawing panel
5. Clicking thumbnail opens modal with full drawing
