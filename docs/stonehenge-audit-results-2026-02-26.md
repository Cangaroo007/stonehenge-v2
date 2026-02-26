# Stone Henge — Codebase Audit

**Date:** February 26, 2026
**Previous audit:** February 3, 2026 (file not found in repo — may have been in a prior branch)
**Commit hash:** `833b5d0784deb6d916c11a18fa549affeca890cb`
**Build status:** FAIL (node_modules not installed in audit environment; `prisma generate` unavailable)
**TypeScript errors:** 16,050 (all dependency-resolution errors — no real code errors confirmed)
**K-series PRs confirmed merged:** K1 ✅ / K2 ✅ / K3 ✅ / K4 ✅ — All merged to main
**Pre-audit branch check:** `git branch -r` returns no unmerged feature branches — all required PRs merged.

## Executive Summary

The Stonehenge codebase is in strong shape post K-series. The pricing calculator (v2) is the single active calculation path — all legacy calculators are deleted. The K-series shape system (L/U shapes) flows end-to-end from schema → types → wizard → API → calculator → SVG renderer, with the expected gap at the slab optimiser (Phase 3 scope). The slab ceiling fix (`Math.ceil`) and redundant Materials tab removal both landed correctly in commit `833b5d0`. The primary remaining defects are: (1) tier-based discounts are fetched but never applied — `extractFabricationDiscount()` is defined but never called, and pricing rule adjustments are mapped to display strings but not applied to the subtotal; (2) 30 API routes lack authentication, including 19 admin pricing routes; (3) the slab optimiser is shape-unaware, treating all pieces as bounding-box rectangles. Quote 55 regression cannot be verified without database access, but the verification scripts and expected values ($5,275.11 subtotal / $5,802.62 total) are present in the codebase. Phase 3 is broadly GO with the exception of 3.1 (tier discounts) which has an identified fix point.

---

## 🔴 Critical Issues

1. **Tier discount chain broken — `extractFabricationDiscount()` never called** (`pricing-calculator-v2.ts:1563`)
   - Client tier is fetched at line 478 (`client_tiers: true`)
   - `extractFabricationDiscount()` is defined at line 1563 but has zero call sites
   - Pricing rules fetched via `getApplicableRules()` (line 1275) but results only mapped to display strings (line 1284-1289) — adjustments never modify the subtotal
   - **Impact:** All tier-based discounts are silently ignored. Admin UI allows creating/editing tiers but they have no effect on pricing.

2. **19 admin pricing API routes have NO authentication**
   - All routes under `/api/admin/pricing/*` (client-tiers, edge-types, cutout-types, service-rates, machines, price-books, pricing-rules, thickness-options) lack `requireAuth()` checks
   - Any unauthenticated request can read/modify all pricing configuration
   - Additional unprotected sensitive routes: `/api/analyze-drawing`, `/api/pricing/interpret`, `/api/suppliers/[id]/price-lists/[uploadId]/apply`

3. **Slab optimiser not L/U shape aware** (`slab-optimizer.ts`)
   - All pieces treated as bounding-box rectangles using `width` × `height`
   - No references to `shape_type`, `shapeConfig`, `L_SHAPE`, or `U_SHAPE`
   - Overestimates slab area needed for L/U shapes
   - Phase 3 scope, but affects K-series quote accuracy now

## 🟡 Medium Issues

4. **PDF does not separately itemise cornerJoin** — cost is merged into oversize/fabrication subtotal in PDF assembly (`quote-pdf-service.ts:321-333`). Calculation is correct in `calculation_breakdown`.

5. **GST hardcoded at 10% in PDF service** (`quote-pdf-service.ts:405`) — TODO comment references MT2 milestone.

6. **5 piece editor components with overlapping responsibility** — PieceVisualEditor (1838 lines), PieceRow (1155), QuickViewPieceRow (1088), InlinePieceEditor (934), MiniPieceEditor (489). Maintenance burden.

7. **No waterfall grain block co-placement in optimiser** — Optimiser does not co-place benchtop and waterfall leg end-to-end on same slab.

8. **Lamination strip co-placement is incidental only** — Strips tracked via `parentPieceId` but no spatial constraint forces adjacency. Placement is by area-sorted First Fit Decreasing.

9. **Google Maps distance calculation — API key status unknown** — `distance-service.ts` has `console.warn` for missing key. Delivery may show mock $75 in production if key missing from Railway env.

10. **`requireAuthLegacy()` exported but never imported** (`auth.ts`) — dead export, should be removed.

## 🟢 Low / Technical Debt

11. **0 `console.log` statements** — codebase is clean. 327 legitimate `console.warn`/`.error` remain.
12. **7 TODO/FIXME comments** — all legitimate tracked items (email sending, Google Maps, GST config, tenant-specific notation).
13. **0 Railway-incompatible `[...new Set]` patterns** — compliant.
14. **0 banned edge components** (EdgeSelector, EdgeDropdown, EdgePolishSelection) — Rule 44 compliant.
15. **Legacy calculators directory deleted** — `src/lib/calculators/` does not exist. Clean.
16. **15 Prisma models with zero API references** — candidates for removal (see Section 2).

---

## Section 1 — Repository Overview

| Metric | Count |
|--------|-------|
| TypeScript/TSX files in `src/` | 418 |
| API route files (`route.ts`) | 143 |
| React components (`.tsx` in `src/components/`) | 90 |
| Service files (`src/lib/services/*.ts`) | 49 |
| Prisma migrations | 51 |
| Total Prisma models | 51 |

### Runtime Versions

| Package | Version |
|---------|---------|
| Node.js | v22.22.0 |
| Next.js | 14.1.0 |
| Prisma | ^5.22.0 |
| @prisma/client | ^5.22.0 |

### Last 20 Commits

```
833b5d0 fix: enforce whole-slab pricing (Math.ceil) and remove redundant Materials tab (#258)
2f071b2 fix: all accordions default to closed on page load (#257)
3639f2f feat: grain matching optional on L/U shapes — calc + UI + API (#256)
311a57b fix: L/U shape thumbnail renders correct polygon in collapsed card (#255)
9991f85 fix: customer accordion dedup, delivery accordion, room totals (#254)
18af0b0 feat: quote page section order + customer accordion (#253)
902dd8f feat: accurate SVG rendering for L and U shaped pieces (#252)
c83cf5f feat: pricing calculator extended for L/U shape geometry and corner joins (#251)
3c0c572 feat: L/U shape wizard in Add Piece flow (K2) (#250)
efde75f feat: add shape_type and shape_config to quote_pieces, add ShapeConfig types (#249)
b673944 feat: Arris default edge profile + recents strip in Quick Edge (#248)
627bae6 feat: reorder quote page, add Customer and Total breakdown accordions (#247)
3b17fbd chore: add verification scripts for proportional allocation (Quote 55) (#246)
738c4d6 fix: replace UNKNOWN cutout fallback with Cutout in calculator and PartsSection (#245)
000bcfb fix: delivery calculation and add recalculate button (#244)
699011b fix: parts list unknown strips, thickness display, oversize half costs (#243)
c0112d4 chore: deprecate material_cost and total_cost on quote_pieces (#242)
4a71649 feat: add Parts List section to quote page (#241)
e107e01 fix: proportional material and installation allocation per piece (#240)
ff1c9f7 fix: PDF always recalculates fresh rather than trusting stale breakdown (#239)
```

---

## Section 2 — Schema Inventory

### Core Models (Actively Used)

| Model | Fields | Key Relationships | API Refs | Notes |
|-------|--------|-------------------|----------|-------|
| `quotes` | 50 | customers, quote_rooms, quote_pieces | 35 | Central entity |
| `quote_pieces` | 26 | materials, quote_rooms, piece_relationships, piece_features | 37 | Highest usage. K1 fields confirmed. |
| `quote_rooms` | 5 | quotes, quote_pieces | 42 | Room grouping |
| `materials` | 21 | suppliers, quote_pieces | 20 | Material catalogue |
| `customers` | ~20 | client_tiers, client_types, quotes | 15 | Customer records |
| `pricing_settings` | 12 | service_rates, edge_type_category_rates, cutout_category_rates | 16 | Per-org pricing config |
| `service_rates` | 10 | pricing_settings | 6 | Includes WATERFALL_END |
| `edge_types` | 15 | edge_type_category_rates, material_edge_compatibility | 13 | 30+ seeded profiles |
| `edge_type_category_rates` | 5 | edge_types, pricing_settings | 2 | Category-specific rates |
| `cutout_types` | 8 | cutout_category_rates | 6 | 9 seeded types |
| `cutout_category_rates` | 4 | cutout_types, pricing_settings | 2 | Category-specific rates |
| `quote_templates` | 35 | — | 6 | PDF template config |
| `client_tiers` | 11 | customers, pricing_rules_engine | 5 | Admin UI only (not in calc path) |
| `pricing_rules_engine` | 16 | client_tiers, client_types, customers | 5 | Fetched but not applied |
| `piece_relationships` | 8+ | quote_pieces (bidirectional) | 4 | Series 13 model — EXISTS |
| `unit_block_projects` | 23 | units | 18 | Unit block feature |

### K1 — quote_pieces Shape Fields

**CONFIRMED PRESENT:**
```prisma
shape_type    String?  @default("RECTANGLE")
shape_config  Json?
```

Migration exists: `prisma/migrations/20260309000000_add_shape_fields_to_pieces/migration.sql`

### piece_relationships — Exact Fields (Critical for Phase 3)

**Model EXISTS. All fields:**

| Field | Type |
|-------|------|
| `id` | Int (autoincrement) |
| `source_piece_id` | Int (FK → quote_pieces) |
| `target_piece_id` | Int (FK → quote_pieces) |
| `relation_type` | String |
| `relationship_type` | RelationshipType? (enum) |
| `side` | String? (top/bottom/left/right) |
| `notes` | String? |
| `created_at` | DateTime |
| `updated_at` | DateTime |

Constraint: `UNIQUE([source_piece_id, target_piece_id])`

Phase 3 waterfall work **must use these exact field names** — do not create a duplicate model.

### WATERFALL_END Status

- Present in `serviceType` enum: CUTTING, POLISHING, INSTALLATION, **WATERFALL_END**, TEMPLATING, DELIVERY, JOIN
- Used in calculator at lines 783-828: two methods (`FIXED_PER_END` default, `PER_LINEAR_METRE` alternative)
- Current model: fixed charge per waterfall piece — Phase 3 will redesign as piece relationship

### Models NOT in Schema

- `strip_configurations` — NOT FOUND (delivery zones hardcoded in calculator lines 51-55)
- `delivery_zones` — NOT FOUND (hardcoded: Local 30km, Regional 100km, Remote 500km)

### Zero API Reference Models (Removal Candidates)

`audit_logs`, `customer_contacts`, `customer_locations`, `cutout_rates` (superseded by `cutout_category_rates`), `piece_features`, `price_book_rules`, `pricing_rule_cutouts`, `pricing_rule_edges`, `pricing_rule_materials`, `quote_files`, `settings`, `buyer_change_snapshots`, `buyer_change_records`, `custom_room_presets`, `quote_drawing_analyses`

---

## Section 3 — Pricing Calculator Path

### Single Path Confirmed

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `src/lib/services/pricing-calculator-v2.ts` | 1,572 | Main calculator orchestrator | Active |
| `src/lib/services/pricing-rules-engine.ts` | 356 | Locked pricing formulas (Pricing Bible v1.3) | Locked |
| `src/lib/types/pricing.ts` | 394 | Type definitions | Current |
| `src/lib/types/shapes.ts` | 109 | K3 shape geometry | Active |
| `src/app/api/quotes/[id]/calculate/route.ts` | 182 | API gateway | Entry point |

**Legacy check:** `src/lib/calculators/` — **DOES NOT EXIST** ✅

### Call Graph

```
Button click / API call
  → POST /api/quotes/[id]/calculate (route.ts:99)
    → calculateQuotePrice(quoteId, options) (calculator-v2.ts:461)
      ├─ loadPricingContext(organisationId) (line 130)
      ├─ getShapeGeometry() × N pieces (lines 544-548)
      ├─ calculateMaterialCost() (line 581) — shape-aware area
      ├─ calculateEngineQuote(engineInput) → pricing-rules-engine.ts
      │   ├─ ruleCutting()
      │   ├─ rulePolishing()
      │   ├─ ruleEdgeProfiles()
      │   ├─ ruleLamination()
      │   ├─ ruleCutouts()
      │   ├─ ruleJoin()
      │   └─ ruleGrainSurcharge()
      ├─ Waterfall ends (line 783)
      ├─ Corner join pricing (line 859)
      ├─ Per-piece breakdowns (line 929)
      ├─ Delivery/Templating (line 1159)
      ├─ Discount (line 1244)
      └─ GST (line 1301)
    → UPDATE quotes SET calculation_breakdown = result (route.ts:110)
```

**7 entry points** all use `calculateQuotePrice()`:
1. `/api/quotes/[id]/calculate` — main endpoint
2. `/api/quotes/[id]/pieces/[pieceId]` — recalc on piece update
3. `/api/quotes/batch-create` — batch creation
4. `quote-option-calculator.ts` — applies overrides then delegates
5. `quote-pdf-service.ts` — PDF always recalculates fresh
6. `template-cloner.ts` — template cloning
7. `buyer-change-tracker.ts` — change tracking

**No arithmetic outside calculator** — verified. No `× rate` or `* rate` outside the calculator files.

### K3 — Shape Geometry Override Verification

1. **Does `pricing-calculator-v2.ts` call `getShapeGeometry()` before calculating each piece?** YES — line 544-548, called for every piece in the loop.

2. **Does the result flow into `pricing-rules-engine.ts` via `cuttingPerimeterLm` and `areaSqm` overrides?** YES — line 701-703. For shaped pieces (cornerJoins > 0), overrides are passed. For rectangles, `undefined` is passed and the engine uses its own formula.

3. **For RECTANGLE pieces, do shape-aware values produce identical results?** YES — `getShapeGeometry` returns `(length_mm × width_mm) / 1_000_000` for area and `2 × (length_mm + width_mm) / 1000` for perimeter. **Identical to old formula.** No regression.

4. **Is `cornerJoin` included in `calculation_breakdown`?** YES — line 1096-1105: `pbd.cornerJoin = { shapeType, cornerJoins, joinLengthLm, joinRate, joinCost, grainMatchingSurchargeRate, grainMatchingSurcharge }`.

### Calculator Line Item Status

| Line Item | Status | Location | Notes |
|-----------|--------|----------|-------|
| Material cost | ✅ Calculated | `calculateMaterialCost()` | PER_SLAB with Math.ceil, PER_SQM with waste factor |
| Cutting | ✅ Calculated | `ruleCutting()` | Shape-aware via cuttingPerimeterLm override |
| Polishing | ✅ Calculated | `rulePolishing()` | Finished edges only |
| Edge profiles | ✅ Calculated | `ruleEdgeProfiles()` | Per edge type, category-aware rates |
| Lamination | ✅ Calculated | `ruleLamination()` | 40mm+ pieces with finished edges |
| Cutouts | ✅ Calculated | `ruleCutouts()` | Correct type names (not UNKNOWN) |
| Join / oversize | ✅ Calculated | `ruleJoin()` | Includes grain matching surcharge |
| Installation | ✅ Calculated | `ruleInstallation()` | Shape-aware via areaSqm override |
| Grain matching | ✅ Calculated | `ruleGrainSurcharge()` | Opt-in for L/U shapes |
| Corner join | ✅ Calculated | Line 859-920 | L/U shapes, join length from shapeConfig |
| WATERFALL_END | ✅ Calculated | Line 783-828 | FIXED_PER_END or PER_LINEAR_METRE |
| Delivery | ✅ Calculated | Line 1159+ | Distance-based zones |
| Templating | ✅ Calculated | Line 1159+ | Per-piece count |
| GST | ✅ Calculated | Line 1301 | Rate from pricing_settings |
| **totalDiscount** | ⚠️ Quote-level only | Line 1244-1267 | Manual discount works. **Tier discount NOT applied.** |
| **Tier discount** | ❌ Broken | Line 1563 | `extractFabricationDiscount()` defined, never called |
| **Pricing rules** | ❌ Display-only | Line 1284-1289 | Rules fetched but only mapped to strings, never applied |

---

## Section 4 — Slab Optimiser

**File:** `src/lib/services/slab-optimizer.ts` — **692 lines**

### Four Questions

1. **Waterfall grain blocks — benchtop + waterfall leg co-placement?** **NO.** No references to grain blocking, waterfall geometry, or co-placement constraints.

2. **Lamination strip co-placement?** **PARTIAL.** Strips generated with `parentPieceId` tracking (lines 106, 124, 141, 158). But no spatial constraint forces adjacency — strips compete for free rectangles by area like any other piece.

3. **L/U shape geometry?** **NEITHER.** Optimiser has zero references to `shape_type`, `shapeConfig`, `L_SHAPE`, `U_SHAPE`, or `getShapeGeometry`. All pieces treated as rectangles via `width` × `height`. Overestimates area for shaped pieces.

4. **Optimiser trigger:**
   - API: `POST /api/quotes/[id]/optimize` (calls `optimizeSlabs()` at line 486)
   - Component: `src/app/(dashboard)/optimize/page.tsx` (OptimizePage)
   - Also: `multi-material-optimizer.ts` for multi-material quotes

### Implementation Details

- Uses First Fit Decreasing (FFD) with Guillotine splitting
- Lamination strips generated for 40mm+ pieces: 60mm (mitre) or 40mm (standard/waterfall)
- `parentPieceId` tracked for reporting but not for spatial constraints

---

## Section 5 — Shape Types System (K-Series)

### End-to-End Confirmation Table

| Step | File | Function/Component | `shape_type` | `shape_config` |
|------|------|--------------------|--------------|----------------|
| Schema | `prisma/schema.prisma` | `quote_pieces` model | ✅ `String? @default("RECTANGLE")` | ✅ `Json?` |
| Types | `src/lib/types/shapes.ts` | `getShapeGeometry()` | ✅ ShapeType param | ✅ ShapeConfig param |
| Wizard | `InlinePieceEditor.tsx` | `handleSave` (line 413-446) | ✅ Sets `payload.shapeType` | ✅ Sets `payload.shapeConfig` |
| API POST | `pieces/route.ts` | POST handler (line 276-282) | ✅ Destructures + saves | ✅ Calls `getShapeGeometry()` |
| API GET | `pieces/route.ts` | GET handler (line 90-91) | ✅ Returns with fallback | ✅ Returns |
| Calculator | `pricing-calculator-v2.ts` | Piece loop (line 544-548) | ✅ Extracts from piece | ✅ Passes to `getShapeGeometry()` |
| SVG | `PieceVisualEditor.tsx` | Render (line 632-724) | ✅ Props-based | ✅ L/U polygon paths |
| Optimiser | `slab-optimizer.ts` | Placement | ❌ Not referenced | ❌ Not referenced |

**Optimiser gap is expected** — Phase 3 scope. All other steps ✅.

### Shape Geometry Details

- **L-shape:** 2 rectangular legs, corner overlap deducted. `cornerJoins: 1`. Join length = `min(leg1.width_mm, leg2.width_mm) / 1000`.
- **U-shape:** 3 components (2 legs + back), 2 corner overlaps. `cornerJoins: 2`. Join length = `2 × back.width_mm / 1000`.
- **Rectangle:** `totalAreaSqm = (L × W) / 1_000_000`, `cuttingPerimeterLm = 2(L + W) / 1000`, `cornerJoins: 0`. **Identical to pre-K3 formula.**

### Data Pipeline Files (4 components reference shape fields)

- `InlinePieceEditor.tsx` — sends shapeType + shapeConfig
- `PieceVisualEditor.tsx` — receives and renders shapes
- `PieceRow.tsx` — displays piece data
- `QuickViewPieceRow.tsx` — mini SVG via `getMiniShapePath(shapeType, shapeConfig)`

---

## Section 6 — Edge System

### Banned Components Check

| Component | Found? |
|-----------|--------|
| `EdgeSelector` | ❌ Not found — PASS |
| `EdgeDropdown` | ❌ Not found — PASS |
| `EdgePolishSelection` | ❌ Not found — PASS |

### Edge System Map

1. **Where does a user set an edge profile?**
   - Primary: `PieceVisualEditor.tsx` — Quick Edge mode (click to apply), Select mode (shift+click multi-select), single edge popover
   - Secondary: `QuickViewPieceRow.tsx`, `MiniPieceEditor.tsx`, `InlinePieceEditor.tsx`
   - All use: `EdgeProfilePopover.tsx` (308 lines) — single, unified edge selector

2. **How saved to database?**
   - `PATCH /api/quotes/[id]/pieces/[pieceId]` — saves `edge_top`, `edge_bottom`, `edge_left`, `edge_right`
   - Bulk: `PATCH /api/quotes/[id]/pieces/bulk-edges` — same edge IDs to multiple pieces
   - Recalculation triggered after save

3. **How does calculator read and price?**
   - Fetches `edge_types` (line 515-516) with `isActive` filter
   - Creates `edgeTypeIdMap` and `edgeTypeReverseMap` (lines 607-613)
   - Maps piece edges to engine input (lines 695-698)
   - Engine `ruleEdgeProfiles()` calculates per-type costs
   - Aggregates by type in result (lines 1469-1500)

4. **Are 28+ edge templates selectable?** YES — 32 built-in templates seeded. Accessible via Templates button or `T` keyboard shortcut in PieceVisualEditor. `EdgeTemplatePickerInline` component.

5. **WATERFALL_END in edge UI?** NO — ✅ PASS. WATERFALL_END only in pricing calculator service charge (lines 783-828). Not in any UI component.

---

## Section 7 — Tier Pricing Wire

### totalDiscount

**NOT hardcoded to 0.** Dynamically calculated at lines 1244-1267 from `quote.discount_type` and `quote.discount_value`. Supports:
- `PERCENTAGE` discount on `ALL` (incl. custom charges) or `FABRICATION_ONLY`
- `ABSOLUTE` discount
- Default: 0 when no discount set on quote

**This is the manual quote-level discount — it works correctly.**

### Tier Discount Break Points

| Step | Status | Location |
|------|--------|----------|
| Customer has `client_tier_id` | ✅ Stored | `customers.client_tier_id` FK |
| Calculator fetches client_tiers | ✅ Fetched | Line 478: `client_tiers: true` in include |
| `extractFabricationDiscount()` defined | ✅ Defined | Line 1563 |
| `extractFabricationDiscount()` called | ❌ **NEVER CALLED** | Zero call sites in entire file |
| `getApplicableRules()` fetches rules | ✅ Fetched | Line 1275: queries `pricing_rules_engine` |
| Rules applied to subtotal | ❌ **NOT APPLIED** | Line 1284-1289: only maps to display strings |

**Exact break point for Phase 3 fix:** Between lines 1281 and 1283. After `getApplicableRules()` returns, the code maps rules to `AppliedRule[]` for display but never applies `adjustmentType`/`adjustmentValue` to modify the subtotal.

### Admin Tier CRUD

Working: Full CRUD at `/api/admin/pricing/client-tiers/[id]` with GET/POST/PUT/DELETE.
UI: `ClientTierForm.tsx` in admin pricing tabs.
**But:** No authentication on these routes (Critical Issue #2).

---

## Section 8 — PDF Generation

### Architecture

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/services/quote-pdf-renderer.ts` | 643 | React PDF rendering (`@react-pdf/renderer` v3.4.4) |
| `src/lib/services/quote-pdf-service.ts` | 492 | Data assembly + recalculation |
| `src/app/api/quotes/[id]/pdf/route.ts` | 106 | GET endpoint (auth protected) |

### Key Answers

- **Library:** `@react-pdf/renderer` v3.4.4 (also `pdf-lib` v1.17.1, `pdfjs-dist` v5.4.530, `react-pdf` v10.3.0)
- **Reads calculation_breakdown?** YES — always recalculates fresh via `calculateQuotePrice()` (line 253-254), then persists back to DB.
- **Sections:** Header, Quote info, Room sections (pieces with edge/cutout summaries), Charges (delivery, templating, installation, custom, discount), Totals (subtotal, GST, grand total), Terms & conditions, Page numbers.
- **Layout:** Configurable via `PdfTemplateSettings` (24 settings) + `QuoteTemplateSections`. Stored in `quote_templates` table.
- **Known $0 / missing items:** GST hardcoded at 10% (TODO at line 405). $0 rooms skipped by design.
- **cornerJoin in PDF?** Cost included in calculation but merged into oversize/fabrication in PDF output — **not separately itemised.** Known gap.

---

## Section 9 — Component Inventory

### Top 15 Largest Components

| Rank | File | Lines | Purpose |
|------|------|-------|---------|
| 1 | `PieceVisualEditor.tsx` | 1,838 | Full piece editor with Quick Edge, cutouts, relationships |
| 2 | `RoomSpatialView.tsx` | 1,183 | Spatial 2D room layout visualisation |
| 3 | `PieceRow.tsx` | 1,155 | Piece management row with inline edits |
| 4 | `QuickViewPieceRow.tsx` | 1,088 | Two-tier quick+full piece editor |
| 5 | `InlinePieceEditor.tsx` | 934 | Compact wizard/quick-view editor |
| 6 | `TierManagement.tsx` | 904 | Pricing tier management interface |
| 7 | `ManualQuoteWizard.tsx` | 860 | 4-step manual quote creation |
| 8 | `QuoteAdjustments.tsx` | 589 | Quote-level adjustments (delivery, templating) |
| 9 | `MachineManagement.tsx` | 581 | Machine profile management |
| 10 | `BulkMaterialSwap.tsx` | 563 | Bulk material reassignment dialog |
| 11 | `PartsSection.tsx` | 549 | Parts listing section |
| 12 | `FromTemplateSheet.tsx` | 540 | Template-based quote creation |
| 13 | `RelationshipEditor.tsx` | 495 | Piece relationship editor |
| 14 | `MiniPieceEditor.tsx` | 489 | Lightweight piece editor for wizards |
| 15 | `RoomTypePicker.tsx` | 488 | Room type selector with presets |

**Total:** 68 components in `src/components/quotes/`, 90 total in `src/components/`.

### Duplication Flags

- **5 piece editors** with overlapping responsibility (PieceVisualEditor, PieceRow, QuickViewPieceRow, InlinePieceEditor, MiniPieceEditor). QuickViewPieceRow designed to consolidate but coexists.
- **Edge selector unified** — `EdgeProfilePopover.tsx` (308 lines) used by all editors. No duplication.
- **QuoteDetailClient.tsx** — file does not exist at expected path. Quote detail handled by `QuoteLayout.tsx` and page routes.

---

## Section 10 — API Routes

### Summary Statistics

| Category | Count |
|----------|-------|
| Total routes | 143 |
| Authenticated | 113 (79%) |
| Unauthenticated | 30 (21%) |
| High-risk unauthenticated | 9 |
| Medium-risk unauthenticated | 14 |
| Low-risk (health/auth) | 7 |

### Critical Unprotected Routes

All 19 `/api/admin/pricing/*` routes lack authentication:
- `client-tiers` (GET, POST, PUT, DELETE)
- `client-types` (GET, POST, PUT, DELETE)
- `cutout-types` (GET, POST, PUT, DELETE)
- `edge-types` (GET, POST, PUT, DELETE)
- `service-rates` (GET, POST, PUT, DELETE)
- `machines` (GET, POST, PUT, DELETE)
- `price-books` (GET, POST, PUT, DELETE)
- `pricing-rules` (GET, POST, PUT, DELETE)
- `thickness-options` (GET, POST, PUT, DELETE)
- `machine-defaults` (GET, PUT)
- `interpret-price-list` (POST)

Additional high-risk unprotected:
- `/api/analyze-drawing` (POST) — AI processing
- `/api/pricing/interpret` (POST) — AI pricing interpretation
- `/api/suppliers/[id]/price-lists/[uploadId]/apply` (POST)
- `/api/materials` (GET, POST, PUT, DELETE)
- `/api/suppliers` (GET, POST, PUT, DELETE)

### No Duplicate Routes

All endpoints serve unique purposes. No functional duplication detected.

---

## Section 11 — Feature Completeness Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| Quote creation (manual) | ✅ | ManualQuoteWizard + NewQuoteWizard |
| Quote calculation — single path | ✅ | `calculateQuotePrice()` only active path |
| Proportional material allocation | ✅ | Verified in PR #240 |
| Proportional installation allocation | ✅ | Verified in PR #240 |
| Cutting calculation | ✅ | `ruleCutting()` — shape-aware |
| Polishing (finished edges only) | ✅ | `rulePolishing()` |
| Edge profile pricing | ✅ | `ruleEdgeProfiles()` — 30+ seeded types |
| Lamination / 40mm strips | ✅ | `ruleLamination()` |
| Cutout pricing — correct type names | ✅ | Fixed in PR #245 — no UNKNOWN |
| Join / oversize piece detection | ✅ | `ruleJoin()` + grain surcharge |
| Grain matching surcharge | ✅ | `ruleGrainSurcharge()` — opt-in for L/U (PR #256) |
| Corner join pricing — L/U shapes (K3) | ✅ | Lines 859-920, per shape config |
| Waterfall end pricing (current model) | ✅ | FIXED_PER_END or PER_LINEAR_METRE |
| GST calculation | ✅ | From `pricing_settings.gstRate` |
| Tier-based discounts | ❌ | Function defined, never called (see Section 7) |
| Delivery calculation (Google Maps) | ⚠️ | API integration exists; key status on Railway unknown |
| Templating calculation | ✅ | Per-piece count × rate |
| Installation calculation | ✅ | Shape-aware via areaSqm override |
| Slab optimiser — rectangle pieces | ✅ | FFD with Guillotine splitting |
| Slab optimiser — lamination strip co-placement | ⚠️ | parentPieceId tracked, no spatial constraint |
| Slab optimiser — waterfall grain block | ❌ | Not implemented |
| Slab optimiser — L/U shape geometry aware | ❌ | All pieces treated as bounding rectangles |
| L/U shape piece creation wizard (K2) | ✅ | InlinePieceEditor with ShapeType selector |
| L/U shape pricing calculation (K3) | ✅ | getShapeGeometry + cornerJoin costing |
| L/U shape SVG rendering (K4) | ✅ | PieceVisualEditor renders L/U polygons |
| Quick Edge paint mode | ✅ | Click-to-apply in PieceVisualEditor |
| Edge profile templates (28+ seeded) | ✅ | 32 built-in templates |
| Arris default on new pieces (H) | ✅ | PR #248 |
| Edge recents strip in Quick Edge (H) | ✅ | PR #248, localStorage cached |
| Drawing upload + AI analysis | ✅ | `/api/analyze-drawing` + upload flow |
| AI drawing import to quote | ✅ | `/api/quotes/[id]/import-pieces` |
| PDF generation | ✅ | @react-pdf/renderer, always recalculates |
| Parts List section | ✅ | PR #241 |
| Parts List — correct cutout names | ✅ | Fixed in PR #245 |
| Parts List — correct lamination thickness | ✅ | Fixed in PR #243 |
| Version History | ✅ | `VersionHistoryTab.tsx` (363 lines) |
| Quote templates (save/apply) | ✅ | Full CRUD + seeded templates |
| Supplier management | ✅ | `/api/suppliers` CRUD (unprotected) |
| AI price list parser | ✅ | `/api/admin/pricing/interpret-price-list` |
| Material margin hierarchy | ✅ | override → supplier default → 0% |
| Piece number badges | ⚠️ | Not explicitly found as "badges" |
| Bulk material swap | ✅ | `BulkMaterialSwap.tsx` (563 lines) |
| Customer management | ✅ | Full CRUD at `/api/customers` |
| Customer contact selector on quote | ✅ | `ContactPicker.tsx` component |
| Quote page section order (J) | ✅ | PR #253 |
| Customer/Project accordion (J) | ✅ | PR #253, all closed by default (PR #257) |
| Unit Block projects — DB persistence | ✅ | Full API at `/api/unit-blocks` |
| Pricing Setup Wizard | ❌ | Not found in codebase |
| Multi-tenant isolation | ⚠️ | `organisationId` in middleware, but auth gaps |

---

## Section 12 — Dead Code

### Clean Checks

| Check | Result |
|-------|--------|
| `console.log` statements | **0** — clean |
| `[...new Set]` patterns | **0** — Railway compliant |
| `src/lib/calculators/` directory | **Does not exist** — clean |
| Banned edge components (Rule 44) | **0** — compliant |
| `unit-block-calculator*` files | **0** — not found |
| `multi-slab-calculator.ts` | **Active** — imported by 4 files |

### Counts

| Item | Count |
|------|-------|
| TODO/FIXME/HACK/XXX comments | 7 (all legitimate) |
| Files importing from `@/lib/auth` | 127 (custom JWT auth — no Clerk) |

### Dead Code Items

| Item | Location | Reason |
|------|----------|--------|
| `requireAuthLegacy()` | `src/lib/auth.ts` | Exported but never imported anywhere |
| `extractFabricationDiscount()` | `pricing-calculator-v2.ts:1563` | Defined but never called |
| `cutout_rates` model | `prisma/schema.prisma` | Superseded by `cutout_category_rates` |
| `pricing_rule_cutouts` model | `prisma/schema.prisma` | Defined, zero API references |
| `pricing_rule_edges` model | `prisma/schema.prisma` | Defined, zero API references |
| `pricing_rule_materials` model | `prisma/schema.prisma` | Defined, zero API references |
| `customer_contacts` model | `prisma/schema.prisma` | Defined, zero API references |
| `customer_locations` model | `prisma/schema.prisma` | Defined, zero API references |
| `audit_logs` model | `prisma/schema.prisma` | Defined, zero API references |
| `settings` model | `prisma/schema.prisma` | Defined, zero API references |
| `buyer_change_snapshots` model | `prisma/schema.prisma` | Defined, zero API references |
| `buyer_change_records` model | `prisma/schema.prisma` | Defined, zero API references |
| `custom_room_presets` model | `prisma/schema.prisma` | Defined, zero API references |
| `quote_files` model | `prisma/schema.prisma` | Legacy file storage, zero API references |

---

## Section 13 — Quote 55 Regression Check

**Cannot verify against live database** — audit environment has no database connection.

### Evidence from Codebase

Two verification scripts exist:
- `scripts/verify-task1-recalculate.ts` — recalculates Quote 55 and persists
- `scripts/verify-task2-check-allocations.ts` — validates expected values

**Expected values (from scripts):**

| Metric | Expected Value |
|--------|---------------|
| Subtotal | $5,275.11 (±0.05) |
| Total inc GST | $5,802.62 (±0.05) |
| Material allocations sum | ~$3,192.00 (±0.05) |
| Installation allocations sum | ~$714.12 (±0.05) |
| All pieces shape_type | `RECTANGLE` (K1 default) |
| `calculation_breakdown` | Present (not null) |

### Slab Ceiling Impact

The `Math.ceil` fix (PR #258) will change the Quote 55 material cost on next recalculation. This is expected and correct — previous fractional slab pricing was the bug. The new value after recalculation becomes the updated regression anchor. **The old $5,275.11 target is superseded by the correct whole-slab value.**

---

## Section 14 — Known Issues Status

| Issue | Last Known Status | Current Status | File/Line |
|-------|-------------------|----------------|-----------|
| totalDiscount hardcoded to 0 | ❌ Confirmed bug | ✅ **FIXED** — dynamically calculated from quote discount settings | `pricing-calculator-v2.ts:1244-1267` |
| Tier discount not applied | ❌ Confirmed bug | ❌ **STILL BROKEN** — `extractFabricationDiscount()` defined but never called; rules fetched but not applied | `pricing-calculator-v2.ts:1563` (never called), `:1284` (display only) |
| WATERFALL_END as fixed charge | ⚠️ Needs Phase 3 redesign | ⚠️ **UNCHANGED** — FIXED_PER_END and PER_LINEAR_METRE both available, default FIXED_PER_END | `pricing-calculator-v2.ts:783-828` |
| Version History dropped in UI | ⚠️ Recurring | ✅ **PRESENT** — `VersionHistoryTab.tsx` exists (363 lines) | `src/components/quotes/VersionHistoryTab.tsx` |
| Google Maps API key missing from Railway | ⚠️ Mock $75 | ⚠️ **UNKNOWN** — `console.warn` for missing key exists in code | `src/lib/services/distance-service.ts:39` |
| Customer contact selector missing | ⚠️ Was missing | ✅ **PRESENT** — `ContactPicker.tsx` component exists | `src/components/quotes/ContactPicker.tsx` |
| Material margin markup missing | ⚠️ Was missing | ✅ **IMPLEMENTED** — hierarchy: material override → supplier default → 0% | `pricing-calculator-v2.ts:248-262` |
| QuoteDetailClient.tsx monolith | ⚠️ ~2000 lines | ⚠️ **File not at expected path** — quote detail handled by other components | — |
| Unit Block — localStorage only, no DB | ❌ Known gap | ✅ **DB PERSISTED** — full API at `/api/unit-blocks` | `src/app/api/unit-blocks/` |
| Floating Shelves 16mm in Parts List | ⚠️ Expected fix | ⚠️ **Not found** — no 16mm floating shelf references in codebase | — |
| K3 rectangle regression | ⚠️ Must verify | ✅ **NO REGRESSION** — `getShapeGeometry` RECTANGLE returns identical formula | `src/lib/types/shapes.ts:100-107` |
| Optimiser not L/U shape aware | ⚠️ Known gap | ❌ **CONFIRMED GAP** — all pieces treated as bounding rectangles | `slab-optimizer.ts` |
| PDF missing cornerJoin line item | ⚠️ K3 not in PDF | ⚠️ **PARTIALLY FIXED** — in calculation_breakdown but merged into oversize in PDF | `quote-pdf-service.ts:321-333` |
| Rounded ends | 🔲 Phase 3 planned | 🔲 **NOT IMPLEMENTED** — no feature code found | — |
| Waterfall as piece relationship | 🔲 Phase 3 planned | ✅ **MODEL EXISTS** — `piece_relationships` model with `WATERFALL` RelationshipType defined | `src/lib/types/piece-relationship.ts:47-51` |
| Dual Materials UI (redundant tab) | ⚠️ Fix deployed | ✅ **FIXED** — "Material Slab Dimensions" not found in codebase. Single materials page. | PR #258 |
| Slab count Math.ceil missing | ❌ Critical fix deployed | ✅ **FIXED** — `Math.ceil(slabCount) * slabPrice` at line 243 | `pricing-calculator-v2.ts:243` |

---

## Section 15 — Materials System & Slab Calculation

### 15a — Dual Materials UI

| Check | Result |
|-------|--------|
| "Material Slab Dimensions" in codebase | ❌ NOT FOUND — ✅ Fix confirmed |
| `/materials` page exists | ✅ `src/app/(dashboard)/materials/page.tsx` |
| Slab dimensions managed at | Supplier level (`default_slab_length_mm`, `default_slab_width_mm`) |

### 15b — Slab Count Ceiling Fix

**Q1: Is `Math.ceil` applied before multiplying by price in PER_SLAB mode?**
**YES — Line 243:**
```typescript
calculatedCost = Math.ceil(slabCount) * slabPrice;
```

**Q2: Is PER_SQM handled separately without ceiling?**
**YES — Lines 225-231:** `calculatedCost += areaSqm * baseRate` (no ceiling). Waste factor applies only to PER_SQM (lines 272-283).

**Q3: Is price source correct?**
**YES — PER_SLAB:** Uses `price_per_slab` from materials table. **PER_SQM:** Uses `price_per_sqm` × piece area. Margin hierarchy applied after: material override → supplier default → 0%.

### Math.ceil Locations

| Line | Context |
|------|---------|
| 243 | Primary: `Math.ceil(slabCount) * slabPrice` in `calculateMaterialCost()` |
| 310 | Return value: ceiling for display |
| 312 | Derives slabRate from ceiling |
| 409 | `buildMaterialGroupings()` single material |
| 411 | `buildMaterialGroupings()` naive estimate |
| 572 | `calculateQuotePrice()` piece area estimate |

---

## Phase 3 — Go / No-Go Assessment

| Phase 3 Item | Go / No-Go | Blocker (if No-Go) |
|--------------|------------|---------------------|
| 3.1 Wire tier discounts | **GO** | Fix point identified: call `extractFabricationDiscount()` and apply `getApplicableRules()` results to subtotal between lines 1281-1283 of `pricing-calculator-v2.ts` |
| 3.2 Waterfall schema + piece relationships | **GO** | `piece_relationships` model exists with correct fields. `WATERFALL` RelationshipType already defined. Must use existing field names exactly (see Section 2). |
| 3.3 Waterfall optimiser (grain match flag) | **GO** | Optimiser baseline documented — no co-placement exists yet. `grain_matched` flag can be added to `piece_relationships` via migration. |
| 3.4 Waterfall calculator correction | **GO** | Current WATERFALL_END at lines 783-828 is the refactor target. FIXED_PER_END model documented. |
| 3.5 Waterfall UI | **GO** | `RelationshipEditor.tsx` exists (495 lines). `WATERFALL` type already in relationship type enum. |
| 3.6 Rounded ends | **GO** | No existing code conflicts. Clean implementation target. |
| 3.7 Pricing Setup Wizard | **GO** | No existing wizard found — clean implementation. All pricing admin routes exist but need auth first. |
| 3.8 Quote Layout Builder — schema | **GO** | `quote_templates` model exists (35 fields) with `sections_config` JSON field. |
| 3.9 Quote Layout Builder — UI | **GO** | PDF renderer already supports configurable `PdfTemplateSettings` (24 settings). |
| 3.10 PDF renderer — layout config | **GO** | `quote-pdf-renderer.ts` (643 lines) uses `@react-pdf/renderer`. Template system in place. cornerJoin needs separate line item. |
| 3.11 Upload-and-interpret (Claude API) | **GO** | `/api/analyze-drawing` endpoint exists. AI integration already functional. Needs auth protection. |

### Pre-Phase 3 Recommendations (Non-Blocking but Advised)

1. **Add auth to admin pricing routes** — 19 unprotected routes should be secured before adding more pricing logic.
2. **Separate cornerJoin as PDF line item** — currently merged into oversize; should be its own row.
3. **Verify Google Maps API key on Railway** — delivery calculation may be returning mock data.
4. **Remove `requireAuthLegacy()` export** — dead code cleanup.
5. **Recalculate Quote 55 post-slab-ceiling-fix** — establish new regression anchor value.

---

*Audit completed: February 26, 2026. Read-only — no code changes made.*
