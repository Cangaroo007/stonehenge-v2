# GRAIN-MATCHING-AUDIT.md
# Slab Optimiser — Grain Matching Audit

> **Date:** 24 February 2026
> **Branch:** main (read-only audit — no code changes)
> **Audit scope:** `src/lib/services/slab-optimizer.ts`, `src/lib/services/multi-material-optimizer.ts`, `src/app/api/quotes/[id]/optimize/route.ts`, `src/lib/services/multi-slab-calculator.ts`, `src/lib/services/pricing-calculator-v2.ts`, `src/types/slab-optimization.ts`

---

## 1. Current Optimiser Capabilities

| Feature | Status | Details |
|---------|--------|---------|
| Waterfall grain blocks | ❌ | No concept of grain blocks exists. The `piece_relationships` table has `RelationshipType.WATERFALL` in the schema, but the optimize API route **never queries `piece_relationships`**. The optimiser receives pieces individually with no relationship data. Waterfall pairs can end up on different slabs. |
| Lamination strip generation | ✅ | `generateLaminationStrips()` in `slab-optimizer.ts` creates one strip per finished edge for any piece with `thickness >= 40mm`. Strip width is 60mm for standard/waterfall edges, 40mm for mitre edges. Strips are tagged with `isLaminationStrip`, `parentPieceId`, and `stripPosition` for tracking. |
| Strip co-placement with parent | ❌ | Strips are placed by the same FFD algorithm as all other pieces, sorted by area (largest-first). There is **no adjacency constraint** — a strip will be placed wherever free space is found, which may be a different slab or a different area of the same slab than its parent piece. This doesn't affect slab count significantly (strips are small), but it misrepresents the cutting requirement for grain-matched lamination. |
| Oversize detection | ✅ | `preprocessOversizePieces()` in `slab-optimizer.ts` detects pieces that exceed slab dimensions and splits them into grid segments before FFD runs. `detectOversizePieces()` in `multi-material-optimizer.ts` records join strategy (`LENGTHWISE`, `WIDTHWISE`, `MULTI_JOIN`) and suggested join position per oversize piece. The pricing calculator independently uses `calculateCutPlan()` from `multi-slab-calculator.ts` to identify oversize pieces and calculate join length in lineal metres. |
| Join length calculation | ✅ | `calculateCutPlan()` in `multi-slab-calculator.ts` calculates `joinLengthMm` for each oversize piece based on slab dimensions and cut strategy. Pricing calculator converts to lineal metres and multiplies by the `JOIN` service rate from the DB (`getServiceRate(serviceRates, 'JOIN', ...)`). A grain matching surcharge (default 15%, configurable via `pricing_settings.grain_matching_surcharge_percent`) is applied on top as a percentage of the piece's fabrication subtotal. |

---

## 2. Piece Input Data

What the optimiser receives vs what it needs:

| Data Point | Received? | Source | Needed For |
|------------|-----------|--------|------------|
| Dimensions (length × width in mm) | ✅ Yes | `quote_pieces.length_mm`, `quote_pieces.width_mm` | Basic placement |
| Thickness | ✅ Yes | `quote_pieces.thickness_mm` (defaults to 20 if null) | Strip generation threshold (≥40mm) |
| Edge profiles per side (top/bottom/left/right) | ✅ Yes | `quote_pieces.edge_top/bottom/left/right` resolved to names via `edge_types` DB lookup | Strip generation — which edges need strips, and strip width (mitre vs standard) |
| Material ID | ✅ Yes | `quote_pieces.material_id` | Multi-material grouping (separate FFD per material) |
| Slab dimensions per material | ✅ Yes | `materials.slab_length_mm`, `materials.slab_width_mm` (via `MaterialInfo` in multi-material path) | Oversize detection threshold |
| Waterfall relationship | ❌ No | Exists in `piece_relationships` table (`relationship_type = WATERFALL`) but **never queried** in the optimize route | Grain block grouping — forcing waterfall pairs onto the same slab |
| `canRotate` per piece | ❌ No | Not stored per piece. All pieces inherit the global `allowRotation` flag from the request body | Prevents incorrect rotation of pieces where grain direction matters |
| `waterfall_height_mm` | ❌ No | Exists on `quote_pieces` schema but not fetched or passed to the optimiser | Could inform waterfall strip dimension (currently uses the piece's own height) |

---

## 3. Gap Analysis

### GAP 1 — Waterfall grain blocks (Critical)

**What's missing:** The optimiser has zero knowledge of waterfall relationships.

The `piece_relationships` table exists with `RelationshipType.WATERFALL` and the schema has `waterfall_height_mm` on `quote_pieces`. But the optimize route at `src/app/api/quotes/[id]/optimize/route.ts` only includes:

```typescript
quote_rooms: {
  include: {
    quote_pieces: {
      include: { materials: true }, // <-- no sourceRelationships or targetRelationships
    },
  },
},
```

**Effect:** A 1200×600mm benchtop and its 600×900mm waterfall leg are placed independently. The FFD algorithm may put the benchtop on Slab 1 and the waterfall on Slab 2. In reality, both pieces must come from the same slab so the grain flows across the edge. This:
1. May produce an incorrect slab count (one slab could hold both; two are counted)
2. Cannot guarantee the grain-continuity placement required by the fabricator

**What correct behaviour looks like:** A "grain block" concept — a group of pieces constrained to the same slab (or same sequential region of slab). The FFD would need to treat a grain block as a unit: place the largest piece first, then place the grain-paired piece in the remaining space of the SAME slab only.

---

### GAP 2 — Strip adjacency (Minor for slab count; matters for cut layout)

**What's missing:** Lamination strips are generated correctly but placed without any constraint to be adjacent to, or on the same slab as, their parent piece.

**Effect:** Strips will end up wherever the FFD finds space (typically on the last slab, in leftover gaps). For 40mm laminated benchtops, the fabricator cuts the strip from the same slab as the parent piece for grain continuity. The current layout doesn't enforce or even prefer same-slab placement.

**Practical impact on slab count:** Low. Strips are small (60mm × piece-length or 40mm × piece-length) and will almost always fit in leftover space on an existing slab. They won't normally trigger a new slab. But the visual slab layout shown to the user/fabricator is misleading.

---

### GAP 3 — Strip widths are hardcoded constants, not DB-configurable (Rule 22 violation)

`STRIP_CONFIGURATIONS` in `src/lib/constants/slab-sizes.ts` hardcodes:
- Standard/waterfall strip visible width: **60mm**
- Mitre lamination width: **40mm**

There is **no `strip_configurations` table** in the Prisma schema. This means strip dimensions cannot be adjusted per tenant, per material supplier, or per machine setup. Rule 22 states all rates and dimensions must be DB-configurable.

**Impact on slab count:** If actual strip widths at a specific fab shop differ (e.g., 68mm instead of 60mm), the slab utilisation calculation will be slightly wrong.

---

### GAP 4 — Grain matching surcharge applied to ALL oversize pieces, not just grain-matched ones

In `pricing-calculator-v2.ts` lines 686–693, the grain matching surcharge (15%) is applied to **every piece** where `!cutPlan.fitsOnSingleSlab`. This includes:
- A 3600mm bathroom splashback that just needs a butt join (no grain matching required)
- A structural base that's cut from off-cuts with no grain matching intent

The surcharge should arguably only apply to pieces where the join **requires** grain matching (i.e., designer-specified, or any join in a premium material where grain continuity is required). As currently implemented, any oversized piece in any material gets the surcharge.

---

### GAP 5 — `calculateCutPlan` uses category-default slab dimensions, not per-material dimensions

`multi-slab-calculator.ts` calls `getSlabSize(materialCategory)` — this uses the hardcoded category default (e.g., 3200×1600mm for ENGINEERED). It does NOT use the material record's actual `slab_length_mm` / `slab_width_mm`.

This means the oversize determination in the pricing calculator could differ from the oversize determination in the optimiser (which uses per-material dimensions from the DB). Example:

- DB material record: 2800×1400mm slab (natural stone)
- `calculateCutPlan` uses category default: 3200×1600mm
- A 2900×600mm piece: pricing calculator says "fits on one slab" → no join cost
- Optimiser says "oversize" → splits and warns

The two subsystems can disagree on whether a piece is oversize, leading to incorrect (missing) join cost being billed.

---

## 4. Recommended Fixes (Prioritised)

### Phase 2 fixes — affect pricing accuracy for 20mm quoting (current live product)

**Fix A — Pass per-material slab dimensions to `calculateCutPlan` (Gap 5)**
- Priority: 🔴 Critical for pricing accuracy
- In `pricing-calculator-v2.ts`, pass `piece.materials.slab_length_mm` and `piece.materials.slab_width_mm` into a new overload of `calculateCutPlan` so it uses the actual material's slab size, not the category default
- Risk: Low — additive change to existing function signature

**Fix B — Narrow the grain matching surcharge scope (Gap 4)**
- Priority: 🟡 Medium — currently overcharges on non-grain-matched oversize pieces
- Add a `requiresGrainMatching: boolean` flag per piece (or per join strategy) and only apply the 15% surcharge when `true`
- For Phase 2, the simplest fix: only apply surcharge when `joinStrategy === 'LENGTHWISE'` (most likely scenario for visible-face grain matching), not for `WIDTHWISE` or `MULTI_JOIN`
- Risk: Low — narrowing the surcharge scope, not removing it

### Phase 3 fixes — needed for 40mm / waterfall quoting

**Fix C — Waterfall grain blocks in the optimiser (Gap 1)**
- Priority: 🔴 Critical for correct slab count on waterfall quotes
- The optimize API route must query `piece_relationships` (join `sourceRelationships` / `targetRelationships`) and pass relationship data to the optimiser
- The `OptimizationInput` type needs a `grainBlock?: string` field (or `mustCoPlaceWith?: string[]`) per piece — group ID ensures paired pieces attempt placement on the same slab
- The FFD main loop needs to handle grain blocks: when piece A is placed, attempt to place piece B (its waterfall pair) in the remaining space on the SAME slab before moving to a new slab
- Risk: Medium — requires FFD algorithm changes; must not break existing non-waterfall behaviour

**Fix D — Strip co-placement adjacency preference (Gap 2)**
- Priority: 🟡 Medium — affects cut layout accuracy, not slab count
- After placing a main piece, immediately attempt to place its associated strips on the same slab before sorting with the rest of the pack
- Simplest approach: inject strips into the sorted list immediately after their parent piece rather than sorting them independently by area
- Risk: Low — placement order change within the existing FFD

**Fix E — DB-configurable strip widths (Gap 3, Rule 22 compliance)**
- Priority: 🟡 Medium — Rule 22 violation; needed for multi-tenant correctness
- Create a `strip_configurations` DB table with columns: `id`, `company_id`, `edge_type_category` (e.g., `MITRE`, `STANDARD`, `WATERFALL`), `visible_width_mm`, `lamination_width_mm`, `kerf_loss_mm`
- Query at optimise time instead of reading `STRIP_CONFIGURATIONS` constant
- Risk: Low — additive schema change; must include migration

### Not needed (nice to have)

**Fix F — `canRotate` per piece**
- Storing and passing per-piece rotation constraints is architecturally correct but fabricators currently manage this through their own judgement. The global `allowRotation` flag is sufficient for Phase 2 and Phase 3.
- Revisit when fabricators report incorrect rotation of grain-directional pieces

**Fix G — `waterfall_height_mm` in optimiser**
- The `waterfall_height_mm` field on `quote_pieces` is already available if needed. The optimiser currently uses `piece.height` for strip dimensions, which is the full piece height. Passing `waterfall_height_mm` would allow the strip to match the visual waterfall height only. Low business priority for Phase 3.

---

## Definition of Done — Checklist

- [x] All 5 capability rows filled in with status and details
- [x] All input data rows filled in (8 rows including material/slab)
- [x] Gap analysis written (5 gaps identified)
- [x] Fixes prioritised by phase

---

## Files Examined

| File | Purpose |
|------|---------|
| `src/lib/services/slab-optimizer.ts` | Core FFD bin-packing algorithm; strip generation; oversize splitting |
| `src/lib/services/multi-material-optimizer.ts` | Per-material FFD orchestration; oversize piece detection |
| `src/lib/services/multi-slab-calculator.ts` | `calculateCutPlan()` — standalone oversize/join length calculator used by pricing |
| `src/lib/services/pricing-calculator-v2.ts` | Join cost + grain matching surcharge billing |
| `src/app/api/quotes/[id]/optimize/route.ts` | API endpoint — fetches pieces from DB, calls optimiser, saves result |
| `src/types/slab-optimization.ts` | `OptimizationInput`, `OptimizationResult`, `LaminationSummary` type definitions |
| `src/lib/services/analysis-to-optimizer-adapter.ts` | Elevation-analysis-to-optimiser bridge (drawing upload path) |
| `src/lib/constants/slab-sizes.ts` | `STRIP_CONFIGURATIONS` constant (hardcoded strip widths) |
| `prisma/schema.prisma` | `quote_pieces`, `piece_relationships`, `pricing_settings` models |
