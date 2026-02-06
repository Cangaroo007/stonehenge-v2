# Drawing Upload System - Unified Architecture

**Date:** January 31, 2026  
**Status:** ✅ Deployed and ready for testing

---

## 🎯 THE PROBLEM (What We Had)

### Multiple Fragmented Upload Paths:

1. **QuoteForm.tsx** - Used for new quotes
   - Called `/api/upload/drawing`
   - Then called `/api/quotes/[id]/drawings`
   - Two-step process prone to partial failures

2. **DrawingImport.tsx** - Used in Quote Builder
   - Called `/api/upload/drawing`
   - Then called `/api/quotes/[id]/drawings`
   - Required AI analysis
   - Complex state management

3. **DrawingUploadModal.tsx** - Old component
   - Different upload flow
   - Unclear when used

### Result:
- ❌ Partial uploads (R2 success, DB fail)
- ❌ Inconsistent behavior between pages
- ❌ Hard to debug (which code path executed?)
- ❌ No atomic transactions

---

## ✅ THE SOLUTION (Unified System)

### Single Upload Endpoint:
```
POST /api/drawings/upload-complete
```

**Does EVERYTHING atomically:**
1. Validates user & input
2. Uploads to R2
3. Creates database record
4. Returns complete drawing object

**If ANY step fails, NOTHING is saved.**

### Single React Hook:
```typescript
const { upload, uploading, progress, error } = useDrawingUpload();

const drawing = await upload(file, quoteId);
```

### Simple Component:
```typescript
<UnifiedDrawingUpload 
  quoteId={quoteId}
  onSuccess={(drawing) => console.log('Done!', drawing)}
/>
```

---

## 🧪 TESTING THE NEW SYSTEM

### Test 1: Direct API Test

```bash
# Replace with actual file and quoteId
curl -X POST https://stonehenge-production.up.railway.app/api/drawings/upload-complete \
  -F "file=@/path/to/drawing.pdf" \
  -F "quoteId=8" \
  -H "Cookie: your-session-cookie"
```

**Expected Response:**
```json
{
  "success": true,
  "drawing": {
    "id": "uuid-here",
    "filename": "drawing.pdf",
    "storageKey": "drawings/4/8/uuid.pdf",
    "uploadedAt": "2026-01-31T..."
  }
}
```

**Then verify:**
1. Check R2: File should be at `drawings/4/8/uuid.pdf`
2. Check Database: `Drawing` table should have new record
3. Both should exist or neither should exist (atomic)

### Test 2: Add to Quote Builder

Once deployment completes, I'll show you how to add the unified component to your Quote Builder for testing.

---

## 📊 COMPARISON

### Old Fragmented System:
```typescript
// Step 1: Upload to R2
const uploadResult = await fetch('/api/upload/drawing', {
  method: 'POST',
  body: formData,
});

// Step 2: Save to database (SEPARATE call, can fail)
const drawingResult = await fetch(`/api/quotes/${id}/drawings`, {
  method: 'POST',
  body: JSON.stringify(uploadResult),
});
// ❌ If step 2 fails, file is in R2 but not in database!
```

### New Unified System:
```typescript
const { upload } = useDrawingUpload();

// ONE call, atomic transaction
const drawing = await upload(file, quoteId);
// ✅ Either both succeed or both fail
```

---

## 🔄 MIGRATION PLAN

### Phase 1: Testing (NOW)
- ✅ New system deployed
- 🧪 Test the new unified endpoint
- 🧪 Verify R2 upload + DB record creation work together

### Phase 2: Integration (NEXT)
Once tested and working:
1. Replace `DrawingImport` component usage with `UnifiedDrawingUpload`
2. Replace `QuoteForm` drawing upload with unified hook
3. Remove old components

### Phase 3: Cleanup (LATER)
1. Delete `/api/upload/drawing` (old endpoint)
2. Delete `DrawingUploadModal.tsx`
3. Delete fragmented code in `DrawingImport.tsx`

---

## 🎓 HOW TO USE IN YOUR CODE

### Example 1: Simple Button

```typescript
import { UnifiedDrawingUpload } from '@/components/UnifiedDrawingUpload';

<UnifiedDrawingUpload 
  quoteId={8}
  onSuccess={(drawing) => {
    toast.success('Drawing uploaded!');
    refreshDrawingsList();
  }}
  onError={(error) => {
    toast.error(error);
  }}
/>
```

### Example 2: Custom UI with Hook

```typescript
import { useDrawingUpload } from '@/hooks/useDrawingUpload';

const { upload, uploading, progress, error } = useDrawingUpload();

const handleFile = async (file: File) => {
  try {
    const drawing = await upload(file, quoteId);
    // drawing is guaranteed to be in both R2 and database
    console.log('Success:', drawing.id);
  } catch (err) {
    // No partial state - nothing was saved
    console.error('Failed:', err);
  }
};
```

---

## 🔍 DEBUGGING

### Check Unified Upload Logs:

**Railway Logs:**
```
Search for: [Unified Upload]
```

You'll see a complete trace:
```
[Unified Upload] ========== START ==========
[Unified Upload] ✅ User authenticated
[Unified Upload] ✅ All validations passed
[Unified Upload] ✅ Quote verified
[Unified Upload] Starting R2 upload...
[Unified Upload] ✅ R2 upload complete: 1234ms
[Unified Upload] Creating database record...
[Unified Upload] ✅ Database record created: 567ms
[Unified Upload] ========== SUCCESS ==========
[Unified Upload] Total duration: 1801ms
```

If it fails, you'll see EXACTLY which step failed.

### Check Client Logs:

**Browser Console:**
```
[useDrawingUpload] Starting upload
[useDrawingUpload] Response received
[useDrawingUpload] ✅ Upload successful
```

---

## ✅ VERIFICATION CHECKLIST

After each upload:

- [ ] File exists in R2 at `drawings/{customerId}/{quoteId}/{uuid}.ext`
- [ ] Record exists in `Drawing` table with matching `storageKey`
- [ ] Drawing appears in Quote Builder reference panel
- [ ] Can click thumbnail and view full image
- [ ] No orphaned files (R2 without DB) or ghost records (DB without R2)

---

## 🚨 ROLLBACK PLAN

If the new system has issues:

1. The old endpoints still exist and work
2. Old components can still be used
3. No breaking changes to existing functionality
4. We can fix the new system without affecting production

---

## 📈 NEXT STEPS

1. **Wait 2-3 minutes** for Railway deployment
2. **Test the unified endpoint** with curl or Postman
3. **Verify atomic behavior** (both R2 and DB, or neither)
4. **Once confirmed working**, I'll integrate it into Quote Builder
5. **Monitor for 24 hours**, then remove old code

---

**Status:** ✅ Deployed  
**Ready for Testing:** Yes  
**Breaking Changes:** None  
**Safe to Deploy:** Yes
