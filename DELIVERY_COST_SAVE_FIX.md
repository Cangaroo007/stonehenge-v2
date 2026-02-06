# Delivery Cost Fix - January 31, 2026

## Issue Reported
Saved draft quotes were not including delivery costs in the calculation/totals.

## Root Cause
The API endpoints for creating and updating quotes were missing the delivery and templating fields in their data interfaces, so even though the frontend was sending the data, the backend wasn't saving it.

## What Was Fixed

### 1. ✅ POST /api/quotes (Create Quote)
**File:** `src/app/api/quotes/route.ts`

**Changes:**
- Added delivery/templating fields to `QuoteCreateData` interface
- Updated the Prisma create statement to save:
  - `deliveryAddress`
  - `deliveryDistanceKm`
  - `deliveryZoneId`
  - `deliveryCost`
  - `overrideDeliveryCost`
  - `templatingRequired`
  - `templatingDistanceKm`
  - `templatingCost`
  - `overrideTemplatingCost`

### 2. ✅ PUT /api/quotes/[id] (Update Quote)
**File:** `src/app/api/quotes/[id]/route.ts`

**Changes:**
- Added delivery/templating fields to `QuoteUpdateData` interface
- Updated the Prisma update statement to save all delivery/templating fields
- Updated GET endpoint to include `deliveryZone` relation

## How It Works Now

### Frontend → Backend Flow:
1. **User enters delivery address** in QuoteForm
2. **User clicks "Calculate Distance"** → Calls Google Maps API
3. **System calculates costs:**
   - Delivery cost (based on zone + distance)
   - Templating cost (if required)
4. **Frontend calculates totals:**
   ```
   Pieces Subtotal: $4,884.68
   Delivery: $XXX.XX        ← Included
   Templating: $XXX.XX      ← Included (if applicable)
   ────────────────────
   Subtotal: $X,XXX.XX      ← Includes delivery + templating
   GST (10%): $XXX.XX
   Total: $X,XXX.XX
   ```
5. **User clicks "Save Draft"** → Sends to `/api/quotes` (POST)
6. **Backend saves:**
   - All piece data
   - Delivery data (address, distance, zone, costs)
   - Templating data (if applicable)
   - **Subtotal includes delivery + templating**
   - **Total includes delivery + templating + GST**

### When Quote is Loaded:
1. GET `/api/quotes/[id]` returns quote with:
   - All piece data
   - `deliveryCost`, `templatingCost`
   - `deliveryZone` relation
2. Quote Builder calls `/api/quotes/[id]/calculate`
3. Calculation includes delivery + templating in totals
4. Quote Summary displays correct totals

## Testing Checklist

### ✅ Before Deployment
- [x] Build successful
- [x] TypeScript compiles
- [x] API interfaces updated
- [x] Database fields mapped correctly

### 🧪 After Deployment (Manual Testing)
- [ ] Create new quote with delivery
- [ ] Verify delivery cost shown in totals before saving
- [ ] Save as draft
- [ ] Reload quote → Verify delivery cost still in totals
- [ ] Open in Quote Builder → Verify costs match
- [ ] Update delivery address → Recalculate → Save
- [ ] Verify updated delivery cost persists

## Files Changed

1. **src/app/api/quotes/route.ts**
   - Updated `QuoteCreateData` interface
   - Updated POST handler to save delivery/templating

2. **src/app/api/quotes/[id]/route.ts**
   - Updated `QuoteUpdateData` interface
   - Updated PUT handler to save delivery/templating
   - Updated GET handler to include `deliveryZone`

## Database Schema
No schema changes required - fields already exist:
- `deliveryAddress`
- `deliveryDistanceKm`
- `deliveryZoneId`
- `deliveryCost`
- `overrideDeliveryCost`
- `templatingRequired`
- `templatingDistanceKm`
- `templatingCost`
- `overrideTemplatingCost`

## Deployment

### Ready to Deploy:
```bash
git push origin main
```

Railway will auto-deploy in ~2-3 minutes.

### After Deployment:
1. Test creating a new quote with delivery
2. Verify totals are correct
3. Save and reload → Verify persistence

---

**Status:** ✅ Fixed and ready to deploy  
**Commit:** `ff583a4`  
**Impact:** All new quotes will save delivery costs correctly  
**Backwards Compatible:** Yes - existing quotes without delivery data will continue to work
