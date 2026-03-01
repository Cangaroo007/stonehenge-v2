# AUDIT-6 — Optimizer Architecture Comprehensive Audit

> **Date:** 2026-02-28
> **Branch:** claude/audit-optimizer-architecture-l0Umh
> **Status:** READ ONLY — No code changes

---

## === EDGE ALLOWANCE ===

**Formula:** `usableWidth = slabWidth - (edgeAllowanceMm × 2)` — `slab-optimizer.ts:354`

**N = 2** (applied per side, both sides)

**Configured allowance:** Resolved at runtime via the fallback chain in `route.ts:245-256`:
1. Quote-level override: `quotes.slabEdgeAllowanceMm` (`prisma/schema.prisma:650`)
2. Tenant default: `pricing_settings.slab_edge_allowance_mm` (`prisma/schema.prisma:477`)
3. Hardcoded fallback: `0`

**Source of 3000×1400:** This is **NOT from edge allowance at all**. It is the **material's slab dimension stored in the DB**. The seed files (`prisma/seed-production.js:196-197` and `prisma/seed-material-slab-prices.ts:10-11`) hard-code:
```js
const SLAB_LENGTH_MM = 3000;
const SLAB_WIDTH_MM = 1400;
```

These are then written to `materials.slab_length_mm = 3000` and `materials.slab_width_mm = 1400` for ALL materials including Alpha Zero.

**Root cause:** The seed data uses **incorrect slab dimensions**. Alpha Zero (Caesarstone) jumbo slabs are 3200×1600mm, but the seed stores 3000×1400mm. The optimizer's slab dimension resolution chain (`route.ts:269-276`) picks up the material record's dimensions first:
```ts
const slabWidth = body.slabWidth
  ?? primaryMaterial?.slab_length_mm    // ← gets 3000 from DB
  ?? getDefaultSlabLength(...)          // ← would be 3200 but never reached
  ?? 3200;                              // ← ultimate fallback, never reached
```

**With correct DB values (3200×1600) and correct allowance (20mm per side):**
- usable = 3200 - (20 × 2) = 3160mm × 1600 - (20 × 2) = 1560mm

**Leg A (3200mm) fits on 3160mm usable:** **NO** — 3200mm > 3160mm. Leg A would still be oversize by 40mm and require a join. This is physically correct — a 3200mm piece cannot fit on a 3200mm slab with 20mm edge waste per side.

**Note on edge allowance in SLAB_SIZES constants:** `src/lib/constants/slab-sizes.ts:7-11` correctly defines `ENGINEERED_QUARTZ_JUMBO: { lengthMm: 3200, widthMm: 1600 }`. These constants are correct but never reached because the material DB record provides dimensions first.

---

## === 0×0MM PHANTOM ===

**Optimizer code analysis:** The original L-shape piece is **correctly excluded** from the pipeline.

At `slab-optimizer.ts:378-443`:
- When `decomposeShapeIntoRects()` returns >1 rect (line 415: `if (rects.length <= 1)`), the original piece is NOT pushed to `decomposedPieces`
- Only the decomposed parts (`{piece.id}-part-0`, `{piece.id}-part-1`) are pushed (lines 422-438)
- The original piece NEVER enters `normalizedPieces`, `allPieces`, or `sortedPieces`
- The original piece NEVER gets a `Placement` created for it

**Where "183 (0×0mm)" could appear in the UI:**

The phantom piece is **not in the optimizer's placement data**. The issue is most likely in the **piece listing area** of the `SlabResults.tsx:194` display:
```tsx
{p.label} ({p.width}×{p.height})
```

If a placement has width=0 and height=0, it would show as "label (0×0)". However, the optimizer never creates such a placement for the original L-shape piece.

**Most likely explanation:** The "0×0mm" display comes from the **PartsSection** or the **piece count invariant warning**, not the slab canvas. Alternatively, if the L-shape's `shapeConfig` is malformed at runtime (missing `leg1`/`leg2`), `decomposeShapeIntoRects` falls back to a single rect with the bounding-box dimensions (line 140: `return [{ width: piece.lengthMm, height: piece.widthMm, ... }]`), keeping the original piece with its full bounding-box size — NOT 0×0.

**Intentional placeholder:** No — no placeholder mechanism exists in the code.

**Passed to FFD:** No — the original L-shape piece is filtered out during decomposition.

**Causes "could not be placed":** No — the original piece is never submitted to FFD.

**Causes "-1 mismatch":** Possibly. The piece count invariant (`slab-optimizer.ts:701-716`) compares `placedMainPieces + unplacedPieces.length` against `normalizedPieces.filter(!isLaminationStrip).length`. When decomposition replaces 1 piece with 2 legs, `normalizedPieces` has `N+1` entries but `inputPieceCount` has `N`. The invariant uses `expectedCount = normalizedPieces.length` (not `inputPieceCount`), so the invariant itself should still balance. The -1 mismatch is more likely caused by oversize splitting creating segments that add to the placed count but aren't tracked correctly — needs runtime log verification.

**Fix:** If the phantom DOES appear at runtime, the root cause would be in the data path from DB → API route → optimizer. The piece's `shape_config` JSON must be verified. No code change needed in the optimizer itself.

---

## === PARTS MODEL ===

**Analysis of `derivePartsForPiece` in `PartsSection.tsx:167-475`:**

### Normal rectangle (e.g. Island Benchtop):
- **1 MAIN row** — correct (`PartsSection.tsx:276-287`)
- Plus lamination strip rows (1 per finished edge) — correct
- Plus cutout rows — correct

### Oversize rectangle (e.g. Main Kitchen Benchtop):
- **N OVERSIZE_HALF rows** (1 per segment) — **correct** (`PartsSection.tsx:223-275`)
- Strategy LENGTHWISE/WIDTHWISE splits piece into `joinCount + 1` segments
- Each segment has its own slab lookup via `findSlabForSegment(piece.id, seg, placements)` — correct
- Plus lamination strip rows — correct

### L-shape, no oversize legs (hypothetical):
- **2 MAIN rows** (Leg A, Leg B) — correct (`PartsSection.tsx:194-219`)
- Plus lamination strip rows grouped under parent legs — correct (`PartsSection.tsx:443-472`)

### L-shape with Leg A oversize (current Family Room):
- **2 MAIN rows** (Leg A, Leg B) — **WRONG, should be 3**
- The `derivePartsForPiece` code at lines 194-219 runs its OWN `decomposeShapeIntoRects` to get leg dimensions
- It creates 1 MAIN row per leg with the full leg dimensions
- It does NOT check whether any leg is oversize and needs further splitting into segments
- **Missing:** Leg A (3200×600) exceeds usable slab (3000mm) and is split into 2 segments by the optimizer, but PartsSection shows it as a single row

**Where expansion needs to happen:** `PartsSection.tsx:206-218` — after creating each leg's MAIN row, the code should check whether that leg was split into segments by the optimizer (by looking for placements with `parentPieceId === "{piece.id}-part-{li}"` and `isSegment === true`). If segments exist, replace the single MAIN row with one OVERSIZE_HALF row per segment.

**Correct parts list for Family Room (given current data — 3000×1400mm slabs):**

```
Leg A — Segment 1: ~1500×600×40mm — Slab 1
Leg A — Segment 2: ~1700×600×40mm — Slab 1 or 2
  ↳ Top strip:     3200×60×20mm   — Slab ?
  ↳ Left strip:     600×60×20mm   — Slab ?
Leg B:             2400×600×40mm   — Slab 1 or 2
  ↳ R_top strip:    600×60×20mm   — Slab ?
  ↳ Inner strip:   2600×60×20mm   — Slab ?
  ↳ R_btm strip:   1800×60×20mm   — Slab ?
  ↳ Bottom strip:  1800×60×20mm   — Slab ?
```

(Exact segment dimensions depend on the splitting algorithm — `Math.ceil(3200 / 2) = 1600` per segment for lengthwise split.)

---

## === SLAB LOOKUP TABLE ===

### Placement type → stored fields

| Placement Type         | pieceId                    | parentPieceId | isSegment | segmentIndex | groupId   | partIndex | partLabel | isLaminationStrip | stripPosition |
|------------------------|---------------------------|---------------|-----------|--------------|-----------|-----------|-----------|-------------------|---------------|
| Normal rectangle       | `"{dbId}"`                | undefined     | undefined | undefined    | undefined | undefined | undefined | undefined         | undefined     |
| Oversize segment       | `"{dbId}-seg-{N}"`        | `"{dbId}"`    | true      | N            | undefined | undefined | undefined | undefined         | undefined     |
| L/U decomposed leg     | `"{dbId}-part-{N}"`       | `"{dbId}"`    | undefined | undefined    | `"{dbId}"`| N         | "Leg A"   | undefined         | undefined     |
| Decomposed leg segment | `"{dbId}-part-{N}-seg-{M}"`| `"{dbId}-part-{N}"` | true | M       | undefined | undefined | undefined | undefined         | undefined     |
| Lam strip (rect)       | `"{dbId}-lam-{edge}"`     | `"{dbId}"`    | undefined | undefined    | undefined | undefined | undefined | true              | `"{edge}"`    |
| Lam strip (L/U shape)  | `"{dbId}-lam-{edge}"`     | `"{dbId}"`    | undefined | undefined    | undefined | undefined | undefined | true              | `"{edge}"`    |

### Lookup function × coverage

| Function                 | Matches on                                                           | Works for which types                     |
|--------------------------|----------------------------------------------------------------------|-------------------------------------------|
| `findSlabForPiece`       | `pieceId === String(dbId)` AND `!isLaminationStrip` AND `!isSegment` | Normal rectangle ONLY                     |
| `findSlabForSegment`     | `parentPieceId === String(dbId)` AND `isSegment` AND `segmentIndex`  | Oversize segment (rect only)              |
| `findSlabForDecomposedPart` | `pieceId === "{dbId}-part-{N}"` OR `groupId === String(dbId)` AND `partIndex` | L/U decomposed leg               |
| `findSlabForStrip`       | `parentPieceId === String(dbId)` AND `isLaminationStrip` AND `stripPosition` | Lam strip (rect AND L/U shape)    |

### Gaps — placement types with no working lookup function:

1. **Decomposed leg segment** (`"{dbId}-part-{N}-seg-{M}"`):
   - `findSlabForPiece` won't match (pieceId doesn't equal String(dbId))
   - `findSlabForSegment` won't match (parentPieceId is `"{dbId}-part-{N}"`, not `String(dbId)`)
   - `findSlabForDecomposedPart` won't match (pieceId is `"{dbId}-part-{N}-seg-{M}"`, not `"{dbId}-part-{N}"`)
   - **NO LOOKUP FUNCTION WORKS** for this type — slab shows "—"

2. **Lamination strips for oversize segment pieces** (if generated):
   - `findSlabForStrip` uses `parentPieceId === String(dbId)` but segment strip's parentPieceId would be `"{dbId}-seg-{N}"`, not `String(dbId)`
   - **PARTIAL GAP** — depends on whether strips are generated for segments

---

## === TOP STRIP "—" ===

**stripPosition stored:** For rectangle pieces: `"top"` (`slab-optimizer.ts:116`, edgeKey from the loop at line 107). For L-shape: `"top"` (from `getFinishableEdgeLengthsMm` key at `shapes.ts:368`).

**findSlabForStrip searches for:** `pl.parentPieceId === String(pieceId) && pl.stripPosition === position` (`PartsSection.tsx:140-146`).

For the "top" strip:
- Position searched: `"top"` (from `stripsByParent.strips[i].position`)
- parentPieceId matched against: `String(piece.id)` where piece.id is the DB integer ID

**Match analysis:** When the optimizer runs, the strip's `parentPieceId` is set to `piece.id` (a string like `"183"`). The lookup converts the DB integer ID to string: `String(183)` = `"183"`. **These should match.**

**Strip placement generated:** Yes — the optimizer generates a strip with `stripPosition: "top"` for both rectangle and L-shape pieces at `slab-optimizer.ts:116` and `slab-optimizer.ts:179` respectively.

**Root cause of "—":** There are three possible causes, any of which could be at play:

1. **The strip could not be placed by FFD** — if the slab is full, the strip goes into `unplacedPieces` and has no placement. `findSlabForStrip` returns null → "—".

2. **Multi-material path reconstruction issue** — In `OptimizationDisplay.tsx:550-572`, the `reconstructGroupLaminationSummary` function looks up the parent via `placements.find((p: any) => p.pieceId === parentId)`. For L-shape strips, `parentId` is the original piece ID (e.g., "183"), but the placements only contain the decomposed parts (`"183-part-0"`, `"183-part-1"`). The parent lookup fails → `parentLabel = "Unknown"`. However, this affects the label, not the slab lookup.

3. **Oversize piece strip parentPieceId mismatch** — If the piece is oversize, the original piece is replaced by segments with different IDs. But strips were generated from the original piece with `parentPieceId` pointing to the original. The strip placements DO exist and DO have the correct `parentPieceId`. This should work.

**Most likely root cause:** The strip was not placed by FFD (cause 1). With 3000×1400mm slabs and many pieces + strips, the slabs fill up. The top strip (the longest strip, spanning the full piece length) is most likely to be the one that can't fit. Check `unplacedPieces` in the optimizer result for a strip ID ending in `-lam-top`.

---

## === COST IN PARTS LIST ===

**Cost source:** The per-part cost comes from the `PiecePricingBreakdown` via `calcBreakdown` prop (`PartsSection.tsx:170`).

Specifically:
- **MAIN piece (non-oversize):** `breakdown.pieceTotal - laminationCost` (line 285)
- **OVERSIZE_HALF segments:** `fabricationCost / numberOfSegments` where `fabricationCost = pieceTotal - materialCost - installationCost` (lines 230-233)
- **L/U legs:** `fabricationCost / rects.length` (lines 204-205)
- **LAMINATION_STRIP:** Always `null` (lines 312, 341)
- **WATERFALL:** Always `null` (line 419)
- **CUTOUT:** Always `null` (line 435)

**Updates on material change:** The `calcBreakdown` is passed as a prop from the parent. It comes from the pricing calculator result. When material changes, the pricing calculator re-runs and produces a new `calcBreakdown`. The PartsSection re-renders with the updated breakdown via React's `useMemo` at line 525. **Yes, it updates on material change** — provided the parent triggers a re-calculation.

**Lines to remove for cost removal (Sean confirmed cost should be removed):**
1. Remove `cost` field from `Part` interface — `PartsSection.tsx:57`
2. Remove all `cost:` assignments — lines 215, 249, 263, 285, 286, 419, 435
3. Remove `laminationCost` calculation — lines 186-189
4. Remove cost-related calculations (fabricationCost, segmentCost, legCost) — lines 204-205, 230-233
5. Remove the Cost column header — `PartsSection.tsx:617`
6. Remove the Cost column cell — `PartsSection.tsx:670-672`
7. Remove the `formatCurrency` import (if no other usage) — `PartsSection.tsx:6`

---

## === LAMINATION SUMMARY UNKNOWN ===

**PROMPT-14 fix analysis:** The fix was implemented at `slab-optimizer.ts:210-221`:
```ts
if (!parent && parentId) {
  const intermediate = allPieces.find(p => p.id === parentId);
  if (intermediate?.parentPieceId) {
    parent = originalPieces.find(p => p.id === intermediate.parentPieceId);
  }
  if (!parent && intermediate) {
    parent = intermediate;
  }
}
```

**Working for rectangle pieces:** Yes — the primary lookup at line 210 (`originalPieces.find(p => p.id === parentId)`) succeeds because rect strips have `parentPieceId` = the original piece's ID, and `originalPieces` contains the original input pieces.

**Working for L/U shape strips:** Yes — L/U shape strips are generated with `parentPieceId: piece.id` (the original L-shape piece ID, e.g., "183"). `originalPieces` is set from the raw input (line 463: `Array.from(pieces as OptimizationPiece[])`), which includes the original L-shape piece. So `originalPieces.find(p => p.id === "183")` succeeds.

**Still showing "Unknown"?** Only in the **multi-material reconstruction path** at `OptimizationDisplay.tsx:561`:
```ts
const parent = placements.find((p: any) => p.pieceId === parentId);
```
This reconstructs the lamination summary from saved placements. For L-shape pieces, `parentId` = "183" (the original piece ID), but placements only contain decomposed parts ("183-part-0", "183-part-1") — the original "183" has no placement. So `parent` is `undefined` → `parentLabel = parent?.label ?? 'Unknown'` → **"Unknown"**.

**Root cause:** `reconstructGroupLaminationSummary` in `OptimizationDisplay.tsx:561` cannot find the parent because the parent piece's placement doesn't exist (it was decomposed). The fix needs to:
1. First try exact match: `placements.find(p => p.pieceId === parentId)` (existing)
2. Fallback: try finding a decomposed part: `placements.find(p => p.pieceId?.startsWith(parentId + '-part-'))` and strip the part suffix from the label
3. Or: use the lamination summary saved in the DB (at `data.laminationSummary`) instead of reconstructing from placements

---

## === ORDERED FIX LIST ===

1. **CRITICAL — Fix material slab dimensions in seed data** — `prisma/seed-production.js:196-197` and `prisma/seed-material-slab-prices.ts:10-11` — Risk: LOW (seed data only, re-run seed to fix). Change `SLAB_LENGTH_MM = 3000` → `3200` and `SLAB_WIDTH_MM = 1400` → `1600`. This is the root cause of all "usable 3000×1400" behaviour.

2. **CRITICAL — PartsSection: expand oversize L/U legs into segment rows** — `PartsSection.tsx:206-218` — Risk: MEDIUM. When a decomposed leg is oversize, the parts list must show one row per segment, not one row for the entire leg. Requires checking optimizer placements for segments of each leg.

3. **HIGH — Add lookup function for decomposed-leg segments** — `PartsSection.tsx` (new function or extend `findSlabForDecomposedPart`) — Risk: LOW. Decomposed leg segments (`{dbId}-part-{N}-seg-{M}`) have no working lookup. Need a `findSlabForDecomposedPartSegment` that matches on the compound ID pattern.

4. **HIGH — Fix reconstructGroupLaminationSummary parent lookup for L/U shapes** — `OptimizationDisplay.tsx:561` — Risk: LOW. Add fallback to find decomposed parts when original piece has no placement. This fixes "Unknown" in the lamination summary for L/U shapes in the multi-material path.

5. **MEDIUM — Remove cost column from parts list** — `PartsSection.tsx` (multiple lines) — Risk: LOW. Sean confirmed cost should be removed. Remove the `cost` field, all cost calculations, and the Cost table column.

6. **LOW — Verify top strip placement** — Runtime verification needed — Risk: N/A. Check optimizer logs/output for whether the top strip is in `unplacedPieces`. If it is, the "—" is correct behaviour (strip couldn't fit). If not, investigate the lookup path.

7. **LOW — Set correct edge allowance in pricing_settings** — DB/Admin UI — Risk: LOW. Ensure `pricing_settings.slab_edge_allowance_mm` is set to the correct value (e.g., 20mm for Caesarstone). Currently nullable with no default, falls back to 0.

---

## === DO NOT TOUCH ===

- **Optimizer decomposition logic** (`slab-optimizer.ts:372-443`): Correctly replaces L/U shapes with component rects. The original piece is NOT kept.
- **Optimizer oversize splitting** (`slab-optimizer.ts:254-345`): Correctly splits oversize pieces into segments. Handles the oversize check AFTER decomposition.
- **Optimizer FFD placement** (`slab-optimizer.ts:523-667`): Correct bin-packing with group constraints for L/U shape co-location.
- **Optimizer edge allowance** (`slab-optimizer.ts:353-355`): Formula is correct: `usable = slab - (allowance × 2)`.
- **Lamination strip generation** (`slab-optimizer.ts:79-184`): Correctly generates strips for all edges minus wall edges (noStripEdges).
- **generateLaminationSummary** (`slab-optimizer.ts:189-244`): PROMPT-14 fix is working correctly for the optimizer's own output. The bug is only in the client-side reconstruction path.
- **decomposeShapeIntoRects** (`shapes.ts:118-207`): Correctly produces 2 rects for L-shape, 3 for U-shape.
- **getFinishableEdgeLengthsMm** (`shapes.ts:357-398`): Correct edge-key mapping for L (6 edges) and U (8 edges).
- **findSlabForPiece** (`PartsSection.tsx:108-117`): Works for normal rectangles.
- **findSlabForSegment** (`PartsSection.tsx:119-132`): Works for rectangle oversize segments.
- **findSlabForStrip** (`PartsSection.tsx:134-147`): Works for all strip types.
- **L/U leg-to-edge grouping** (`PartsSection.tsx:86-99`): Correctly maps L-shape edges to legs.
