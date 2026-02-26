# Unit Block Deep Audit — Infrastructure & Standards Gap Analysis

> **Date:** 2026-02-18
> **Auditor:** Claude Code (automated)
> **Scope:** Series 9 Unit Block system vs Quote Builder (Series 12 / J1 / J2) standards
> **Status:** READ-ONLY audit — no files modified

---

## SECTION 1: File Inventory Summary

### All Unit Block Files (6,703 total lines)

| Category | File | Lines |
|----------|------|-------|
| **Pages** | `unit-block/[id]/page.tsx` | 807 |
| | `unit-block/page.tsx` (list) | 220 |
| | `new/unit-block/page.tsx` | 190 |
| **Components** | `[id]/ScheduleUploader.tsx` | 1,617 |
| | `[id]/RegisterUploader.tsx` | 605 |
| | `[id]/BulkQuoteGenerator.tsx` | 552 |
| | `[id]/MappingReadiness.tsx` | 185 |
| | `MultiFileUpload.tsx` | 225 |
| **API Routes** | 12 route files | ~1,487 |
| **Services** | `bulk-quote-generator.ts` | 523 |
| | `template-cloner.ts` | 384 |
| | `template-auto-generator.ts` | 336 |
| | `register-parser.ts` | 212 |
| | `schedule-parser.ts` | 210 |
| | `finish-tier-resolver.ts` | ~280 |
| | `buyer-change-tracker.ts` | (exists) |
| **Calculator** | `unit-block-calculator.ts` | 409 |
| **Types** | `unit-templates.ts` | 142 |

### API Routes (12 endpoints)

```
/api/unit-blocks                           — GET (list), POST (create)
/api/unit-blocks/[id]                      — GET, PATCH, DELETE
/api/unit-blocks/[id]/auto-generate-templates — POST
/api/unit-blocks/[id]/calculate            — POST
/api/unit-blocks/[id]/change-report        — GET
/api/unit-blocks/[id]/generate             — POST, GET (dry-run)
/api/unit-blocks/[id]/mapping-status       — GET
/api/unit-blocks/[id]/parse-register       — POST
/api/unit-blocks/[id]/parse-schedule       — POST
/api/unit-blocks/[id]/units                — GET, POST
/api/unit-blocks/[id]/units/[unitId]       — GET, PATCH
/api/unit-blocks/[id]/units/[unitId]/changes — GET, POST
```

---

## SECTION 2: Database Schema Analysis

### Models

| Model | Fields | Org Scoped? |
|-------|--------|-------------|
| `unit_block_projects` | name, projectType, status, customerId, address, volumeTier, financials, **createdById** | ❌ NO `company_id` |
| `unit_block_units` | unitNumber, level, unitTypeCode, finishLevel, colourScheme, quoteId, templateId | ❌ NO `company_id` |
| `unit_block_files` | fileName, fileType, storageKey, unitTypeCode | ❌ NO `company_id` |
| `unit_type_templates` | name, unitTypeCode, projectId, templateData (JSON), version | ❌ NO `company_id` |
| `finish_tier_mappings` | templateId, finishLevel, colourScheme, materialAssignments (JSON), edgeOverrides (JSON) | ❌ NO `company_id` |

**Comparison:** The `quotes` model has `company_id`. The `pricing_settings` model uses `organisation_id`. The `service_rates` model has `company_id`. None of the Unit Block models have any org/company scoping.

### Key Relationships

- `unit_block_units.quoteId` → `quotes.id` (unique, 1:1)
- `unit_block_units.templateId` → `unit_type_templates.id`
- `unit_type_templates` scoped by `projectId` (project-level, not org-level)

---

## SECTION 3: Multi-Tenant Scoping — CRITICAL GAPS

### Authentication
All 12 API route files correctly call `requireAuth()` — authentication is present.

### Authorization / Org Scoping
**ZERO org scoping anywhere in the Unit Block system.**

| Check | Result |
|-------|--------|
| `unit_block_projects` schema has `company_id`? | ❌ NO |
| GET `/api/unit-blocks` filters by company? | ❌ NO — returns ALL projects across all tenants |
| GET `/api/unit-blocks/[id]` verifies ownership? | ❌ NO — any authenticated user can access any project |
| Services reference company_id? | ❌ NO — `bulk-quote-generator.ts`, `template-cloner.ts`, `register-parser.ts`, `template-auto-generator.ts`, `buyer-change-tracker.ts` — ZERO company references |
| `requireAuth()` returns companyId? | ✅ YES — it's available but never used |

**Impact:** In a multi-tenant deployment, Tenant A can see, modify, and delete Tenant B's unit block projects, units, templates, and generated quotes. This is a **data leak vulnerability**.

---

## SECTION 4: Pricing Infrastructure Alignment

### 4.1 — Pricing Calculator Version

| Component | Uses pricing-calculator-v2? |
|-----------|---------------------------|
| `template-cloner.ts` | ✅ YES — `import { calculateQuotePrice } from './pricing-calculator-v2'` |
| `bulk-quote-generator.ts` | ✅ Indirect — calls `cloneTemplateToQuote()` which calls v2 |
| `unit-block-calculator.ts` | ⚠️ Uses `QuoteCalculator.create()` from `./index` — different path |

**Finding:** The template cloner correctly calls pricing-calculator-v2 after creating each quote. However, the `UnitBlockCalculator` class appears to use a separate `QuoteCalculator` from the calculator index, which may have a different code path.

### 4.2 — Fabrication Categories

| Component | Uses fabrication categories? |
|-----------|----------------------------|
| `bulk-quote-generator.ts` | ❌ NO — zero references |
| `template-cloner.ts` | ❌ NO — zero references |
| `template-auto-generator.ts` | ❌ NO — zero references |
| `pricing-calculator-v2.ts` | ✅ YES — reads from material's `fabrication_category` |

**Finding:** Templates don't store fabrication category. The pricing calculator reads it from the **material** record at calculation time. Since materials are assigned via `materialAssignments`, the fabrication category is resolved indirectly. **This is likely OK** — pricing-calculator-v2 handles it at calculation time.

### 4.3 — Category-Aware Service Rates

Same as 4.2 — service rates are resolved by pricing-calculator-v2 at calculation time, not by the bulk generator or template cloner. **Likely OK** as long as pricing-calculator-v2 is invoked (which it is).

### 4.4 — Lamination / Mitre Logic

| Component | Handles lamination? |
|-----------|-------------------|
| `template-cloner.ts` | ✅ YES — detects MITRED/LAMINATED from edge finishes, sets `lamination_method` on pieces |
| `template-auto-generator.ts` | ✅ YES — parses "40mm apron mitred" → `{ finish: 'MITRED', profileType: 'PENCIL_ROUND' }` |
| `bulk-quote-generator.ts` | ✅ Indirect via template-cloner |

**Finding:** Lamination detection works. Edge string parsing in template-auto-generator correctly maps "mitred" → MITRED, "apron" → MITRED.

### 4.5 — GST Handling

| Component | Handles GST? |
|-----------|-------------|
| `template-cloner.ts` | ✅ YES — `Math.round(totalExGst * 0.1 * 100) / 100` |
| `bulk-quote-generator.ts` | ✅ YES — project-level GST: `afterDiscount.times(0.10)` |
| `unit-block-calculator.ts` | ❌ NO reference to GST |

**Finding:** GST is calculated but **hardcoded at 10%**. The `pricing_settings` table has a configurable `gst_rate` field (default 0.10). The Unit Block should read from `pricing_settings.gst_rate` instead of hardcoding.

### 4.6 — Supplier Margins

| Component | Uses margins? |
|-----------|-------------|
| `bulk-quote-generator.ts` | ❌ NO — zero references to margin, supplier, markup |
| `template-cloner.ts` | ❌ NO — zero references |
| `pricing-calculator-v2.ts` | ✅ YES — resolves `margin_override_percent` → `supplier.default_margin_percent` |

**Finding:** Supplier margins are handled by pricing-calculator-v2 at quote calculation time. Since template-cloner calls `calculateQuotePrice()`, margins ARE applied to the generated quotes. The initial `material_cost` set on pieces during cloning (line 228-229: `areaSqm * material.price_per_sqm`) doesn't include margins, but pricing-calculator-v2 overrides these values. **Likely OK but fragile** — if the pricing calculator ever fails silently, pieces retain raw costs without margins.

---

## SECTION 5: Error Handling & Resilience

### Error Boundaries
- Unit Block UI: ❌ NO error boundaries found in any unit-block page/component
- Quote Builder: ✅ Has `PieceEditorErrorBoundary.tsx`

### Error Isolation in Bulk Generation
- ✅ **Good:** Each unit is processed in a try/catch with `continue` on failure (line 316-403 of `bulk-quote-generator.ts`)
- ✅ **Good:** Errors are logged and included in results with status `'ERROR'`
- ✅ **Good:** Other units continue generating even if one fails

### Defensive Null Checks
- ✅ Template-cloner checks template exists, checks `isActive`
- ✅ Bulk-generator dry-run checks for missing unitTypeCode, finishLevel, template, mapping
- ⚠️ `effectiveCustomerId = customerId ?? project?.customerId ?? undefined` — falls through to `undefined`, then `cloneTemplateToQuote` receives `undefined` which becomes `0` (line 360: `effectiveCustomerId ?? 0`)

### JSON Double-Cast (Rule 9)
- ✅ `template-cloner.ts`: Uses `as unknown as` pattern correctly (lines 165, 272, 306, 375, 376)
- ✅ `bulk-quote-generator.ts`: Uses `as unknown as TemplateData` correctly (line 230)
- ✅ `template-auto-generator.ts`: Uses `as unknown as Prisma.InputJsonValue` correctly (lines 302, 307)

### Pricing Failure Handling
- ⚠️ Template-cloner catches pricing errors but still returns the quote (line 310-313): `console.warn('Template cloner: pricing calculation failed, quote created without pricing:')`. This means a quote with **$0 pricing** is created and linked to the unit. The user sees a "successful" generation with incorrect totals.

---

## SECTION 6: Edge Profile & Cutout Standards

### edge-utils.ts Usage
| Component | Uses edge-utils.ts? |
|-----------|-------------------|
| Quote Builder (PieceVisualEditor, PieceRow, RoomSpatialView, etc.) | ✅ YES |
| Unit Block UI pages | ❌ NO |
| Template cloner service | ❌ NO |
| Template auto-generator service | ❌ NO |

**Finding:** The Unit Block UI doesn't use `edge-utils.ts` for colour coding or display. Edge profiles in templates are stored as raw strings (`POLISHED`, `MITRED`, `PENCIL_ROUND`).

### How Templates Store Edges
```typescript
// TemplateEdge type:
{ finish: 'RAW' | 'POLISHED' | 'LAMINATED' | 'MITRED'; profileType?: string }

// Example from auto-generator:
{ finish: 'POLISHED', profileType: 'ARRIS_2MM' }
{ finish: 'MITRED', profileType: 'PENCIL_ROUND' }
```

### Edge Resolution in Template Cloner
The cloner resolves `TemplateEdge` → `edge_types.id` via `resolveEdgeTypeId()`:
1. Tries `profileType` name match (contains, case-insensitive)
2. Falls back to first active edge with `category: 'polish'`

**Risk:** The fallback (line 85-92) just picks the first polish-category edge. If no match found for the specific profile type, ALL pieces get the same default edge regardless of what the template specified.

### How Templates Store Cutouts
```typescript
// TemplateCutout type:
{ type: string; quantity: number }

// Template cloner writes to DB:
{ type: c.type, quantity: c.quantity }
```

### Cutout Field Name Mismatch Analysis

| Field | Template Cloner (writes) | PieceRow (reads) | PieceVisualEditor (reads) |
|-------|-------------------------|------------------|--------------------------|
| Type identifier | `type` (string, e.g. "UNDERMOUNT_SINK") | `cutoutTypeId` or `typeId` (UUID) → fallback to `type` or `name` (string) | `typeId` (UUID) |
| Quantity | `quantity` | `quantity` | not shown directly |
| Name | (not stored) | resolved via `resolveCutoutTypeName()` | — |

**Finding:** Template-generated cutouts use `{ type: "UNDERMOUNT_SINK", quantity: 1 }`. PieceRow's `resolveCutoutTypeName()` **does handle this** — it falls back to string-based name matching: `cutout.type || cutout.name`. So the **display** works. However, PieceVisualEditor expects `typeId` (UUID) for its cutout operations, so **editing** template-generated cutouts in the builder may fail or show "Unknown".

---

## SECTION 7: UI/UX Standards Comparison

### Banned Components (Rule 44)
✅ No banned components found in Unit Block UI.

### console.log Statements
✅ No console.log found in Unit Block UI `.tsx` files.

### Prisma Imports in Client Components (Rule 50)
✅ No `@prisma/client` value imports in Unit Block UI files.

### Autocomplete (J2 Standard)
❌ NO autocomplete/suggestion components in Unit Block UI.

### Description Generation (J2 Standard)
❌ NO `generatePieceDescription` or description-generator usage in template-cloner or bulk-generator.

### One-Page Layout (J1 Standard)
The unit-block `[id]/page.tsx` (807 lines) uses a single page layout, not tabs. It contains all sections inline. **This is acceptable** — the Unit Block page serves a different purpose than the Quote Builder.

### Old Form Patterns
❌ No `QuoteForm` references. ✅ Clean.

---

## SECTION 8: Quote Quality — Template Cloner Field Mapping

### Fields Cloned to Quote Pieces

| Quote Piece Field | Source from Template | Set by Cloner? |
|-------------------|---------------------|----------------|
| `room_id` | Created from template room | ✅ |
| `name` | `templatePiece.label` | ✅ |
| `description` | `templatePiece.notes` | ✅ |
| `length_mm` | `templatePiece.length_mm` | ✅ |
| `width_mm` | `templatePiece.width_mm` | ✅ |
| `thickness_mm` | `templatePiece.thickness_mm` | ✅ |
| `area_sqm` | Calculated from L×W | ✅ |
| `material_id` | From materialAssignments | ✅ |
| `material_name` | From material lookup | ✅ |
| `material_cost` | `areaSqm × price_per_sqm` (raw, no margin) | ✅ (overridden by pricing calc) |
| `total_cost` | = material_cost initially | ✅ (overridden by pricing calc) |
| `sort_order` | piece index | ✅ |
| `cutouts` | JSON `[{type, quantity}]` | ✅ |
| `edge_top/bottom/left/right` | Resolved edge_type UUID | ✅ |
| `lamination_method` | Detected from edge finishes | ✅ |
| `fabrication_category` | — | ❌ NOT SET |
| `grain_match` | — | ❌ NOT SET |

**Missing fields:** `fabrication_category` and `grain_match` are not set by the cloner. The pricing calculator reads `fabrication_category` from the **material** record, not the piece, so this is likely OK. But if there's any code that reads these fields directly from pieces, it would get null.

---

## SECTION 9: Railway Build Safety

### Spread-Set Anti-Pattern (Rule 9)
✅ No `[...new Set()]` found in any Unit Block file. Uses `Array.from(new Set())` correctly.

### Next.js 14 Await Params (Rule 9)
| File | Pattern | Compliant? |
|------|---------|-----------|
| All API routes | `{ params }: { params: Promise<{ id: string }> }` + `await params` | ✅ YES |
| `unit-block/[id]/page.tsx` | `const params = useParams()` (client component) | ✅ YES (client-side, no await needed) |

✅ All Railway-safe patterns correctly used.

---

## SECTION 10: Volume Discount Calculator

### Volume Tiers — Hardcoded

**Two separate implementations exist:**

1. **`bulk-quote-generator.ts` (line 81-86):** Hardcoded `VOLUME_TIERS` array
   ```
   SMALL:      0-50 m²   → 0%
   MEDIUM:    50-150 m²  → 5%
   LARGE:    150-500 m²  → 10%
   ENTERPRISE: 500+ m²   → 15%
   ```

2. **`unit-block-calculator.ts` (line 58-85):** Separate `DEFAULT_VOLUME_TIERS` using Decimal types
   - Same tiers and percentages
   - Has `setVolumeTiers()` method for custom tiers (never called from DB)

### Is Volume Discount Tenant-Configurable?
❌ NO — both implementations use hardcoded tiers. The `unit-block-calculator.ts` has a `setVolumeTiers()` hook but it's never called with database values. There's no `volume_tiers` table in the schema.

**Rule 22 violation:** "Every price, rate, surcharge, and minimum must come from the database."

---

## SECTION 11: Register & Schedule Parsers

### Register Parser
- Uses Claude Vision API (`claude-sonnet-4-20250514`) to extract unit data from PDF documents
- Returns `ParsedRegister` with units, confidence scores
- ❌ NO org scoping — parser doesn't reference company_id

### Schedule Parser
- Uses Claude Vision API to extract stone specifications from finishes schedule PDFs
- Returns room-by-room specs (stone type, thickness, edge profile, fixtures)
- ❌ NO org scoping

### Org Scoping in Parsers
Both parsers are stateless functions that process images and return structured data. They don't query the database directly. Org scoping would need to be enforced at the API route level (which it isn't — see Section 3).

---

## SECTION 12: Generated Quote → Quote Builder Compatibility

### Can Generated Quotes Open in Quote Builder?
- `QuoteDetailClient.tsx` has no special handling for unit-block-generated quotes
- Generated quotes follow the same `quotes` → `quote_rooms` → `quote_pieces` schema
- ✅ They **should** open in the builder since the piece structure is standard

### Piece Structure Compatibility

| Expected by Builder | Set by Template Cloner? | Notes |
|--------------------|------------------------|-------|
| `room_id` | ✅ | |
| `name` | ✅ | |
| `length_mm`, `width_mm`, `thickness_mm` | ✅ | |
| `material_id` | ✅ | |
| `edge_top/bottom/left/right` (UUID) | ✅ | Resolved from template edge spec |
| `cutouts` (JSON) | ✅ | But uses `{type, quantity}` not `{cutoutTypeId, quantity}` |
| `lamination_method` | ✅ | |
| `area_sqm` | ✅ | |

### Key Risks When Opening in Builder
1. **Cutout editing:** Template cutouts use `{type: "UNDERMOUNT_SINK"}` — the builder's cutout add/remove expects `{cutoutTypeId: UUID}`. Existing cutouts display OK (PieceRow fallback handles string names), but editing/removing may fail.
2. **Material cost:** Initial `material_cost` on pieces = raw `price_per_sqm × area`, without margins. Pricing calculator overrides this, but if recalculation fails, the raw cost persists.

### Live Recalculation
❌ No reference to `recalculate` or `liveRecalc` in template-cloner or bulk-generator. Pricing runs once at generation time. If pricing settings change after generation, quotes retain old prices until manually recalculated.

---

## 1. INFRASTRUCTURE GAP MATRIX

| Feature | Quote Builder | Unit Block | Gap | Severity |
|---------|:------------:|:----------:|-----|:--------:|
| Pricing calculator v2 | ✅ | ✅ (via template-cloner) | — | 🟢 |
| Fabrication categories | ✅ | ✅ (resolved at calc time from material) | — | 🟢 |
| Category-aware service rates | ✅ | ✅ (resolved at calc time) | — | 🟢 |
| Lamination / mitre logic | ✅ | ✅ | — | 🟢 |
| Supplier margins | ✅ | ✅ (resolved at calc time) | — | 🟢 |
| GST calculation | ✅ (configurable) | ⚠️ Hardcoded 10% | Uses `0.10` not `pricing_settings.gst_rate` | 🟡 |
| **Multi-tenant scoping** | ✅ (`company_id`) | ❌ **NONE** | No `company_id` on any UB model, no query filtering | 🔴 |
| Error boundaries (UI) | ✅ | ❌ None | No React error boundaries | 🟡 |
| Cutout type resolution | ✅ (3-path: UUID → string → name) | ⚠️ String-only `{type, qty}` | Display OK, editing broken | 🟡 |
| Edge profile colours | ✅ (edgeColour/edgeCode) | ❌ Not used | No visual edge feedback in UB UI | 🟢 |
| Shared edge-utils.ts | ✅ | ❌ Not imported | UB doesn't use shared utils | 🟢 |
| Autocomplete (J2) | ✅ | ❌ None | No autocomplete inputs | 🟢 |
| Description generation (J2) | ✅ | ❌ None | Pieces get template label, no auto-description | 🟢 |
| One-page layout (J1) | ✅ | ✅ | Single page, not tabbed | 🟢 |
| Railway-safe patterns | ✅ | ✅ | `Array.from(new Set())`, `as unknown as` | 🟢 |
| JSON double-cast (Rule 9) | ✅ | ✅ | All JSON casts use double-cast | 🟢 |
| Next.js 14 await params | ✅ | ✅ | API routes use `await params` | 🟢 |
| **Volume discount config** | N/A | ❌ **Hardcoded** | Tiers not tenant-configurable (Rule 22) | 🔴 |
| **Pricing failure → $0 quote** | ✅ | ⚠️ Silent fail | Quote created with $0 if pricing fails | 🔴 |
| **Edge type fallback** | ✅ | ⚠️ First-match fallback | Unknown profiles → same default edge for all | 🟡 |

---

## 2. CRITICAL FINDINGS (Prioritised)

### 🔴 CRITICAL — Will cause wrong pricing or data leaks at scale

1. **Multi-Tenant Data Leak (Section 3)**
   - `unit_block_projects` has NO `company_id` column
   - API route `GET /api/unit-blocks` returns ALL projects across all tenants
   - No query filters by org in any API route or service
   - `requireAuth()` returns `companyId` but it's never used
   - **Impact:** Every tenant can see, edit, and delete every other tenant's projects, units, templates, and quotes

2. **Volume Discount Tiers Hardcoded (Section 10)**
   - Two separate hardcoded tier arrays (bulk-generator + calculator)
   - No database table for volume tiers
   - Not tenant-configurable (Rule 22 violation: "Every price must come from the database")
   - **Impact:** All tenants get same discount schedule; no way to customise per client

3. **Pricing Failure Creates $0 Quotes (Section 5)**
   - `template-cloner.ts` line 310-313: if `calculateQuotePrice()` throws, the quote is created with `$0` totals
   - In bulk generation, this produces dozens of $0 quotes marked as "SUCCESS"
   - **Impact:** A 55-unit project could silently generate 55 quotes all showing $0 if pricing settings aren't seeded

### 🟡 MEDIUM — Will cause UX inconsistency or missing features

4. **GST Rate Hardcoded (Section 4.5)**
   - Template cloner: `totalExGst * 0.1` (hardcoded)
   - Bulk generator: `new Decimal('0.10')` (hardcoded)
   - `pricing_settings.gst_rate` exists but isn't read
   - **Impact:** If GST rate changes or tenant has different tax jurisdiction, all UB quotes use wrong rate

5. **No Error Boundaries in Unit Block UI (Section 5)**
   - Quote Builder has `PieceEditorErrorBoundary`
   - Unit Block has zero error boundaries
   - **Impact:** A single React error in any sub-component crashes the entire 807-line project page

6. **Edge Type Fallback Is Unreliable (Section 6)**
   - `resolveEdgeTypeId()` falls back to first `category: 'polish'` edge if profile name doesn't match
   - **Impact:** If edge type names don't match exactly (case, spacing), all edges get the same default profile

7. **Cutout Type Mismatch for Builder Editing (Section 6)**
   - Template cutouts store `{ type: "UNDERMOUNT_SINK", quantity: 1 }`
   - Builder edit operations expect `{ cutoutTypeId: UUID }`
   - PieceRow display works (has string fallback), but cutout editing in builder fails
   - **Impact:** Users can't properly edit cutouts on unit-block-generated quotes in the Quote Builder

8. **No edge-utils.ts Integration (Section 6)**
   - Unit Block UI doesn't use the shared edge utility functions
   - No colour-coded edge display, no consistent edge labelling
   - **Impact:** Inconsistent UX between Quote Builder (coloured edges) and Unit Block (plain text)

### 🟢 LOW — Cosmetic or future enhancement

9. **No Autocomplete in Unit Block UI** — Not critical; UB uses dropdowns/parsers rather than free-text input
10. **No Description Generation** — Templates use labels directly; auto-descriptions are a Quote Builder enhancement
11. **`unit-block-calculator.ts` Appears Partially Unused** — The `UnitBlockCalculator` class has methods like `calculateConsolidatedMaterials()`, `generatePhasedSchedule()`, `comparePricingModels()` that appear to be stubs/scaffolding not called by any route
12. **Two Separate Volume Tier Implementations** — Both `bulk-quote-generator.ts` and `unit-block-calculator.ts` define their own volume tiers independently

---

## 3. CUTOUT/EDGE DATA SHAPE ANALYSIS

### Cutout JSON Shapes

| System | Shape | Example |
|--------|-------|---------|
| **Template auto-generator** (creates templates) | `{ type: string, quantity: number }` | `{ type: "UNDERMOUNT_SINK", quantity: 1 }` |
| **Template cloner** (creates pieces from templates) | `{ type: string, quantity: number }` | Same as above — passes through |
| **Quote Builder — creating cutouts** | `{ cutoutTypeId: UUID, quantity: number, ... }` | `{ cutoutTypeId: "abc-123", quantity: 1 }` |
| **PieceRow** (display) | Handles BOTH: `cutoutTypeId` (UUID lookup) → `type`/`name` (string fallback) | Works for both |
| **PieceVisualEditor** (editing) | Expects `typeId` (UUID) for add/remove operations | ❌ Template cutouts have no UUID |

**Risk:** Template-generated cutouts will **display correctly** in PieceRow (string fallback works). But attempting to **edit, remove, or add** cutouts in PieceVisualEditor may fail because it expects UUID-based `cutoutTypeId`.

### Edge Data Shapes

| System | Storage | Example |
|--------|---------|---------|
| **Template** (TemplateEdge) | `{ finish: 'POLISHED', profileType: 'ARRIS_2MM' }` | JSON in template blob |
| **Template cloner** (resolves to DB) | `edge_top: UUID \| null` | Resolved via `resolveEdgeTypeId()` |
| **Quote Builder pieces** (DB) | `edge_top: UUID \| null` | Same — from `edge_types.id` |
| **PieceVisualEditor** (display) | Reads `edge_top` UUID → lookups `edge_types` name → `edgeColour()` | Works if UUID is correct |

**Risk:** Edge resolution is the weak link. `resolveEdgeTypeId()` does a `name: { contains: ... }` fuzzy match. If the edge_types table has names that don't contain "ARRIS 2MM" (after underscore-to-space conversion), the specific profile won't match and the fallback picks an arbitrary polish edge.

---

## 4. BULK GENERATION RISK ASSESSMENT

### For a 55-unit Bask Bokarina project:

| Scenario | What Happens | Severity |
|----------|-------------|----------|
| **Material mapping missing for one unit** | Dry-run catches it → unit marked "not ready" → skipped during generation | ✅ Safe |
| **Pricing settings not seeded for tenant** | `calculateQuotePrice()` throws → caught by template-cloner → quote created with **$0 pricing** → marked as "SUCCESS" | 🔴 **55 quotes at $0** |
| **Service rates empty ($0 pricing bug)** | Pricing calc returns $0 for services → piece totals incorrect → all quotes underpriced | 🔴 **55 underpriced quotes** |
| **Cutout type doesn't match** | Cutouts stored as `{type: "UNDERMOUNT_SINK"}` — pricing calc looks up by name string → if no match, cutout not priced | 🟡 Cutouts may be free |
| **Edge type name doesn't match** | `resolveEdgeTypeId()` fallback → all edges get same default profile → pricing calc uses default edge rate | 🟡 Edge pricing may be incorrect |
| **Expected generation time** | Sequential processing: ~55 × (1 DB transaction + 1 pricing calc) ≈ 55 × 200-500ms = **11-28 seconds** | ⚠️ |
| **Timeout risk** | Vercel/Railway timeout typically 30-60s. 55 units may exceed this. No streaming/chunking. | 🟡 Possible timeout for large projects |
| **One unit fails mid-batch** | Error caught, logged, marked ERROR → remaining units continue | ✅ Safe (error isolation works) |
| **Tenant A generates quotes on Tenant B's project** | No org check → **fully possible** | 🔴 Data corruption |

---

## 5. RECOMMENDED UPGRADE PLAN

| Priority | What | Why | Scope |
|:--------:|------|-----|-------|
| **1** | **Add multi-tenant scoping to Unit Block** | Data leak vulnerability — any tenant can access all projects. Add `company_id` to `unit_block_projects`, filter all queries by authenticated user's company. | Schema migration + all 12 API routes + all services |
| **2** | **Handle pricing failures gracefully** | 55 quotes at $0 is catastrophic. If pricing fails, mark the unit as ERROR (not SUCCESS), don't link the $0 quote to the unit. | `template-cloner.ts` + `bulk-quote-generator.ts` |
| **3** | **Make volume tiers tenant-configurable** | Rule 22 violation. Create `volume_tiers` table, seed defaults, read from DB in bulk-generator. Remove hardcoded arrays. | Schema + seed + `bulk-quote-generator.ts` + `unit-block-calculator.ts` |
| **4** | **Read GST rate from pricing_settings** | Hardcoded 10% won't work for all jurisdictions. Read `pricing_settings.gst_rate` where GST is calculated. | `template-cloner.ts` + `bulk-quote-generator.ts` |
| **5** | **Improve edge type resolution** | Fuzzy `contains` matching is fragile. Add exact enum/code matching, or store edge_type_id directly in templates. | `template-cloner.ts` + `resolveEdgeTypeId()` |
| **6** | **Align cutout shape with builder** | Store `cutoutTypeId` (UUID) alongside `type` (string) in template cutouts, so builder edit operations work on generated quotes. | `template-auto-generator.ts` + `template-cloner.ts` |
| **7** | **Add error boundaries to Unit Block UI** | One React error crashes the entire 807-line page. Wrap key sections in error boundaries. | `unit-block/[id]/page.tsx` + sub-components |
| **8** | **Add timeout handling for large batch generation** | 55+ units may exceed HTTP timeout. Implement background job processing or chunked generation with progress streaming. | `generate/route.ts` + new background job infra |
| **9** | **Integrate edge-utils.ts in Unit Block UI** | Consistent colour-coded edge display across the platform. | Unit Block UI components |
| **10** | **Consolidate duplicate volume tier code** | Two independent implementations (bulk-generator + calculator) should share a single source. | Refactor to single module |
| **11** | **Add autocomplete/description generation** | J2 standard features for consistency with Quote Builder. Low priority since UB uses template-based generation. | Unit Block UI |

---

## APPENDIX: Full Command Output Reference

All commands from the audit specification were executed. Key findings are summarised above. Raw command outputs are available in the session transcript.

### Files Read in Full
- `src/lib/services/template-cloner.ts` (384 lines)
- `src/lib/services/bulk-quote-generator.ts` (523 lines)
- `src/lib/services/template-auto-generator.ts` (336 lines)
- `src/lib/services/finish-tier-resolver.ts` (~280 lines)
- `src/lib/calculators/unit-block-calculator.ts` (409 lines)
- `src/lib/types/unit-templates.ts` (142 lines)
- `src/app/api/unit-blocks/route.ts` (115 lines)
- `src/lib/auth.ts` (header, to verify companyId availability)
- `prisma/schema.prisma` (all unit block models)
- `docs/stonehenge-dev-rulebook.md` (all 59 rules)
