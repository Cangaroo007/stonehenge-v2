# Phase 9: Complete Pricing Model Refactor - Audit & Execution Plan

**Date:** January 31, 2026  
**Status:** Audit Complete - Ready for Execution

---

## Executive Summary

This document provides a comprehensive audit of the current state against Phase 9 requirements and a detailed execution plan. The main gap is the **UI for distance calculator in quote forms and builder**.

---

## Audit Results

### ✅ **COMPLETED** - What We Have

#### 1. Database Schema ✅
- **ServiceRate model** with thickness variants (20mm/40mm) - DONE
- **EdgeType** refactored with rate20mm, rate40mm, minimumCharge, minimumLength, isCurved - DONE
- **CutoutType** with categories (STANDARD, UNDERMOUNT_SINK, FLUSH_COOKTOP, DRAINER_GROOVE) - DONE
- **DeliveryZone** model with distance-based pricing - DONE
- **TemplatingRate** model with base + per-km - DONE
- **Quote model** with delivery/templating fields - DONE
- All enums (ServiceType, RateUnit, CutoutCategory) - DONE

#### 2. Service Layer ✅
- **distance-service.ts** with Google Maps integration - DONE
  - calculateDistance() - ✅
  - getDeliveryZone() - ✅
  - calculateDeliveryCost() - ✅
  - calculateTemplatingCost() - ✅

#### 3. API Endpoints ✅
- `/api/admin/pricing/service-rates` (GET, POST) - DONE
- `/api/admin/pricing/service-rates/[id]` (GET, PUT, DELETE) - DONE
- `/api/admin/pricing/delivery-zones` (GET, POST) - DONE
- `/api/admin/pricing/delivery-zones/[id]` (GET, PUT, DELETE) - DONE
- `/api/admin/pricing/templating-rates` (GET, POST) - DONE
- `/api/admin/pricing/templating-rates/[id]` (GET, PUT, DELETE) - DONE
- `/api/admin/pricing/edge-types` - DONE
- `/api/admin/pricing/cutout-types` - DONE
- **`/api/distance/calculate`** - DONE (critical for UI)

#### 4. Pricing Calculator ✅
- **pricing-calculator.ts** exists with rule engine - DONE
- Calculates edge costs (but needs verification of FINISHED EDGES ONLY logic)
- Calculates material costs with thickness multipliers
- Applies customer tier discounts
- GST calculation at 10%

#### 5. Admin UI ✅
- **Admin pricing page** (`/admin/pricing/page.tsx`) - DONE
- Tabs for edge types, cutout types, thickness, client types, client tiers, pricing rules, price books - DONE
- EntityTable, EntityModal components - DONE
- EdgeTypeForm, CutoutTypeForm, ThicknessForm, etc. - DONE

#### 6. Environment Configuration ✅
- `GOOGLE_MAPS_API_KEY` configured - ✅
- `COMPANY_ADDRESS` (workshop address) configured - ✅

---

### ❌ **MISSING** - Critical Gaps

#### 1. **Distance Calculator UI in Quote Forms** ❌ CRITICAL
**Current State:**
- QuoteForm.tsx (`/quotes/new/page.tsx`) has NO distance calculator UI
- Quote Builder (`/quotes/[id]/builder/page.tsx`) has NO distance calculator UI
- Both forms collect `projectAddress` but don't calculate distance/delivery/templating costs
- Quote Edit pages don't have distance calculator either

**Required:**
- Add "Delivery & Templating" section to new quote form
- Add "Delivery & Templating" section to quote builder
- Implement address input with "Calculate Distance" button
- Display distance, zone, delivery cost, templating cost
- Allow toggling templating on/off
- Allow manual override of costs
- Save calculated values to quote
- Show in pricing summary

#### 2. **Pricing Calculator Logic Verification** ⚠️ NEEDS AUDIT
**Current Implementation Review Needed:**
```typescript
// pricing-calculator.ts lines 454-519
function calculateEdgeLength(piece) {
  // CRITICAL: Does this calculate FULL PERIMETER or FINISHED EDGES ONLY?
  // Need to verify edge selection logic
}
```

**Phase 9 Requirements:**
- **Cutting:** FULL PERIMETER (all 4 sides) × rate
- **Polishing:** FINISHED EDGES ONLY × rate
- **Edge Profiles:** ADDITIONAL to base polishing

**Current Code Analysis:**
- Lines 465-519 seem to extract edge types from `piece.features`
- Does NOT appear to separate cutting vs polishing calculations
- May not properly apply thickness-specific rates from ServiceRate model

#### 3. **ServiceRate Usage in Calculator** ❌ NOT IMPLEMENTED
**Current State:**
- ServiceRate model exists in schema
- NOT used in pricing-calculator.ts
- Calculator still uses old `edgeType.baseRate` directly
- Does NOT fetch or apply ServiceRate.rate20mm / rate40mm

**Required:**
- Fetch ServiceRate records for CUTTING, POLISHING, INSTALLATION, WATERFALL_END
- Apply correct thickness rate (20mm vs 40mm+)
- Calculate cutting on FULL perimeter using ServiceRate.CUTTING
- Calculate polishing on FINISHED edges using ServiceRate.POLISHING
- Add edge profile costs on top of base polishing

#### 4. **Seed Data for New Models** ⚠️ PARTIAL
**Current seed.ts:**
- ✅ Has edgeTypes (but no rate20mm/rate40mm populated)
- ✅ Has cutoutTypes (but no category assigned)
- ✅ Has thicknessOptions (but only 20mm and 40mm, missing 30mm)
- ❌ NO ServiceRate seeding
- ❌ NO DeliveryZone seeding
- ❌ NO TemplatingRate seeding

**Required:**
- Add seedServiceRates() function
- Add seedDeliveryZones() function
- Add seedTemplatingRate() function
- Update edgeTypes seed to include rate20mm/rate40mm
- Update cutoutTypes seed to include category

#### 5. **Pricing Helpers Missing** ❌ NOT FOUND
**Status:** `pricing-helpers.ts` file does NOT exist

**Required Functions (from Phase 9 spec):**
- getThicknessRate(rate20mm, rate40mm, thickness)
- calculatePerimeterLm(lengthMm, widthMm)
- calculateAreaM2(lengthMm, widthMm)
- calculateFinishedEdgesLm(lengthMm, widthMm, edges)
- calculateEdgeProfileCost(edgeType, lengthMm, thickness)
- applyMinimum(calculatedAmount, minimumCharge, minimumQty, actualQty, rate, waiveMinimum)
- toNumber(Decimal | number)
- roundCurrency(number)

#### 6. **Admin UI for ServiceRate** ❌ MISSING
**Current State:**
- Admin pricing page has tabs for edge types, cutout types, etc.
- NO tab for "Service Rates"
- NO ServiceRateForm component

**Required:**
- Add "Service Rates" tab to admin pricing page
- Create ServiceRateForm component
- Display table with: Service Type, Name, 20mm Rate, 40mm+ Rate, Unit, Minimum Charge/Qty
- Allow inline editing

#### 7. **Quote Pricing Overrides** ❌ NOT IMPLEMENTED
**Status:** QuotePricingOverride model does NOT exist in schema

**Required:**
- Add QuotePricingOverride model to schema
- Add API endpoints for managing overrides
- Add UI in quote builder to apply overrides
- Implement override logic in calculator

---

## Detailed Execution Plan

### Phase 9.1: ✅ MOSTLY COMPLETE - Needs Seed Data
**Status:** Schema exists, API exists, needs seeds and helper functions

**Remaining Tasks:**
1. Create `src/lib/services/pricing-helpers.ts` with all helper functions
2. Add ServiceRate seeding to `prisma/seed.ts`
3. Run `npx prisma db seed`
4. Verify data in Prisma Studio

**Estimated Time:** 30 minutes

---

### Phase 9.2: ✅ MOSTLY COMPLETE - Needs Seed Updates
**Status:** Schema has rate20mm/rate40mm, needs seed data updates

**Remaining Tasks:**
1. Update edgeTypes seed to populate rate20mm and rate40mm
2. Run `npx prisma db seed`

**Estimated Time:** 15 minutes

---

### Phase 9.3: ✅ MOSTLY COMPLETE - Needs Seed Updates
**Status:** Schema has CutoutCategory enum, needs seed data updates

**Remaining Tasks:**
1. Update cutoutTypes seed to assign categories
2. Run `npx prisma db seed`

**Estimated Time:** 15 minutes

---

### Phase 9.4: ✅ COMPLETE
**Status:** Fully implemented - DeliveryZone, TemplatingRate, distance-service, API all working

**Remaining Tasks:**
1. Add DeliveryZone seeding
2. Add TemplatingRate seeding
3. Run seed

**Estimated Time:** 15 minutes

---

### Phase 9.5: ❌ NOT STARTED - Quote Pricing Overrides
**Status:** Model doesn't exist, needs full implementation

**Tasks:**
1. Add QuotePricingOverride model to schema
2. Create migration
3. Create API endpoints
4. Add helper functions for checking overrides
5. Integrate into calculator

**Estimated Time:** 1.5 hours

---

### Phase 9.6: ⚠️ NEEDS MAJOR REFACTOR - Pricing Calculator
**Status:** Existing calculator needs to be refactored to use new models

**Critical Changes Required:**
1. Fetch ServiceRate records (CUTTING, POLISHING, INSTALLATION)
2. Calculate cutting on FULL PERIMETER using thickness rate
3. Calculate polishing on FINISHED EDGES ONLY using thickness rate
4. Add edge profile costs ADDITIONAL to base polishing
5. Apply cutout categories
6. Include delivery and templating costs
7. Apply overrides
8. Update all calculation breakdowns

**Estimated Time:** 3 hours

---

### Phase 9.7: ⚠️ PARTIALLY COMPLETE - Admin UI
**Status:** Most tabs exist, missing Service Rates tab

**Tasks:**
1. Add "Service Rates" tab to admin pricing page
2. Create ServiceRateForm component
3. Add to columnConfigs
4. Test CRUD operations

**Estimated Time:** 45 minutes

---

### Phase 9.8: ❌ **CRITICAL** - Distance Calculator UI (NEW)
**Status:** NOT STARTED - This is the main gap

**Tasks:**

#### A. Create Reusable DistanceCalculator Component
```typescript
// src/components/DistanceCalculator.tsx
- Address input field
- "Calculate Distance" button
- Display results (distance, zone, delivery cost, templating cost)
- Templating toggle
- Manual override fields
- Loading/error states
```

#### B. Integrate into New Quote Form
```typescript
// src/components/QuoteForm.tsx
- Add DistanceCalculator section after project details
- Store delivery/templating data in state
- Include in quote payload on save
```

#### C. Integrate into Quote Builder
```typescript
// src/app/(dashboard)/quotes/[id]/builder/page.tsx
- Add DistanceCalculator section
- Fetch existing delivery/templating data from quote
- Update quote when distance is calculated
- Include in pricing summary
```

#### D. Update PricingSummary Component
```typescript
// Display delivery cost line item
// Display templating cost line item
// Include in final total
```

**Estimated Time:** 2.5 hours

---

## Total Remaining Work

| Task | Status | Time | Priority |
|------|--------|------|----------|
| 9.1 - Pricing Helpers + Seeds | 🟡 Partial | 30 min | HIGH |
| 9.2 - EdgeType Seeds | 🟡 Partial | 15 min | MEDIUM |
| 9.3 - CutoutType Seeds | 🟡 Partial | 15 min | MEDIUM |
| 9.4 - Delivery/Templating Seeds | 🟡 Partial | 15 min | MEDIUM |
| 9.5 - Quote Overrides | 🔴 Not Started | 1.5 hrs | LOW |
| 9.6 - Calculator Refactor | 🔴 Major Work | 3 hrs | **CRITICAL** |
| 9.7 - Service Rates Admin UI | 🟡 Partial | 45 min | MEDIUM |
| **9.8 - Distance Calculator UI** | 🔴 Not Started | **2.5 hrs** | **CRITICAL** |

**Total Estimated Time:** ~8.5 hours

**Critical Path (Must Do First):**
1. **Phase 9.8** - Distance Calculator UI (2.5 hrs) ⭐ USER'S MAIN CONCERN
2. **Phase 9.6** - Calculator Refactor (3 hrs) ⭐ FUNCTIONALITY
3. **Phase 9.1** - Pricing Helpers + Seeds (30 min) - BLOCKER for 9.6

**Can Do in Parallel:**
- Phase 9.2, 9.3, 9.4 seeds
- Phase 9.7 Admin UI

**Can Skip for MVP:**
- Phase 9.5 (Quote Overrides) - Nice to have, not blocking

---

## Recommended Execution Order

### Priority 1: Core Functionality (4 hours)
1. **Create pricing-helpers.ts** (30 min)
2. **Seed all new data** (45 min)
3. **Refactor pricing calculator** (3 hrs)

### Priority 2: Distance Calculator UI (2.5 hours) ⭐
4. **Create DistanceCalculator component** (1 hr)
5. **Integrate into QuoteForm** (45 min)
6. **Integrate into Quote Builder** (45 min)

### Priority 3: Admin Polish (45 min)
7. **Add Service Rates admin tab** (45 min)

### Priority 4: Advanced Features (Optional)
8. **Quote Pricing Overrides** (1.5 hrs) - Can skip for MVP

---

## Questions for User

1. **Do you want me to execute all phases now, or focus on the Distance Calculator UI first?**
   - Option A: Start with Phase 9.8 (Distance Calculator UI) - fastest path to visible feature
   - Option B: Do full refactor in correct order (9.1 → 9.2 → 9.3 → 9.4 → 9.6 → 9.8 → 9.7)
   - Option C: Skip Quote Overrides (9.5) to save 1.5 hours

2. **Do you need the calculator to distinguish between CUTTING and POLISHING rates?**
   - Current: Single "edge" rate applied to finished edges
   - Phase 9 spec: Separate cutting (full perimeter) + polishing (finished edges only)

3. **Should delivery/templating be REQUIRED fields or optional?**
   - Required: Force distance calculation before saving quote
   - Optional: Allow manual entry or skipping

---

## Next Steps

**AWAITING USER DECISION:**
Please confirm:
1. Which execution path you prefer (A, B, or C above)
2. Whether to implement full cutting/polishing separation
3. Whether delivery/templating should be required or optional

Once confirmed, I'll proceed with implementation.
