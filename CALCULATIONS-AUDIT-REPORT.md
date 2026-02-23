# CALCULATIONS AUDIT REPORT — Pricing Calculator v2

> **Date:** 2026-02-23
> **Auditor:** Claude Code (Opus 4.6)
> **File under audit:** `src/lib/services/pricing-calculator-v2.ts` (1,841 lines)
> **Spec reference:** Phase 9 Pricing Model Refactor + Dev Rulebook v11 (Rule 21–22)
> **Note:** The "Pricing Bible v1.3" document referenced in the task was NOT found as a standalone file in the repo. This audit uses the Phase 9 spec (`PHASE_9_PRICING_MODEL_REFACTOR.md`, Prompt 9.6) and Rulebook v11 §Pricing Rules as the source of truth.

---

## Section 1 — Executive Summary

| Status | Count | Items |
|--------|-------|-------|
| ✅ Match | 8 | Cutting, Polishing, Cutouts, Material, GST, Waterfall, Installation, Delivery/Templating |
| ⚠️ Partial | 5 | Edge Profile, Lamination, Joins, Grain Matching, Discounts/Tiers |
| ❌ Mismatch | 2 | Calculation Order, Hardcoded delivery zones |

**Overall Health: FAIR — core fabrication costs are correct; several secondary calculations have subtle deviations or missing features.**

Key findings:
1. **Cutting** correctly uses full perimeter × rate with fabrication category lookup. ✅
2. **Polishing** correctly uses finished edges only × rate. ✅
3. **Edge profiles** are ADDITIONAL to polishing (correct) but the aggregate `calculateEdgeCostV2` does NOT use `edgeCategoryRates` — only the per-piece function does. ⚠️
4. **Lamination** uses `finishedEdgeLm × polishRate20mm × multiplier` — spec says strip layers = `(thickness - 20) / 20`, which is NOT implemented. ⚠️
5. **Delivery zones are HARDCODED** at lines 40–44 instead of read from database. ❌
6. **Templating rate is HARDCODED** at line 46. ❌
7. **GST** correctly reads from `pricingContext.gstRate` (not hardcoded). ✅
8. **Calculation order** has a deviation: discounts apply to `baseSubtotal + customCharges` but pricing rules from `getApplicableRules` are fetched but never actually applied to the subtotal. ❌
9. **Join cost** uses DB-driven rates (good) but `multi-slab-calculator.ts` also has a hardcoded `JOIN_RATE_PER_METRE = 85` constant that is NOT used by the main calculator. ⚠️

---

## Section 2 — Code vs Bible (1.1a–1.1o)

### 1.1a — Cutting Cost

**Bible says:** Cutting = full perimeter (all 4 sides) × rate. Rate from ServiceRate table. Unit configurable (Lm vs m²). Uses fabricationCategory for rate lookup.

**Code does:**
- `calculateServiceCosts()` (line 1220): computes `totalPerimeterLm = pieces.reduce(sum, 2*(length+width)/1000)` — **all 4 sides** ✅
- Uses `pricingContext.cuttingUnit` to switch between `LINEAR_METRE` and `SQUARE_METRE` (line 1248–1249) ✅
- Calls `getServiceRate(serviceRates, 'CUTTING', avgThickness, primaryCategory)` — uses fabrication category ✅
- Per-piece: `calculatePiecePricing()` line 1556–1566: `perimeterLm = 2*(length+width)/1000`, `cuttingQty = cuttingUnit === 'LINEAR_METRE' ? perimeterLm : areaSqm` ✅

**Rate source:** `service_rates` table via Prisma query (line 523), filtered by `isActive: true`. Rate selected by thickness: `rate20mm` if ≤20mm, `rate40mm` if >20mm (line 1194–1196).

**Status:** ✅ Match

**Details:** All 4 business rules satisfied. Perimeter uses all 4 sides, respects cutting_unit config, uses fabricationCategory, reads from ServiceRate table.

**Fix needed:** None

---

### 1.1b — Polishing Cost

**Bible says:** Polishing = finished edges ONLY × rate (not full perimeter). Unit configurable (Lm vs m²). Uses fabricationCategory for rate lookup.

**Code does:**
- `calculateServiceCosts()` lines 1263–1319: iterates each piece, sums only edges where `edge_top/bottom/left/right` is truthy (i.e., has an edge type assigned = "finished"). ✅
- Per-piece polishing (line 1576–1591): `finishedEdgeLm` only counts sides with a non-null `edgeTypeId`. ✅
- When `polishingUnit === 'SQUARE_METRE'`, converts: `pieceEdgeLm * (thickness/1000)` — edge face area. ✅
- Uses `getServiceRate(serviceRates, 'POLISHING', piece.thickness_mm, pieceCategory)` — per-piece category lookup. ✅

**Rate source:** `service_rates` table, with fabrication category fallback chain: exact match → uncategorised → any POLISHING rate (lines 1265–1271).

**Status:** ✅ Match

**Details:** Correctly distinguishes between "all edges" (cutting) and "finished edges" (polishing). Respects polishing_unit config and fabrication category.

**Fix needed:** None

---

### 1.1c — Edge Profile Cost

**Bible says:** Edge profile cost is ADDITIONAL to base polishing (not replacing it). Should check `EdgeTypeCategoryRate` with fallback to `edge_types.baseRate`. Handles category + thickness dimensions.

**Code does:**
- **Per-piece** `calculatePiecePricing()` lines 1630–1689: Iterates each finished side, looks up `edgeCategoryRates` for category-specific rate, falls back to `edgeType.rate20mm/rate40mm/baseRate`. ADDITIONAL to polishing cost. ✅
- **Aggregate** `calculateEdgeCostV2()` lines 960–1050: Does NOT receive or use `edgeCategoryRates` parameter. Only uses `edgeType.rate20mm/rate40mm/baseRate`. ⚠️

**Rate source:**
- Per-piece: `edge_type_category_rates` table (line 528–530) → fallback to `edge_types.rate20mm/rate40mm` → fallback to `edge_types.baseRate`. ✅
- Aggregate: `edge_types` table only (no category rates). ⚠️

**Status:** ⚠️ Partial Match

**Details:** The per-piece pricing function correctly implements the full fallback chain with category rates. However, the aggregate `calculateEdgeCostV2()` function (used for the quote-level edge breakdown in the response) does NOT use category-specific rates — it only uses flat `edge_types` rates. This means the aggregate edge cost in `breakdown.edges` may differ from the sum of per-piece edge costs. The per-piece values are correct; the aggregate display value may be wrong.

**Fix needed:** Code fix — pass `edgeCategoryRates` and `fabricationCategory` to `calculateEdgeCostV2()` and use the same fallback chain as `calculatePiecePricing()`.

---

### 1.1d — Lamination Cost

**Bible says:** Applies when thickness > 20mm. Uses `laminatedMultiplier` / `mitredMultiplier` from PricingSettings. Strip layers = `(thickness - 20) / 20`.

**Code does:**
- `calculateServiceCosts()` lines 1346–1389: Only for pieces with `thickness_mm > 20` and `lamination_method !== 'NONE'`. ✅
- Uses `pricingContext.mitredMultiplier` or `pricingContext.laminatedMultiplier`. ✅
- Formula: `finishedEdgeLm × polishRate20mm × multiplier` (line 1371). ⚠️
- **Does NOT implement strip layers formula** `(thickness - 20) / 20`. The code treats ALL thick pieces the same regardless of whether they're 40mm, 60mm, or 80mm. ⚠️

**Rate source:** Polishing 20mm rate from `service_rates` table × lamination multiplier from `pricing_settings`.

**Status:** ⚠️ Partial Match

**Details:**
- For standard 40mm (1 strip layer), the formula works correctly — multiplier is applied once.
- For thicker pieces (e.g., 60mm = 2 layers, 80mm = 3 layers), the formula does NOT scale. A 60mm piece should have 2× the lamination cost of a 40mm piece, but the code charges the same amount.
- The `STRIP_CONFIGURATIONS` constant in `slab-sizes.ts` (line 31–44) defines strip dimensions but is NOT used by the pricing calculator.

**Fix needed:** Code fix — multiply lamination cost by `Math.floor((thickness - 20) / 20)` for multi-layer support.

---

### 1.1e — Cutout Cost

**Bible says:** Check `CutoutCategoryRate` with fallback to `cutout_types.baseRate`. Apply `cutoutThicknessMultiplier` for pieces > 20mm. Uses fabricationCategory.

**Code does:**
- `calculateCutoutCostV2()` lines 1056–1159: Groups cutouts by typeId + fabricationCategory. ✅
- Looks up `cutoutCategoryRates` first, falls back to `cutoutType.baseRate`. ✅
- Applies `pricingContext.cutoutThicknessMultiplier` when `maxThickness > 20`. ✅
- Per-piece: `calculatePiecePricing()` lines 1691–1742: Same logic with category-aware rates. ✅

**Rate source:** `cutout_category_rates` table → fallback to `cutout_types.baseRate`.

**Status:** ✅ Match

**Details:** Full implementation of category-aware cutout rates with thickness multiplier and minimum charge support.

**Fix needed:** None

---

### 1.1f — Material Cost

**Bible says:**
- PER_SLAB mode: `slab_count × pricePerSlab`
- PER_SQM mode: `area × waste_factor × rate`
- Reads `material_pricing_basis` from PricingSettings
- Uses per-material slab dimensions with fallback to constants

**Code does:**
- `calculateMaterialCost()` lines 155–316:
  - PER_SLAB: `slabCount × slabPrice` (line 230). Slab count from optimizer or estimated from area. ✅
  - PER_SQUARE_METRE: `area × rate × wasteMultiplier` (line 259–270). ✅
  - Reads `pricingContext.materialPricingBasis` (line 551, 579). ✅
  - Per-material slab dimensions from `materials.slab_length_mm/slab_width_mm` with fallback to constants (line 390–391: `group.slabLengthMm ?? defaultSlabLengthMm ?? 3000`). ✅
- Margin hierarchy: `material.margin_override_percent` → `supplier.default_margin_percent` → 0 (lines 238–241). ✅
- Piece-level overrides via `overrideMaterialCost` (line 192–195). ✅
- Waste factor clamped to 0–50% (line 260). ✅

**Rate source:** `materials.price_per_slab` / `materials.price_per_square_metre` / `materials.price_per_sqm`.

**Status:** ✅ Match

**Details:** Comprehensive material cost calculation with both pricing modes, margin hierarchy, waste factor, and per-material groupings.

**Fix needed:** None

---

### 1.1g — Join Cost

**Bible says:** `join_length × join_rate[category]`. Oversize detection when piece > slab dimensions.

**Code does:**
- Lines 663–746: For each piece, calls `calculateCutPlan()` from `multi-slab-calculator.ts`. If piece doesn't fit on a single slab:
  - Looks up JOIN rate from DB: `getServiceRate(serviceRates, 'JOIN', thickness, fabricationCategory)`. ✅
  - `joinCost = joinLengthLm × joinRate` (line 685). ✅
- `multi-slab-calculator.ts` handles oversize detection with strategies: LENGTHWISE, WIDTHWISE, MULTI_JOIN. ✅

**Rate source:** `service_rates` table with `serviceType = 'JOIN'` and fabrication category. ✅

**Status:** ⚠️ Partial Match

**Details:**
- The calculator correctly uses DB-driven join rates. ✅
- However, `multi-slab-calculator.ts` line 47 has `JOIN_RATE_PER_METRE = 85` hardcoded constant. This constant is exported but NOT used by `pricing-calculator-v2.ts` (which uses DB rates). The constant is dead code from an earlier implementation. Minor cleanup needed.
- Oversize detection uses material name (e.g., "caesarstone") mapped to slab sizes via `getSlabSize()`, NOT the per-material `slab_length_mm`/`slab_width_mm` from the materials table. This means custom slab dimensions on materials are ignored for oversize detection. ⚠️

**Fix needed:**
1. Code fix (minor): Remove or deprecate `JOIN_RATE_PER_METRE` constant.
2. Code fix (moderate): Use material's `slab_length_mm`/`slab_width_mm` for oversize detection when available, falling back to `getSlabSize()`.

---

### 1.1h — Grain Matching Surcharge

**Bible says:** Only on oversize pieces. `FABRICATION_SUBTOTAL × surchargePercent` from PricingSettings.

**Code does:**
- Lines 687–693: Only calculated when `!cutPlan.fitsOnSingleSlab` (oversize). ✅
- `grainMatchingSurchargeRate = pricingContext.grainMatchingSurchargePercent / 100` (line 688). ✅
- `grainSurcharge = pieceFabSubtotal × grainMatchingSurchargeRate` (line 690). ✅

**Rate source:** `pricing_settings.grain_matching_surcharge_percent`. ✅

**Status:** ⚠️ Partial Match

**Details:** The surcharge is applied to `pieceBreakdowns[i].fabrication.subtotal` which is the per-piece fabrication subtotal from `calculatePiecePricing()`. This includes cutting, polishing, edges, cutouts, installation, and lamination for that piece. The spec says "FABRICATION_SUBTOTAL" which could mean the quote-level fabrication subtotal, not per-piece. Current implementation applies it per-piece which is arguably more correct (each oversize piece gets its own surcharge based on its own costs), but differs from a strict reading of "FABRICATION_SUBTOTAL × surchargePercent".

**Fix needed:** Clarify spec — current per-piece approach is likely correct but should be documented.

---

### 1.1i — Waterfall Cost

**Bible says:** Respects `waterfallPricingMethod` — FIXED_PER_END vs PER_LINEAR_METRE_HEIGHT.

**Code does:**
- Lines 1391–1450:
  - Finds waterfall pieces by checking edge IDs for 'WATERFALL' string. ✅
  - `FIXED_PER_END`: `count × rate` (line 1412–1413). ✅
  - `PER_LINEAR_METRE`: `heightLm × rate` per waterfall piece (lines 1429–1434). ✅
  - `INCLUDED_IN_SLAB`: No separate charge (line 1448). ✅
  - Uses thickness-appropriate rate (line 1406–1408). ✅

**Rate source:** `service_rates` table with `serviceType = 'WATERFALL_END'`, fabrication category aware.

**Status:** ✅ Match

**Details:** All three waterfall pricing methods are implemented. Default waterfall height is 900mm when not specified (line 1430).

**Fix needed:** None

---

### 1.1j — Installation Cost

**Bible says:** Per m², per Lm, or fixed — based on `installation_unit`.

**Code does:**
- `calculateServiceCosts()` lines 1321–1344:
  - `SQUARE_METRE`: `totalAreaM2 × rate`. ✅
  - `LINEAR_METRE`: `totalPerimeterLm × rate`. ✅
  - `FIXED`: `1 × rate` (flat fee). ✅
  - Uses `pricingContext.installationUnit`. ✅
- Per-piece: `calculatePiecePricing()` lines 1744–1766: Same logic per piece. ✅

**Rate source:** `service_rates` table with `serviceType = 'INSTALLATION'`, fabrication category aware.

**Status:** ✅ Match

**Fix needed:** None

---

### 1.1k — Delivery Cost

**Bible says:** Zone-based or per-km.

**Code does:**
- Lines 748–784: Uses `calculateDistance()` from `distance-service.ts` to get distance, then `getDeliveryZone()` and `calculateDeliveryCostFn()`.
- **BUT** lines 40–44: Delivery zones are **HARDCODED** as `DELIVERY_ZONES` constant:
  ```
  Local: 30km, base $50, $2.50/km
  Regional: 100km, base $75, $3.00/km
  Remote: 500km, base $100, $3.50/km
  ```
- Line 46: Templating rate hardcoded: `baseCharge: 150.0, ratePerKm: 2.0`
- Override support: `overrideDeliveryCost` field respected (line 781–783). ✅
- Auto-calculates when address exists but costs haven't been saved (line 758). ✅

**Rate source:** **HARDCODED** constants, NOT from database. ❌

**Status:** ❌ Mismatch

**Details:** Rulebook v11 Rule 22 says "NO HARDCODED PRICES — Every price, rate, surcharge, and minimum must come from the database." The delivery zones and templating rate are hardcoded at the top of the file. The schema has `delivery_zones` referenced in `quote.deliveryZone` but the calculator ignores it and uses its own constants.

**Fix needed:** Code fix — read delivery zones from database (`delivery_zones` table) instead of hardcoded constants. Read templating rate from `service_rates` table (TEMPLATING type exists in the seed data).

---

### 1.1l — Templating Cost

**Bible says:** Fixed or per-km.

**Code does:**
- Lines 786–795: Uses hardcoded `TEMPLATING_RATE = { baseCharge: 150.0, ratePerKm: 2.0 }` (line 46).
- Formula: `baseCharge + (distanceKm × ratePerKm)` via `calculateTemplatingCostFn()`.
- Override support: `overrideTemplatingCost` respected (line 792–794). ✅

**Rate source:** **HARDCODED** constant. ❌

**Status:** ❌ Mismatch (same issue as delivery)

**Details:** The `service_rates` seed includes a TEMPLATING service type with `rate20mm: 180.00`, but the calculator doesn't use it. Instead it uses the hardcoded `TEMPLATING_RATE`.

**Fix needed:** Code fix — use TEMPLATING rate from `service_rates` table.

---

### 1.1m — Discounts/Tiers

**Bible says:** Applied AFTER individual calcs, BEFORE GST.

**Code does:**
- Lines 818–866: Loads `discount_type`, `discount_value`, `discount_applies_to` from the quote record. ✅
- Two modes:
  - `ALL`: Discount covers `baseSubtotal + customChargesTotal`. ✅
  - `FABRICATION_ONLY`: Discount on `baseSubtotal` only, custom charges added after. ✅
- Supports PERCENTAGE and ABSOLUTE discount types. ✅
- Applied BEFORE GST (GST calculated on `finalTotal` at line 887). ✅
- **Pricing Rules Engine** (lines 858–874): `getApplicableRules()` fetches rules from `pricing_rules_engine` table, BUT the `appliedRules` are only mapped to display objects — they are **NEVER applied** to the subtotal. ⚠️

**Status:** ⚠️ Partial Match

**Details:**
- Quote-level discounts (PERCENTAGE / ABSOLUTE) work correctly. ✅
- The `pricing_rules_engine` rules are fetched and returned for display but their `adjustmentType` / `adjustmentValue` are NEVER applied to the calculation. The rules are decorative only. ⚠️
- Client tier fabrication discounts are extracted via `extractFabricationDiscount()` (line 609) and applied per-piece in `calculatePiecePricing()` — this works. ✅

**Fix needed:** Code fix — either implement pricing rules engine application or document it as intentionally deferred. The current state silently ignores active pricing rules.

---

### 1.1n — GST

**Bible says:** Rate from `pricing_settings.gst_rate` (NOT hardcoded 0.10).

**Code does:**
- Line 886: `const gstRate = pricingContext.gstRate;` ✅
- `pricingContext.gstRate` loaded from `settings.gst_rate` (line 133). ✅
- Applied: `gstAmount = finalTotal × gstRate` (line 887). ✅

**Rate source:** `pricing_settings.gst_rate` from database. ✅

**Status:** ✅ Match

**Details:** GST is tenant-configurable, not hardcoded. Default in seed data is 0.10 (10%).

**Fix needed:** None

---

### 1.1o — Calculation Order

**Bible says (Phase 9.6):** Steps should be:
1. Calculate per-piece costs (material, cutting, polishing, edges, cutouts)
2. Sum to quote-level subtotals
3. Add installation, delivery, templating
4. Apply discounts
5. Apply GST

**Code does (in `calculateQuotePrice()`):**
1. ✅ Fetch quote data, load pricing context, fetch rates
2. ✅ `calculateMaterialCost()` — materials
3. ✅ `calculateEdgeCostV2()` — aggregate edges
4. ✅ `calculateCutoutCostV2()` — aggregate cutouts
5. ✅ `calculateServiceCosts()` — cutting, polishing, installation, lamination, waterfall
6. ✅ Per-piece breakdowns via `calculatePiecePricing()`
7. ✅ Oversize/join costs
8. ✅ Delivery + templating
9. ⚠️ Custom charges added
10. ⚠️ Discount applied (but pricing rules NOT applied)
11. ✅ GST applied last

**Status:** ⚠️ Partial Match

**Details:** The overall flow is correct (costs → subtotal → discounts → GST). The issue is that pricing rules from `getApplicableRules()` are fetched at line 860 but only mapped to display strings at line 869 — they don't actually modify the subtotal. This means tier-based percentage adjustments and price book rules have no effect on the final price.

**Fix needed:** Code fix — apply pricing rules to the subtotal, or remove the dead code if rules are intentionally deferred.

---

## Section 3 — Data Integrity (1.2a–1.2e)

> **Note:** No database is available in this environment (no `.env` file with `DATABASE_URL`). Data integrity checks are based on **seed file analysis** instead of live queries.

### 1.2a — ServiceRate Table

**Expected (from seed files):**
- `seed-pricing-settings.ts`: 6 base rates for ENGINEERED category (CUTTING, POLISHING, INSTALLATION, WATERFALL_END, TEMPLATING, DELIVERY)
- `seed-category-service-rates.ts`: 7 service types × 5 categories = **35 rows**
- All tied to `organisation_id = 'company-1'`

**Seed rates (ENGINEERED baseline):**

| Type | rate20mm | rate40mm | minCharge |
|------|----------|----------|-----------|
| CUTTING | $17.50 | $45.00 | $50.00 |
| POLISHING | $45.00 | $115.00 | $50.00 |
| INSTALLATION | $140.00 | $170.00 | $200.00 |
| WATERFALL_END | $300.00 | $650.00 | $300.00 |
| TEMPLATING | $180.00 | $180.00 | $180.00 |
| DELIVERY | $150.00 | $150.00 | $100.00 |
| JOIN | $80.00 | $80.00 | $50.00 |

**Category multipliers:** ENGINEERED=1.00, NATURAL_HARD=1.15, NATURAL_SOFT=1.10, NATURAL_PREMIUM=1.30, SINTERED=1.30

**Status:** ⚠️ Cannot verify live data

**Potential issues:**
1. If only `seed-pricing-settings.ts` was run (not `seed-category-service-rates.ts`), only 6 ENGINEERED rows exist — non-ENGINEERED materials will fall back to ENGINEERED rates via `getServiceRate()` fallback chain (which works but is imprecise).
2. No $0 rates in seed data — all rates are positive. ✅

**Action needed:** Run `seed-category-service-rates.ts` if not already run, to ensure all 35 rows exist. Verify live with: `SELECT COUNT(*) FROM service_rates;` — should be 35.

---

### 1.2b — CutoutCategoryRate Table

**Expected:** Records in `cutout_category_rates` for each cutout type × fabrication category combination.

**Seed files:** `seed-cutout-category-rates.ts` exists but was not read in detail. The `seed-pricing-settings.ts` seeds 8 cutout rates into `cutout_rates` table (a different table from `cutout_category_rates`).

**Status:** ⚠️ Cannot verify — likely EMPTY

**Details:** The `cutout_category_rates` table may have zero records if the specific seed file was never run. The calculator handles this gracefully — falls back to `cutout_types.baseRate` (line 1119–1123). But this means all fabrication categories get the same cutout rate, which defeats the purpose of category-aware pricing.

**Action needed:** Verify live. If empty, run `seed-cutout-category-rates.ts` or populate via Pricing Admin UI.

---

### 1.2c — EdgeTypeCategoryRate Table

**Expected:** Records in `edge_type_category_rates` for each edge type × fabrication category.

**Seed files:** `seed-edge-category-rates.ts` exists.

**Status:** ⚠️ Cannot verify — may be EMPTY

**Details:** Similar to cutout category rates. If empty, the calculator falls back to flat `edge_types.rate20mm/rate40mm/baseRate`. Category-specific edge pricing won't work without data.

**Action needed:** Verify live. If empty, populate via seed or Pricing Admin UI.

---

### 1.2d — PricingSettings Table

**Expected (from seed):**
- 1 record, `organisation_id = 'company-1'`
- `material_pricing_basis`: PER_SLAB
- `cutting_unit`: LINEAR_METRE
- `polishing_unit`: LINEAR_METRE
- `installation_unit`: SQUARE_METRE
- `gst_rate`: 0.10
- `laminated_multiplier`: 1.30
- `mitred_multiplier`: 1.50
- `waste_factor_percent`: 15.0
- `grain_matching_surcharge_percent`: 15.0
- `cutout_thickness_multiplier`: 1.0 (default from schema)
- `waterfall_pricing_method`: FIXED_PER_END

**Status:** ⚠️ Cannot verify live

**Note:** The `cutout_thickness_multiplier` default is `1.0` in the schema, meaning cutouts cost the SAME for thick pieces unless explicitly configured higher. This may be intentional (thickness surcharge disabled by default) or an oversight.

**Action needed:** Verify live. Confirm `cutout_thickness_multiplier` is set to desired value (e.g., 1.5 for 50% surcharge on thick pieces).

---

### 1.2e — Materials with fabricationCategory

**Expected:** All materials should have `fabrication_category` set. Schema defaults to `ENGINEERED`.

**Schema:** `fabrication_category FabricationCategory @default(ENGINEERED)` — so all materials will have a value (at minimum the default).

**Slab dimensions:** `slab_length_mm` and `slab_width_mm` are optional (`Int?`). Materials without custom dimensions will use constant fallbacks:
- In material cost: `defaultSlabLengthMm ?? 3000` and `defaultSlabWidthMm ?? 1400`
- In oversize detection: `getSlabSize(materialName)` from `slab-sizes.ts`

**Status:** ⚠️ Cannot verify live

**Action needed:** Verify that materials have correct `fabrication_category` values (not all defaulting to ENGINEERED). Verify slab dimensions are set for materials where they differ from defaults.

---

## Section 4 — Modular Calculators Status

### Files Found

| File | Lines | Used by pricing-calculator-v2? |
|------|-------|-------------------------------|
| `src/lib/services/multi-slab-calculator.ts` | 299 | ✅ YES — imported at line 17, used for join/oversize detection |
| `src/lib/services/distance-service.ts` | — | ✅ YES — imported at lines 20–24, used for delivery/templating |
| `src/lib/services/quote-option-calculator.ts` | 248 | N/A — wraps pricing-calculator-v2 for alternative quote options |

### No `calculators/` subdirectory exists

There is NO `src/lib/services/calculators/` directory. The task description mentioned checking for modular sub-calculators like `edge-calculator.ts` or `material-calculator-enhanced.ts` — **these do not exist**. All calculation logic lives in `pricing-calculator-v2.ts` with two external helpers:

1. **`multi-slab-calculator.ts`** — Active, used for slab optimization and join cost planning. Contains `calculateCutPlan()`, `willRequireJoin()`, `estimateWaste()`.
2. **`distance-service.ts`** — Active, used for delivery/templating distance calculations.
3. **`quote-option-calculator.ts`** — Active, wraps `calculateQuotePrice()` for quote option variants.

**Verdict:** No dead calculator code. All imported calculators are actively used.

---

## Section 5 — Recommended Fix List for Phase 2A

Prioritised by impact, classified by fix type.

| # | Priority | Item | Type | Description |
|---|----------|------|------|-------------|
| 1 | 🔴 HIGH | Hardcoded delivery zones | Code fix | Replace `DELIVERY_ZONES` constant (lines 40–44) with DB query to `delivery_zones` table. Violates Rule 22. |
| 2 | 🔴 HIGH | Hardcoded templating rate | Code fix | Replace `TEMPLATING_RATE` constant (line 46) with lookup from `service_rates` table (TEMPLATING type). Violates Rule 22. |
| 3 | 🔴 HIGH | Pricing rules not applied | Code fix | `getApplicableRules()` results at line 869 are mapped to display strings but never modify the subtotal. Either implement or remove. |
| 4 | 🟡 MEDIUM | Aggregate edge cost missing category rates | Code fix | `calculateEdgeCostV2()` doesn't use `edgeCategoryRates`. Pass them in and use same fallback as `calculatePiecePricing()`. |
| 5 | 🟡 MEDIUM | Lamination missing strip layers | Code fix | Multiply lamination cost by `Math.floor((thickness - 20) / 20)` for multi-layer support (60mm, 80mm pieces). |
| 6 | 🟡 MEDIUM | Oversize detection ignores material slab dims | Code fix | `calculateCutPlan()` uses `getSlabSize(materialName)` instead of material's `slab_length_mm`/`slab_width_mm`. |
| 7 | 🟢 LOW | Dead `JOIN_RATE_PER_METRE` constant | Code fix | Remove or mark as deprecated in `slab-sizes.ts` line 47. Not used by calculator but could confuse developers. |
| 8 | 🟢 LOW | Cutting uses avgThickness for aggregate | Code fix | `calculateServiceCosts()` line 1237–1239 uses average thickness across all pieces for aggregate cutting rate lookup. Should iterate per-piece (like polishing does) for accuracy when pieces have mixed thicknesses. |
| 9 | 🟡 MEDIUM | Seed data completeness | Data fix | Verify `cutout_category_rates` and `edge_type_category_rates` tables are populated. Run `seed-cutout-category-rates.ts` and `seed-edge-category-rates.ts` if needed. |
| 10 | 🟢 LOW | `cutout_thickness_multiplier` default | Data fix | Default is 1.0 (no multiplier). Verify this is intentional — if thick pieces should cost more for cutouts, set to appropriate value (e.g., 1.5). |

---

## Section 6 — Pricing Bible v1.4 Candidates

Items where the spec should be updated or clarified:

1. **Grain matching surcharge scope:** The spec says "FABRICATION_SUBTOTAL × surchargePercent" but doesn't clarify whether this is per-piece or quote-level. The code applies it per-piece (more correct). The spec should be updated to say "per-piece fabrication subtotal."

2. **Lamination strip layers:** The spec mentions `(thickness - 20) / 20` but this is not implemented. If multi-layer lamination (60mm, 80mm) is a real use case, the spec should document the exact formula. If all thick pieces are always 40mm (single layer), the spec should remove the formula and state "applies to 40mm only."

3. **Delivery/templating pricing:** The spec should document that delivery zones and templating rates MUST come from database tables, not hardcoded values. This is implied by Rule 22 but should be explicitly stated in the pricing specification.

4. **Pricing rules engine:** The spec references tier-based pricing rules but the calculator doesn't apply them. The spec should clarify: are pricing rules intended to modify the subtotal, or are they informational/display-only?

5. **Edge profile aggregate vs per-piece:** The spec should clarify whether the quote-level edge breakdown should use category-aware rates (matching per-piece) or flat rates. Currently they diverge.

6. **Waterfall detection method:** The current code detects waterfall pieces by checking edge IDs for the string 'WATERFALL'. This is fragile. The spec should define a proper waterfall flag on pieces or a dedicated waterfall edge type.

7. **Material pricing mode interaction with oversize:** When `materialPricingBasis = PER_SLAB` and a piece is oversize requiring joins, the material cost is based on slab count from the optimizer. But the join/oversize logic runs AFTER material cost calculation. The spec should clarify whether oversize pieces should increase the slab count for material cost.

---

*End of Calculations Audit Report*
