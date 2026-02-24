# Pricing Audit Report — Stonehenge v2

> **Date:** 24 February 2026
> **Status:** Audit Only — No files modified
> **Branch:** `claude/fix-pricing-display-iz14P`

---

## Executive Summary

There are **two independent price data pipelines** that never synchronise. The pricing calculator (`pricing-calculator-v2.ts`) produces correct figures using the slab optimiser, but most UI surfaces read from a **stale, naively-computed** `total_cost` field on the `quote_pieces` DB table. The calculator writes its results to `quotes.calculation_breakdown` (a JSON blob on the quotes table), but **never writes back per-piece totals to `quote_pieces.total_cost`**. This single architectural gap causes both reported bugs.

---

## 1. Price Storage Map

### 1.1 Per-Piece Fields (`quote_pieces` table)

| Field | Schema Location | What Writes It | When |
|---|---|---|---|
| `material_cost` | `prisma/schema.prisma:523` | PATCH `pieces/[pieceId]/route.ts:361` | Every piece save |
| `features_cost` | `prisma/schema.prisma:524` | Piece create/update endpoints | When features change |
| `total_cost` | `prisma/schema.prisma:525` | PATCH `pieces/[pieceId]/route.ts:362` | Every piece save |

**How `total_cost` is computed on write** (`src/app/api/quotes/[id]/pieces/[pieceId]/route.ts:338-362`):

```
if (PER_SLAB && slab dimensions exist):
    materialCost = ceil(areaSqm / slabAreaSqm) * price_per_slab
else:
    materialCost = areaSqm * price_per_sqm

total_cost = materialCost + features_cost
```

This is a **naive per-piece calculation**. It does NOT use the slab optimiser, does NOT include fabrication costs (cutting, polishing, edge profiles, cutouts, installation, lamination), and does NOT account for oversize surcharges or discount rules.

### 1.2 Quote-Level Fields (`quotes` table)

| Field | Schema Location | What Writes It | When |
|---|---|---|---|
| `subtotal` | `prisma/schema.prisma:599` | POST `calculate/route.ts:106` | When calculate endpoint is called |
| `tax_amount` | `prisma/schema.prisma:601` | POST calculate endpoint `:107` | Same |
| `total` | `prisma/schema.prisma:602` | POST calculate endpoint `:108` | Same |
| `calculated_at` | `prisma/schema.prisma:610` | POST calculate endpoint `:109` | Same |
| `calculation_breakdown` | `prisma/schema.prisma:612` | POST calculate endpoint `:110` | Same |

The `calculation_breakdown` JSON contains the entire `CalculationResult` object, including per-piece breakdowns at `breakdown.pieces[]` with correct `pieceTotal` values.

### 1.3 The Critical Gap

POST `/api/quotes/[id]/calculate/route.ts` (lines 103-111) persists to:
- `quotes.subtotal` -- YES
- `quotes.calculation_breakdown` -- YES
- `quote_pieces.total_cost` -- **NEVER UPDATED**
- `quote_pieces.material_cost` -- **NEVER UPDATED**

PATCH `pieces/[pieceId]/route.ts` (lines 384-390) calls `calculateQuotePrice()` directly but **does not persist** the result. It only returns `costBreakdown` in the API response.

---

## 2. Price Display Map

### 2.1 Spatial List (RoomSpatialView)

| Aspect | Detail |
|---|---|
| **Component** | `src/components/quotes/RoomSpatialView.tsx` |
| **Display lines** | Lines 994 and 1018: `formatCurrency(piece.total_cost)` |
| **Data flows from** | `QuoteDetailClient.tsx:2904` (view) and `:3527` (edit) pass `total_cost: p.total_cost` / `p.totalCost` |
| **API source** | GET `/api/quotes/[id]` -> `transformPieceForClient()` at `route.ts:431`: `totalCost: Number(piece.total_cost \|\| 0)` |
| **What this reads** | **Stored DB `quote_pieces.total_cost`** -- the naive calculation |
| **Correct?** | **NO** -- shows $1,126.55 instead of $4,554.34 |

### 2.2 Room Grouping (edit mode sidebar)

| Aspect | Detail |
|---|---|
| **Component** | `src/app/(dashboard)/quotes/[id]/builder/components/RoomGrouping.tsx` |
| **Display lines** | Line 235: `formatCurrency(Number(piece.totalCost \|\| 0))`, Line 119/189: `getRoomTotal()` sums `p.totalCost` |
| **API source** | Same as spatial list -- GET `/api/quotes/[id]` -> stored DB `total_cost` |
| **Correct?** | **NO** -- same wrong figure as spatial list |

### 2.3 Piece Card / Pricing Summary

| Aspect | Detail |
|---|---|
| **Component** | `src/app/(dashboard)/quotes/[id]/builder/components/PricingSummary.tsx` |
| **Display lines** | Lines 657 and 769: `formatCurrency(piece.pieceTotal)` |
| **Data source** | POST `/api/quotes/[id]/calculate` -> `CalculationResult.breakdown.pieces[].pieceTotal` |
| **What this reads** | **Live calculator result** from `pricing-calculator-v2.ts` |
| **Correct?** | **YES** -- shows $4,554.34 |

### 2.4 PDF Room Totals

| Aspect | Detail |
|---|---|
| **Service** | `src/lib/services/quote-pdf-service.ts` |
| **Per-piece total** | Line 312: `pieceTotal: pb?.pieceTotal ?? toNumber(piece.total_cost)` |
| **Room total** | Line 333: `pdfPieces.reduce((sum, p) => sum + p.pricing.pieceTotal, 0)` |
| **Data source** | `calculation_breakdown.breakdown.pieces[]` if exists (lines 263-266), **falling back to DB `piece.total_cost`** |
| **Correct?** | **CONDITIONALLY** -- correct if breakdown is fresh and covers all pieces; wrong if stale |

### 2.5 PDF Subtotal

| Aspect | Detail |
|---|---|
| **Line** | `quote-pdf-service.ts:245`: `const subtotal = toNumber(quote.subtotal)` |
| **Data source** | Stored `quotes.subtotal` from last POST `/calculate` call |
| **Correct?** | **CONDITIONALLY** -- only if calculation was run after all piece changes |

---

## 3. Root Cause: $1,126.55 vs $4,554.34

### The $1,126.55 figure (WRONG)

**Origin:** `quote_pieces.total_cost` in the database.

**Written by:** PATCH `src/app/api/quotes/[id]/pieces/[pieceId]/route.ts` at lines 338-362.

**Formula for Main Kitchen Benchtop** (4941 x 600mm = 2.965 sqm):

```
materialCost = areaSqm * price_per_sqm
             = 2.965 * ~$380/sqm
             = $1,126.55

total_cost   = materialCost + features_cost
             = $1,126.55 + $0
             = $1,126.55
```

This uses the **PER_SQUARE_METRE** path (line 343: `areaSqm * material.price_per_sqm.toNumber()`). It includes ONLY material cost. No fabrication, no edges, no cutouts, no installation, no slab optimisation.

### The $4,554.34 figure (CORRECT)

**Origin:** `CalculationResult.breakdown.pieces[].pieceTotal` from the pricing calculator.

**Computed by:** `pricing-calculator-v2.ts` via the slab optimiser.

**Formula:**

```
pieceTotal = materials.total        (slab-optimised material cost)
           + fabrication.subtotal   (cutting + polishing + edges + cutouts + installation + lamination)
           + oversize costs         (if applicable)
```

### Why they differ

`total_cost` stores **material cost only** (naive area x rate). The calculator's `pieceTotal` is the **full piece cost** including all fabrication. These are fundamentally different numbers measuring different things, but both are displayed as "piece cost" in different UI locations.

### The data flow disconnect

```
Piece Edit (PATCH)
  |-- Writes naive total_cost to quote_pieces --> Spatial List reads this ($1,126.55)
  |-- Calls calculateQuotePrice()
  |   |-- Returns correct pieceTotal ($4,554.34)
  |   |-- Does NOT persist to quote_pieces.total_cost
  |   |-- Does NOT persist to quotes.calculation_breakdown
  |-- Returns costBreakdown in response (used by nothing persistent)

PricingSummary (separate POST /calculate call)
  |-- Calls POST /api/quotes/[id]/calculate
  |-- Gets CalculationResult with pieceTotal = $4,554.34
  |-- DOES persist to quotes.calculation_breakdown
  |-- Displays correct figure
```

---

## 4. Root Cause: PDF $8,467.10 Room Total vs $5,275.11 Subtotal

### How the PDF assembles prices

1. **Subtotal** (`quote-pdf-service.ts:245`): reads `quote.subtotal` -- persisted by last POST `/calculate`
2. **Per-piece totals** (`quote-pdf-service.ts:300-312`): reads from `calculation_breakdown.breakdown.pieces[].pieceTotal`, falling back to `quote_pieces.total_cost`
3. **Room total** (`quote-pdf-service.ts:333`): sums per-piece totals for each room

### Why room total > subtotal

The subtotal formula in the calculator is:

```
piecesSubtotal = materials.subtotal + edges.subtotal + cutouts.subtotal + services.subtotal
baseSubtotal   = piecesSubtotal + delivery + templating
subtotal       = baseSubtotal + customCharges - discount
```

Two scenarios explain the $8,467.10 vs $5,275.11 discrepancy:

**Scenario A (most likely): Mixed data staleness.** Pieces were modified after the last calculation. The stored `calculation_breakdown` has per-piece totals for the OLD set of pieces. New/changed pieces not in the breakdown fall back to their DB `total_cost` (the naive number). The mix of correct old pieceTotals + naive new total_cost values produces a room total that doesn't match the stale subtotal.

**Scenario B: Discount effect.** A ~38% discount would reduce subtotal from ~$8,467 to ~$5,275. Room totals sum pre-discount pieceTotals. The PDF doesn't show the discount reduction in the room total display, only in the overall subtotal.

**Root problem:** Room totals and subtotal are computed from different data sources that go stale at different times.

---

## 5. The Fix -- Single Source of Truth

### The correct source

**`quotes.calculation_breakdown`** is the single source of truth for all pricing.

- Per-piece total: `breakdown.pieces[].pieceTotal`
- Quote subtotal: `subtotal`
- Quote total: `totalIncGst`
- Per-piece material: `breakdown.pieces[].materials.total`
- Per-piece fabrication: `breakdown.pieces[].fabrication`

### What needs to change

| Component | Currently Reads | Should Read |
|---|---|---|
| **RoomSpatialView** | `piece.total_cost` from DB | `breakdown.pieces[pieceId].pieceTotal` |
| **RoomGrouping** | `piece.totalCost` from DB | Same as above |
| **QuoteDetailClient** | Passes DB `total_cost` to children | Merge calculator result into piece data |
| **PDF room totals** | Breakdown with fallback to DB | Breakdown only; ensure always fresh |
| **PDF subtotal** | `quote.subtotal` from DB | `calcBreakdown.subtotal` when exists |
| **Pieces GET endpoint** | Recomputes naive materialCost | Read from `calculation_breakdown` |

### Recommended approach

Enrich piece data in `QuoteDetailClient` by merging the calculator result. When `handleCalculationUpdate` receives a `CalculationResult`, build a `Map<pieceId, PiecePricingBreakdown>` and override each piece's `totalCost` with `pieceTotal` from the breakdown. All child components automatically get the correct figure.

---

## 6. Dead Price Fields

| Field | Location | Status | Recommendation |
|---|---|---|---|
| `quote_pieces.material_cost` | `schema.prisma:523` | **UNRELIABLE** | Deprecate. Never updated by calculator. |
| `quote_pieces.total_cost` | `schema.prisma:525` | **UNRELIABLE** | Deprecate. Only material + features, no fabrication. |
| `quote_pieces.features_cost` | `schema.prisma:524` | **UNRELIABLE** | Investigate. May be vestigial. |
| `quotes.calculated_total` | `schema.prisma:611` | **UNUSED** | Investigate and potentially remove. |

Fields that ARE correct:

| Field | Location | Status |
|---|---|---|
| `quotes.subtotal` | `schema.prisma:599` | Correct when written by calculate endpoint |
| `quotes.calculation_breakdown` | `schema.prisma:612` | **THE** source of truth for all pricing |

---

## 7. Implementation Plan

### PR 1: Enrich piece data with calculator results in QuoteDetailClient

**Scope:** Frontend only.

1. In `QuoteDetailClient.tsx`, when `handleCalculationUpdate` receives a `CalculationResult`, build a `Map<number, PiecePricingBreakdown>` from `result.breakdown.pieces` and store in state.
2. When passing `total_cost`/`totalCost` to RoomSpatialView (lines 2904, 3527) and RoomGrouping, look up `pieceTotal` from the map. Fall back to DB value only if no calculator result exists yet.

**Risk:** Low. Purely additive. Falls back to current behaviour.

### PR 2: Persist calculation results after piece edits

**Scope:** API backend only.

1. In PATCH `pieces/[pieceId]/route.ts`, after line 387 where `calculateQuotePrice` is already called, persist the result to `quotes` table (same as POST `/calculate` does at lines 103-111).

**Risk:** Low. Calculation already runs, just not saved.

### PR 3: Fix the PDF to use calculation_breakdown consistently

**Scope:** PDF service only.

1. Use `calcBreakdown.subtotal` instead of `quote.subtotal` (line 245) when breakdown exists.
2. Ensure fallback `calculateQuotePrice` at line 257 also persists its result.
3. Document or remove the `piece.total_cost` fallback at line 312.

**Risk:** Low-medium. Verify PDF rendering with real data.

### PR 4: Fix the pieces GET endpoint

**Scope:** API backend only.

1. Remove or replace `computeMaterialCost` (lines 52-71) which computes naive material cost.
2. Read from `quotes.calculation_breakdown` for correct per-piece totals.

**Risk:** Medium. Must identify all callers first.

### PR 5 (Optional): Deprecate dead fields

**Scope:** Schema + codebase cleanup.

1. Mark `quote_pieces.material_cost` and `total_cost` as deprecated in schema.
2. Gradually remove reads across codebase.
3. Remove fields in a future migration.

**Risk:** High. Requires thorough grep verification. Do as dedicated series.

---

## Appendix A: Auto-Calculate Trigger Chain

```
Piece edit
  -> useAutoSlabOptimiser (500ms debounce) -> POST /api/quotes/[id]/optimize
  -> optimisationRefreshKey++ -> triggers pricing recalculation
  -> PricingSummary calls POST /calculate -> persists to DB
  -> PricingSummary displays correct figure  YES
  -> Spatial list still reads stale DB       NO
```

## Appendix B: Key File Reference

| File | Role |
|---|---|
| `prisma/schema.prisma:515-534` | `quote_pieces` model with price fields |
| `prisma/schema.prisma:593-612` | `quotes` model with price fields |
| `src/lib/services/pricing-calculator-v2.ts:1042-1197` | Calculator subtotal/breakdown/return |
| `src/lib/types/pricing.ts:138-289` | `CalculationResult` and `PiecePricingBreakdown` types |
| `src/app/api/quotes/[id]/calculate/route.ts:103-111` | Calculator results persisted to DB |
| `src/app/api/quotes/[id]/pieces/[pieceId]/route.ts:338-362` | Naive `total_cost` written |
| `src/app/api/quotes/[id]/pieces/[pieceId]/route.ts:384-390` | Calculator called but NOT persisted |
| `src/app/api/quotes/[id]/route.ts:418-436` | `transformPieceForClient` returns stored DB values |
| `src/app/api/quotes/[id]/pieces/route.ts:52-101` | `computeMaterialCost` naive calculation |
| `src/components/quotes/RoomSpatialView.tsx:994,1018` | Displays wrong `piece.total_cost` |
| `RoomGrouping.tsx:235` | Displays wrong `piece.totalCost` |
| `PricingSummary.tsx:657,769` | Displays correct `piece.pieceTotal` |
| `src/lib/services/quote-pdf-service.ts:245,300-312,333` | PDF reads mixed sources |
| `src/hooks/useAutoSlabOptimiser.ts` | Auto-triggers slab optimisation |
| `QuoteDetailClient.tsx:2904,3527` | Passes DB `total_cost` to spatial view |
