# CRITICAL FIX PLAN - Drawing Upload System
**Date:** January 31, 2026

## ROOT CAUSE ANALYSIS

Based on console logs:

1. **PDF Analysis Failing:** Anthropic API returns 400 "Could not process PDF"
2. **405 Method Not Allowed:** POST to `/api/quotes/8/drawings` fails
3. **No R2 Upload:** Because entire flow breaks before reaching upload

## THE REAL PROBLEM

The `DrawingImport` component is trying to do TOO MUCH in one flow:
1. Compress image
2. Upload to R2
3. Analyze with AI
4. Save to database

When ANY step fails, the WHOLE thing fails.

## IMMEDIATE FIX

Create a SIMPLE, bulletproof upload flow:

### Step 1: Simple R2 Upload (NO AI analysis required)
- User uploads file
- File goes directly to R2
- Database record created immediately
- Done!

### Step 2: AI Analysis (Optional, separate)
- Can be triggered separately if user wants
- Doesn't block the upload

## FILES TO FIX

1. `/api/quotes/[id]/drawings/route.ts` - Already exists, verify it works
2. Create simple upload component that doesn't require AI
3. Test with curl first before touching UI

## TESTING PLAN

1. Test API directly with curl
2. Verify database record creation
3. Then fix UI

---

**Current Status:** Deploying systematic fix...
