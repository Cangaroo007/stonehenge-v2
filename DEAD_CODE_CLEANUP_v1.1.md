# Dead Code Cleanup - v1.1 (CORRECTED)

**Branch:** `feat/1.1-dead-code-purge`  
**Date:** 2026-02-02  
**Status:** ✅ READY FOR REVIEW

## Summary

Successfully removed **4,075 lines** of dead code with zero active imports.  
Build passes ✅ | TypeScript compiles ✅ | All verifications passed ✅

---

## What Was Deleted

### 1. ✅ stonehenge-ai-upload-feature/ (entire directory)
**Reason:** Abandoned sub-project with its own package.json, zero imports from src/

**Files removed:**
- `.env.example` (24 lines)
- `package.json` (44 lines)
- `src/app/api/analyze-drawing/route.ts` (128 lines)
- `src/components/DrawingUploadModal.tsx` (490 lines)
- `src/components/QuoteForm.tsx` (811 lines)

**Total:** 1,497 lines

---

### 2. ✅ V1 Pricing Calculator
**Reason:** Superseded by pricing-calculator-v2.ts, zero imports

**Files removed:**
- `src/lib/services/pricing-calculator.ts` (998 lines)

**Modified:**
- `src/lib/services/pricing-calculator-v2.ts`
  - Removed line 26: `export { calculateQuotePrice as calculateQuotePriceV1 } from './pricing-calculator';`
  - That line was the ONLY reference to calculateQuotePriceV1

**Total:** 998 lines

---

### 3. ✅ Dead Drawing Upload Components
**Reason:** Zero imports, superseded by DrawingImport component in quote builder

**Files removed:**
- `src/components/DrawingUploadModal.tsx` (673 lines)
- `src/components/SimpleDrawingUpload.tsx` (104 lines)
- `src/components/UnifiedDrawingUpload.tsx` (103 lines)
- `src/hooks/useDrawingUpload.ts` (124 lines)

**Active components (NOT touched):**
- `src/app/(dashboard)/quotes/[id]/builder/components/DrawingImport.tsx` ✅ KEPT
- All other quote builder components ✅ KEPT

**Total:** 1,004 lines

---

### 4. ⚠️ PricingRuleForm - NO DELETION NEEDED
**Status:** Initially deleted by mistake, then restored

**Both versions are ACTIVE and serve different purposes:**
- `src/components/PricingRuleForm.tsx` → Used by `/pricing/page.tsx` (legacy V1 pricing UI)
- `src/app/(dashboard)/admin/pricing/components/PricingRuleForm.tsx` → Used by `/admin/pricing/page.tsx` (new V2 pricing UI)

**Action taken:** Restored both files - no deletion needed

---

### 5. ✅ test-analysis Debug Page
**Reason:** Development debug page, zero source code references (only mentioned in docs)

**Files removed:**
- `src/app/test-analysis/page.tsx` (573 lines)

**Total:** 573 lines

---

## Verification Results

### ✅ Build Check
```bash
npm run build
# Exit code: 0 ✅
# All pages compiled successfully
# No TypeScript errors
# No broken imports
```

### ✅ Reference Checks
```bash
# Check for stonehenge-ai-upload references
grep -r "stonehenge-ai-upload" src/
# Result: No matches found ✅

# Check for useDrawingUpload references
grep -r "useDrawingUpload" src/ --include="*.ts" --include="*.tsx"
# Result: No matches found ✅

# Check for pricing-calculator.ts references
grep -r "pricing-calculator\.ts" src/
# Result: No matches found ✅

# Check for calculateQuotePriceV1 references
grep -r "calculateQuotePriceV1" src/
# Result: No matches found ✅
```

### ✅ Git Status
```
12 files changed, 4075 deletions(-)
```

**Files deleted:**
- D src/app/test-analysis/page.tsx
- D src/components/DrawingUploadModal.tsx
- D src/components/SimpleDrawingUpload.tsx
- D src/components/UnifiedDrawingUpload.tsx
- D src/hooks/useDrawingUpload.ts
- D src/lib/services/pricing-calculator.ts
- D stonehenge-ai-upload-feature/* (entire directory)

**Files modified:**
- M src/lib/services/pricing-calculator-v2.ts (removed 3 lines)

---

## What Was NOT Deleted (Active Code)

### Drawing Components (ACTIVE)
✅ `src/app/(dashboard)/quotes/[id]/builder/components/DrawingImport.tsx`  
✅ `src/app/(dashboard)/quotes/[id]/builder/components/DrawingReferencePanel.tsx`  
✅ All other quote builder components

### Pricing Components (ACTIVE)
✅ `src/components/PricingRuleForm.tsx` (used by /pricing page)  
✅ `src/app/(dashboard)/admin/pricing/components/PricingRuleForm.tsx` (used by /admin/pricing page)  
✅ `src/lib/services/pricing-calculator-v2.ts` (main pricing engine)

---

## Review Checklist

Before merging to main, verify:

- [ ] Run `npm run build` - should pass ✅
- [ ] Test quote builder drawing import feature
- [ ] Test pricing calculation on quotes
- [ ] Test admin pricing management page
- [ ] Test legacy pricing page (/pricing)
- [ ] Verify no console errors in browser
- [ ] Check quote PDF generation works
- [ ] Check slab optimizer still works

---

## Files Changed Summary

```
 src/app/test-analysis/page.tsx                     | 573 ------------
 src/components/DrawingUploadModal.tsx              | 673 --------------
 src/components/SimpleDrawingUpload.tsx             | 104 ---
 src/components/UnifiedDrawingUpload.tsx            | 103 ---
 src/hooks/useDrawingUpload.ts                      | 124 ---
 src/lib/services/pricing-calculator-v2.ts          |   3 -
 src/lib/services/pricing-calculator.ts             | 998 ---------------------
 stonehenge-ai-upload-feature/.env.example          |  24 -
 stonehenge-ai-upload-feature/package.json          |  44 -
 .../src/app/api/analyze-drawing/route.ts           | 128 ---
 .../src/components/DrawingUploadModal.tsx          | 490 ----------
 .../src/components/QuoteForm.tsx                   | 811 -----------------
 12 files changed, 4075 deletions(-)
```

---

## Next Steps

1. **Review this document** and the changes
2. **Test critical paths** listed in checklist above
3. **Commit the changes** with descriptive message
4. **DO NOT push to main** - push to `feat/1.1-dead-code-purge` first
5. **Test in staging/dev** environment if available
6. **Merge to main** only after verification

---

## Rollback Plan

If issues are found, rollback is simple:

```bash
# Discard all changes on this branch
git reset --hard origin/main

# Or revert the commit after merging
git revert <commit-hash>
```

All deleted code is safely preserved in git history.
