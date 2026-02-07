# Stonehenge v2 - Comprehensive Audit & Fix Plan
**Date**: February 7, 2026  
**Railway Status**: ✅ Build deployed, but runtime Prisma type errors present

---

## Executive Summary

The application successfully builds and deploys on Railway, but has **critical runtime issues** and **UI/UX improvements** needed. This document provides a comprehensive assessment and action plan.

---

## 🚨 CRITICAL ISSUES (Blocking Production Use)

### 1. Prisma Type Mismatch Errors
**Status**: 🔴 Critical  
**Impact**: Runtime failures on company settings, quotes, and PDF generation

**Error Pattern**:
```
Error converting field "id" of expected non-nullable type "String", found incompatible value of "1".
Error converting field "company_id" of expected non-nullable type "String", found incompatible value of "1".
```

**Root Cause**: Schema defines these fields as `String` but database contains `Int` values.

**Affected Models**:
- `companies` (id field)
- `quotes` (company_id field)
- Any other models with mismatched String/Int types

**Fix Required**:
1. Audit `prisma/schema.prisma` for all ID fields
2. Determine correct type strategy:
   - Option A: Change schema to `Int` and migrate database
   - Option B: Change schema to `String` and convert existing data
   - **Recommended**: Use `Int` for performance (auto-increment)
3. Create and run migration
4. Test all affected endpoints

**Files to Check**:
- `prisma/schema.prisma` - all `@id` and foreign key fields
- All API routes that query these models
- All client components that create/update records

---

## 🎯 HIGH PRIORITY ISSUES (User Experience Blockers)

### 2. Unit Block Projects Not Visible in Menu
**Status**: 🟡 High Priority  
**Current State**: 
- ✅ Menu item exists in `Sidebar.tsx` (line 10)
- ✅ Routes exist (`/quotes/unit-block`, `/quotes/new/unit-block`)
- ✅ Calculator logic implemented
- ❌ **BUT**: May not be rendering due to CSS/layout issues or conditional rendering

**Possible Causes**:
1. Sidebar not mounted on certain routes
2. CSS hiding the menu item
3. Authentication/permission check hiding it
4. Build artifact mismatch (old cached build)

**Fix Required**:
1. Force a complete Railway rebuild (clear cache)
2. Check if `Sidebar.tsx` is imported in layout
3. Verify no conditional logic hides the menu item
4. Test on production URL after deployment

**Files to Review**:
- `src/components/Sidebar.tsx` (already correct)
- `src/app/(dashboard)/layout.tsx` (check if Sidebar is mounted)
- Browser DevTools to inspect if element exists but is hidden

---

### 3. Piece Editor in Wrong Location
**Status**: 🟡 High Priority  
**Current State**: Piece editor appears in **right sidebar** (column 3 of 3-column grid)  
**Desired State**: Piece editor should be in **main body**, use tabs to organize sections

**Current Layout** (`quotes/[id]/builder/page.tsx`, lines 617-750):
```
Grid: lg:grid-cols-3
├─ Column 1-2 (lg:col-span-2): Pieces List
│  ├─ OptimizationDisplay
│  └─ Pieces Card (with List/Room toggle)
└─ Column 3 (lg:col-span-1): RIGHT SIDEBAR
   ├─ DrawingReferencePanel
   ├─ DeliveryTemplatingCard
   ├─ Piece Editor ← MOVE THIS
   └─ PricingSummary
```

**Proposed Layout**:
```
Main Content Area (full width):
├─ Tab 1: Pieces & Pricing
│  ├─ Optimization Display (collapsible)
│  ├─ Pieces List/Grid
│  └─ Piece Editor (inline, opens below selected piece)
├─ Tab 2: Drawings & References
│  └─ Drawing Reference Panel (full width)
├─ Tab 3: Delivery & Project Details
│  └─ Delivery/Templating form (full width)
├─ Tab 4: History
│  └─ Version History
└─ Sticky Footer: Pricing Summary (always visible)
```

**Benefits**:
- More screen real estate for piece editor
- Better mobile responsiveness
- Cleaner, more modern UX
- Reduces horizontal scrolling
- Groups related functionality

**Implementation**:
1. Refactor `builder/page.tsx` layout from 3-column grid to single-column with tabs
2. Move PieceForm into main content area, display inline below selected piece
3. Convert right sidebar items to tabs or modals
4. Make PricingSummary a sticky footer or slide-in panel
5. Update responsive breakpoints

**Estimated Impact**: 
- ~300 lines of layout restructuring
- Test on mobile, tablet, desktop viewports
- May need new components: `<TabContent>`, `<StickyPricingFooter>`

---

### 4. Version History Not on Quote Detail Page
**Status**: 🟡 High Priority  
**Current State**: Version history exists in **builder page** (lines 598-611) with tabs  
**Expected State**: Version history should also be on **quote detail page** (`/quotes/[id]/page.tsx`)

**Fix Required**:
1. The summary mentions "Tabs added to quote detail page" but `quotes/[id]/page.tsx` does NOT have tabs
2. Builder page DOES have History tab (correct)
3. Need to add similar tab structure to detail page
4. Import `VersionHistoryTab` component
5. Add tab navigation similar to builder page

**Files to Modify**:
- `src/app/(dashboard)/quotes/[id]/page.tsx` - add tabs
- May need to extract tab logic into shared component

---

## ⚙️ MEDIUM PRIORITY ISSUES (Functionality Gaps)

### 5. Large Piece Auto-Breakdown Not Implemented
**Status**: 🟠 Medium Priority  
**Current State**:
- ✅ Join cost calculation exists (`pricing-calculator-v2.ts`, line 326)
- ✅ Join types defined (`types.ts`, line 149-159)
- ❌ **Missing**: Auto-detection and splitting of oversized pieces into sub-pieces

**Expected Behavior** (from summary):
- Auto-detect pieces larger than slab in both dimensions
- Smart split along longest dimension
- Create sub-pieces with join edges marked as finished
- Label as "Piece Name (Part 1/2)"
- Show breakdown summary in optimization results

**Current Behavior**:
- Optimizer marks oversized pieces as "unplaced"
- No automatic splitting
- Join costs calculated manually

**Fix Required**:
1. Create `detectOversizedPieces()` function
2. Create `splitPieceAlongAxis()` function
3. Integrate into optimization workflow BEFORE optimizer runs
4. Update piece labels with " (Part X/Y)"
5. Mark join edges as finished
6. Update OptimizationDisplay to show breakdown summary

**New Files Needed**:
- `src/lib/services/piece-splitter.ts`

**Files to Modify**:
- `src/lib/services/slab-optimizer.ts` - call splitter before optimization
- `src/components/OptimizationDisplay.tsx` - show breakdown summary
- `src/types/slab-optimization.ts` - add breakdown types

---

## ✅ CONFIRMED WORKING FEATURES

### 6. Machine-Aware Optimization ✅
- ✅ Machine profiles exist (`machine_profiles` table)
- ✅ Kerf width tracking per machine
- ✅ Dropdown selector per piece
- ✅ API endpoints: `/api/admin/pricing/machines/*`
- ✅ Used in optimizer (line 247-249 of `slab-optimizer.ts`)

### 7. Visual Layout Tool ✅
- ✅ `OptimizationVisualizer` component exists
- ✅ Visual/List toggle in builder page (lines 629-650)
- ✅ Multi-slab navigation with tabs
- ✅ Piece selection and detail view
- ✅ Shows machine and kerf info

### 8. Unit Block Projects (Code) ✅
- ✅ Routes exist and working
- ✅ Calculator implemented (`unit-block-calculator.ts`)
- ✅ Volume pricing tiers (0/5/10/15%)
- ✅ Menu item defined
- ⚠️ **BUT**: Not visible in production (see Issue #2)

### 9. Slab Optimizer Logic ✅
- ✅ **Kerfs handled**: Lines 247-249 add kerf to all pieces
- ✅ **Laminates tracked**: Lines 208-218 generate strips for 40mm+ pieces
- ✅ **Joint management**: Mitre formula (FinishedThickness + Kerf + 5mm) on lines 43-47
- ✅ Lamination summary generated (lines 327-328)

---

## 📋 ACTION PLAN

### Phase 1: Critical Fixes (Must Do First)
**Priority**: 🔴 Critical  
**Estimated Time**: 2-3 hours

1. **Fix Prisma Type Mismatches**
   - [ ] Audit all ID fields in schema
   - [ ] Decide on Int vs String strategy
   - [ ] Create migration
   - [ ] Test all affected endpoints
   - [ ] Deploy and verify

2. **Verify Unit Block Menu Visibility**
   - [ ] Clear Railway build cache and redeploy
   - [ ] Check production site for menu item
   - [ ] If still missing, debug layout/sidebar mounting
   - [ ] Test navigation to all Unit Block routes

### Phase 2: High-Impact UX Improvements
**Priority**: 🟡 High  
**Estimated Time**: 6-8 hours

3. **Refactor Quote Builder Layout**
   - [ ] Design new tab-based layout (sketch/wireframe)
   - [ ] Create new components: `<BuilderTabs>`, `<StickyPricingSummary>`
   - [ ] Refactor builder page from 3-column to tabbed layout
   - [ ] Move piece editor inline below selected piece
   - [ ] Test responsive behavior
   - [ ] Update keyboard shortcuts/navigation

4. **Add Version History to Quote Detail Page**
   - [ ] Import `VersionHistoryTab` component
   - [ ] Add tab navigation to detail page
   - [ ] Test restore functionality
   - [ ] Verify non-destructive rollback works

### Phase 3: Feature Completeness
**Priority**: 🟠 Medium  
**Estimated Time**: 4-6 hours

5. **Implement Large Piece Auto-Breakdown**
   - [ ] Create `piece-splitter.ts` service
   - [ ] Implement detection logic (check slab dimensions)
   - [ ] Implement splitting algorithm
   - [ ] Add breakdown summary to optimization results
   - [ ] Test with various oversized pieces
   - [ ] Update documentation

6. **Polish & Testing**
   - [ ] Run full E2E test suite
   - [ ] Test all workflows: Create quote → Add pieces → Optimize → Export PDF
   - [ ] Test Unit Block project workflow
   - [ ] Mobile responsiveness check
   - [ ] Performance audit (Lighthouse)

---

## 🔧 TECHNICAL DEBT & FUTURE ENHANCEMENTS

### Low Priority (Nice to Have)
- [ ] Add undo/redo for piece edits
- [ ] Improve optimization algorithm (consider genetic algorithms)
- [ ] Add drag-and-drop piece reordering
- [ ] Export optimization visuals as images
- [ ] Add keyboard shortcuts for common actions
- [ ] Dark mode support
- [ ] Internationalization (i18n)

---

## 📊 TESTING CHECKLIST

### Before Marking as Complete
- [ ] All Prisma queries return correct data types
- [ ] No console errors in production
- [ ] Unit Block menu visible and functional
- [ ] Piece editor accessible and responsive
- [ ] Version history works on both pages
- [ ] Slab optimizer handles kerfs, laminates, joins
- [ ] PDF export works without errors
- [ ] Mobile view is usable
- [ ] All navigation links work
- [ ] Authentication/permissions work correctly

---

## 🎯 SUCCESS METRICS

**Definition of Done**:
1. ✅ No runtime Prisma errors in Railway logs
2. ✅ Unit Block menu visible on all screen sizes
3. ✅ Piece editor in main body with improved UX
4. ✅ Version history accessible from detail page
5. ✅ Large pieces automatically split with join handling
6. ✅ All existing features continue to work
7. ✅ Build passes on Railway without errors
8. ✅ Lighthouse performance score > 80

---

## 📝 NOTES

### Current Working Features (Don't Break These!)
- Quote creation and editing
- Customer management
- Material selection
- Edge type configuration
- Cutout management
- Optimization with visual display
- PDF generation
- Drawing imports
- User authentication
- Pricing calculations
- Discount management
- Delivery/templating

### Known Limitations (Document, Don't Fix Yet)
- Optimizer sometimes has suboptimal packing (acceptable)
- PDF styling could be improved (cosmetic)
- Drawing analysis accuracy varies (ML limitation)
- No real-time collaboration (not in scope)

---

## 🔗 REFERENCES

- Railway Project: https://railway.com/project/6ba85fd6-2467-437d-bc91-b428328c9aac
- Repo: https://github.com/Cangaroo007/stonehenge-v2.git
- Previous Fix Docs:
  - `DEPLOYMENT_FIX_FEB7.md`
  - `SCHEMA_NAMING_ISSUES.md`
  - `COMPLETE_SCHEMA_AUDIT.md`
  - `DEPLOYMENT_SUCCESS.md`

---

**Last Updated**: February 7, 2026  
**Next Review**: After Phase 1 completion
