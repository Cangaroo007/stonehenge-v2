# COMPLETE FIX PLAN - Drawing Uploads

## ✅ Phase 1: Unified System (DONE)

Created atomic upload system:
- `/api/drawings/upload-complete` - one endpoint that does everything
- `useDrawingUpload` hook - one interface for all components
- `UnifiedDrawingUpload` component - simple drop-in replacement

**Status:** Deployed, waiting for build to complete

---

## 🔧 Phase 2: Fix Both Upload Paths (NEXT)

### Problem Identified:

**Two different upload flows are both broken:**

1. **QuoteForm.tsx** (New Quote page)
   - Lines 930-966
   - Uses OLD two-step process:
     1. `/api/upload/drawing` (uploads to R2)
     2. `/api/quotes/${id}/drawings` (saves to DB)
   - Problem: If step 2 fails, file is in R2 but not in DB

2. **DrawingImport.tsx** (Quote Builder)
   - Lines 168-220 and 224-265
   - Uses SAME OLD two-step process
   - Same problem

### Solution:

Replace BOTH with the new unified system.

---

## 📝 Code Changes Required

### 1. Fix QuoteForm.tsx

**Replace lines 915-976 with:**

```typescript
// If we have a file to upload and a customerId, upload it using unified endpoint
if (fileToUpload && customerId && !initialData) {
  console.log('[QuoteForm] ✅ Uploading drawing via unified endpoint...', {
    quoteId: data.id,
    customerId,
    filename: fileToUpload.name
  });

  try {
    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('quoteId', data.id.toString());

    const uploadResponse = await fetch('/api/drawings/upload-complete', {
      method: 'POST',
      body: formData,
    });
    
    if (!uploadResponse.ok) {
      const error = await uploadResponse.json();
      console.error('[QuoteForm] Upload failed:', error);
      throw new Error(error.error || 'Failed to upload drawing');
    }
    
    const result = await uploadResponse.json();
    console.log('[QuoteForm] ✅ Drawing uploaded successfully:', result.drawing);
    
  } catch (uploadErr) {
    console.error('[QuoteForm] ❌ Upload error:', uploadErr);
    toast.error('Quote created but drawing upload failed. You can upload it again from the Quote Builder.');
  }
}
```

### 2. Fix DrawingImport.tsx

**Option A: Use the hook directly**

Replace the entire `uploadToStorage` and `saveDrawingRecord` functions with:

```typescript
import { useDrawingUpload } from '@/hooks/useDrawingUpload';

// Inside component:
const { upload } = useDrawingUpload();

// Replace both uploadToStorage and saveDrawingRecord calls with:
const drawing = await upload(file, parseInt(quoteId));
```

**Option B: Keep the existing flow but call unified endpoint**

Replace lines 190-223 in `uploadToStorage`:

```typescript
const response = await fetch('/api/drawings/upload-complete', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
if (!result.success) {
  throw new Error(result.error || 'Upload failed');
}

return {
  storageKey: result.drawing.storageKey,
  filename: result.drawing.filename,
  mimeType: result.drawing.mimeType,
  fileSize: result.drawing.fileSize,
};
```

Then **delete the entire `saveDrawingRecord` function** (lines 224-265) because the unified endpoint already saved to DB.

Remove all calls to `saveDrawingRecord` (lines 363, 419).

---

## 🧪 Testing Plan

### After Build Completes:

1. **Test New Quote Upload:**
   - Go to "New Quote" page
   - Select customer
   - Upload drawing
   - **Verify:**
     - File appears in R2 at `drawings/{customerId}/{quoteId}/{uuid}.pdf`
     - Record exists in Database with matching storageKey
     - Can see drawing in Quote Builder

2. **Test Quote Builder Upload:**
   - Open existing quote
   - Click "Import Drawing"
   - Upload drawing
   - **Verify:**
     - Same checks as above
     - Drawing appears in reference panel immediately

3. **Test Failure Scenarios:**
   - Upload with invalid file type → should fail gracefully, nothing saved
   - Upload with >10MB file → should fail gracefully, nothing saved
   - Simulated R2 failure → should fail gracefully, nothing in DB either

---

## 🗑️ Cleanup (After Testing)

Once both paths work:

1. **Delete old API endpoint:**
   - `/src/app/api/upload/drawing/route.ts`

2. **Delete old components:**
   - `/src/components/DrawingUploadModal.tsx` (if not used)
   - `/src/components/SimpleDrawingUpload.tsx` (was just for testing)

3. **Simplify DrawingImport:**
   - Remove complex two-step logic
   - Just use the hook

---

## 📊 Current Status

- ✅ Unified system created and deployed
- ⏳ Waiting for Railway build (fixing Prisma JSON type error)
- 🔄 Next: Test unified endpoint, then migrate both components
- ⏸️ Pending: Cleanup old code

---

## 🎯 Expected Outcome

After all phases complete:

- **ONE upload path** used everywhere
- **Atomic transactions** - both R2 and DB or neither
- **Consistent behavior** between New Quote and Quote Builder
- **Database always has records** when files are in R2
- **No orphaned files** or ghost database entries
- **Easy to debug** with comprehensive logging

---

**Current Blocker:** Railway build in progress
**ETA:** 2-3 minutes
**Next Action:** Test unified endpoint, then migrate components
