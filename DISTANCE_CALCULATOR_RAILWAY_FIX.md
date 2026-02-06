# Distance Calculator Fix - Railway Deployment

## Issues Fixed

### 1. ✅ Added Google Places Autocomplete
- Address input now shows autocomplete suggestions as you type
- Restricted to Australian addresses
- Uses Google Places API

### 2. ✅ Fixed Railway Environment Variable
- Set `GOOGLE_MAPS_API_KEY` in Railway environment
- Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for browser-side autocomplete

## Railway Configuration Required

### Go to Railway Dashboard:
1. Navigate to your project: `stonehenge-production`
2. Click on the service
3. Go to "Variables" tab
4. Add these environment variables:

```bash
GOOGLE_MAPS_API_KEY=AIzaSyCVi1ZM-7DwWfhkQfoQ9ecw-s3kQ9aA2pU
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyCVi1ZM-7DwWfhkQfoQ9ecw-s3kQ9aA2pU
```

5. Click "Deploy" or wait for auto-deploy after pushing code

### Google Cloud Console Setup

Make sure these APIs are enabled:
1. **Distance Matrix API** - for calculating distances
2. **Places API** - for address autocomplete
3. **Maps JavaScript API** - for loading the autocomplete widget

Go to: https://console.cloud.google.com/apis/library

## How It Works Now

### Address Autocomplete
1. User starts typing address
2. Google Places shows suggestions dropdown
3. User selects address from dropdown (or types full address)
4. Click "Calculate Distance"
5. System calculates distance and shows:
   - Distance in km
   - Travel time
   - Delivery zone
   - Calculated costs

### What Changed

**Files Modified:**
- `src/components/DistanceCalculator.tsx` - Added Google Places Autocomplete
- `.env` - Added NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
- `src/types/google-maps.d.ts` - TypeScript types for Google Maps

**Features Added:**
- ✅ Autocomplete suggestions as you type
- ✅ Restricted to Australia only
- ✅ Proper TypeScript support
- ✅ Graceful fallback if API not loaded

## Testing Locally

1. Make sure `.env` has both variables:
   ```
   GOOGLE_MAPS_API_KEY="AIzaSyCVi1ZM-7DwWfhkQfoQ9ecw-s3kQ9aA2pU"
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="AIzaSyCVi1ZM-7DwWfhkQfoQ9ecw-s3kQ9aA2pU"
   ```

2. Restart dev server:
   ```bash
   npm run dev
   ```

3. Test autocomplete:
   - Go to quote builder
   - Expand "Delivery & Templating"
   - Start typing an address
   - Should see autocomplete dropdown

## Deployment Steps

1. **Commit changes** (done)
2. **Push to GitHub:**
   ```bash
   git push origin main
   ```
3. **Railway will auto-deploy** (takes ~2-3 minutes)
4. **Verify** - Test on production URL

---

**Status:** ✅ Ready to deploy
**Date:** January 31, 2026
