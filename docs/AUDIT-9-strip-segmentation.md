# AUDIT-9: Strip Segmentation for Oversize Pieces

> **Date:** March 1, 2026
> **Scope:** Read only — `slab-optimizer.ts` strip generation + oversize splitting interaction
> **Branch:** audit/strip-segmentation
> **Version:** 1.0

---

## AUDIT-9 FINDINGS

### Strip Generation Order

**AFTER oversize splitting — but the strips use pre-split piece dimensions. THIS IS THE BUG.**

Evidence (line numbers from `src/lib/services/slab-optimizer.ts`):

| Step | What | Lines | Notes |
|------|------|-------|-------|
| Step 1 | Decompose L/U shapes + generate shape strips | 372–443 | L/U strips generated here BEFORE decomposition. Rectangle pieces pass through unchanged. |
| Step 1.5 | `preprocessOversizePieces()` — split oversize pieces | 449–455 | Operates on `decomposedPieces`. Splits oversize rectangles into segments. |
| Step 2 | `generateLaminationStrips()` for rectangle pieces | 468–484 | Iterates `normalizedPieces` (post-split). Generates strips using `piece.width` and `piece.height`. |

**Critical finding:** Step 2 generates strips for each piece in `normalizedPieces`. For oversize-split segments, these pieces have **segment dimensions** (e.g. 2471mm, 2470mm), NOT the original full length (4941mm). This means **strips ARE generated at segment size, not full size**.

However, there is a subtlety:

- `preprocessOversizePieces()` at line 329–331 **clears** `finishedEdges` and `edgeTypeNames` on segments:
  ```typescript
  finishedEdges: undefined,
  edgeTypeNames: undefined,
  ```
- `generateLaminationStrips()` at line 84–87 checks `piece.thickness` only (not `finishedEdges`), and at line 91 reads `piece.edgeTypeNames` (which is `undefined` for segments).
- Since `edgeTypeNames` is undefined on segments, all strips get the default width (60mm).
- The `noStripEdges` check at line 91 reads `piece.noStripEdges` — but segments don't inherit `noStripEdges` from their parent (line 322–337 doesn't copy it). So **all 4 edges get strips on every segment**, even wall edges.

**Conclusion:** Strips ARE generated at segment dimensions (correct size), but:
1. Wall edge exclusions (`noStripEdges`) are lost during splitting
2. Edge type names are lost (all strips get default 60mm width, mitre info lost)
3. Strip IDs use segment IDs as parent (e.g. `{pieceId}-seg-0-lam-top`), breaking `findSlabForStrip()` lookup in PartsSection which searches by original `piece.id`

### Strip Dimension Source

For rectangle pieces (`generateLaminationStrips`, lines 99–126):

```typescript
const rectEdgeLengths: Record<string, { lengthMm: number; isWidth: boolean }> = {
  top:    { lengthMm: piece.width, isWidth: true },    // piece.width = optimizer width
  bottom: { lengthMm: piece.width, isWidth: true },
  left:   { lengthMm: piece.height, isWidth: false },  // piece.height = optimizer height
  right:  { lengthMm: piece.height, isWidth: false },
};
```

- `piece.width` = optimizer coordinate (maps to piece `length_mm`)
- `piece.height` = optimizer coordinate (maps to piece `width_mm`)
- For segments: these are the **segment** dimensions, not the original piece dimensions

### The Bug Location

**C) Both — optimizer generates strips with wrong metadata, display layer can't find them.**

**Optimizer issues (slab-optimizer.ts):**
1. **Lines 322–337 (`preprocessOversizePieces`):** Segments don't inherit `noStripEdges` from parent → wall edges get unwanted strips
2. **Lines 329–331:** `edgeTypeNames` cleared → mitre strip width info lost, all strips get 60mm default
3. **Lines 115–116:** Strip `parentPieceId` set to `piece.id` which for segments is `{originalId}-seg-{N}` → PartsSection can't find these strips by original piece ID

**Display issues (PartsSection.tsx):**
4. **Lines 133–146 (`findSlabForStrip`):** Searches by `pl.parentPieceId === String(pieceId)` where `pieceId` is the original piece DB ID. But segment strips have `parentPieceId = "{pieceId}-seg-0"`, so they never match.
5. **Lines 314–317:** `laminationSummary.stripsByParent` is searched by `sp.parentPieceId === String(piece.id)`. Segment strips are grouped under segment IDs, not original piece IDs, so they don't appear in the summary path.
6. **Lines 340–391 (fallback path):** When optimizer summary doesn't match, the fallback derives strips from the original piece dimensions (full length 4941mm), not segment dimensions. This shows incorrect strip sizes in the parts list.

### Affected Strips

For a piece split along its length (e.g., Main Kitchen Benchtop 4941×600mm, split at ~2471+2470):

| Strip | Dimension | Spans split axis? | Status |
|-------|-----------|-------------------|--------|
| Top | Runs along length (4941mm) | YES — must be split into 2471mm + 2470mm segments | Bug: optimizer generates 2 top strips (one per segment) but display can't find them |
| Bottom | Runs along length (4941mm) | YES — must be split | Same as Top |
| Left | Runs along width (600mm) | NO — fits on one slab | Bug: generated for BOTH segments instead of once; display falls back to full-length |
| Right | Runs along width (600mm) | NO — fits on one slab | Same as Left |

**Net effect:**
- Optimizer generates 8 strips (4 per segment × 2 segments) instead of the correct count
- Left/Right strips are duplicated (should be 1 each, not 2)
- Top/Bottom strips are correctly sized per-segment but unfindable by display
- Display falls back to showing 4 strips at original piece dimensions

### Proposed Fix Location

The fix requires changes in **two files**:

**1. `src/lib/services/slab-optimizer.ts` — `preprocessOversizePieces()` (lines 254–345)**

- Segments must inherit `noStripEdges` from parent piece
- Segments must inherit `edgeTypeNames` from parent piece (possibly adjusted per-segment)
- Segment strip `parentPieceId` should reference the ORIGINAL piece ID, not the segment ID, OR the display layer must be updated to handle segment-parented strips

**Alternative approach:** Generate strips for oversize pieces BEFORE splitting, then split the affected strips alongside the piece. This would require a new function between Steps 1.5 and 2.

**2. `src/components/quotes/PartsSection.tsx` — `findSlabForStrip()` (lines 133–146) and `derivePartsForPiece()` (lines 189–486)**

- `findSlabForStrip` must handle segment-parented strips (search by `{pieceId}-seg-*` patterns)
- OR: the oversize section (lines 254–294) must emit strip rows for each segment, not rely on the global strip logic
- `laminationSummary` lookup (line 315–317) must aggregate strips across all segments of a piece

### Fields Available at Fix Point

**In `preprocessOversizePieces()` (line 322):**
- `piece` — full original piece with all fields (`noStripEdges`, `edgeTypeNames`, `thickness`, `id`, etc.)
- `piece.width`, `piece.height` — original full dimensions
- `thisWidth`, `thisHeight` — computed segment dimensions
- `segmentIndex`, `totalSegments` — position in split sequence
- `wSegments`, `hSegments` — how many segments in each axis
- `slabWidth`, `slabHeight` — slab constraints
- `kerfWidth` — kerf

**In `optimizeSlabs()` Step 2 (line 469):**
- `normalizedPieces` — array of all pieces post-split (segments + non-oversize)
- `piece.isSegment`, `piece.parentPieceId`, `piece.segmentIndex` — segment metadata
- `kerfWidth`, `mitreKerfWidth` — kerf values

**In `derivePartsForPiece()` PartsSection (line 189):**
- `piece` — original DB piece with full dimensions
- `breakdown?.oversize` — pricing calculator's oversize data
- `placements` — all optimizer placements (segments + strips)
- `laminationSummary` — strip summary grouped by parentPieceId

### Do Not Touch

AUDIT-6 Do Not Touch list still applies. Additions:

| Do Not Touch | Reason |
|-------------|--------|
| `generateShapeStrips()` (lines 139–184) | L/U strip generation is correct and unrelated to oversize splitting |
| `generateLaminationSummary()` (lines 189–244) | Works correctly for non-oversize pieces; fix should be in input data, not summary logic |
| `placePiece()` (lines 769–808) | Placement recording is correct |
| L/U decomposition block (lines 372–443) | L/U shapes have their own strip generation path |
| FFD sorting and placement loop (lines 494–667) | Bin-packing algorithm is correct |
| `PartsSection.tsx` waterfall/cutout logic (lines 396–452) | Unrelated to strip segmentation |

### Estimated Fix Complexity

**Medium — Two coordinated changes:**

1. **Optimizer (slab-optimizer.ts):** Propagate `noStripEdges` and `edgeTypeNames` from parent to segments in `preprocessOversizePieces()`. Ensure only edge-appropriate strips are generated per segment (top/bottom strips only on segments, not left/right duplicates). ~20 lines changed.

2. **Display (PartsSection.tsx):** Update `findSlabForStrip()` to search across segment-parented strips. Update the oversize section of `derivePartsForPiece()` to emit per-segment strips instead of falling back to full-length strips. ~30 lines changed.

**Recommended approach:** Generate strips AFTER splitting (current architecture), but:
- Propagate `noStripEdges` and `edgeTypeNames` to segments
- Add logic to determine which edges of a segment need strips (only outer edges, not join faces between segments)
- Update PartsSection to aggregate segment strips under the parent piece

This is a **targeted function modification**, not an architectural change.

---

## Question-by-Question Detail

### Q1: Strip generation order

Strips are generated in Step 2 (lines 468–484), which iterates `normalizedPieces` — the output of `preprocessOversizePieces()` (Step 1.5, lines 449–455). So strips are generated AFTER oversize splitting. The pieces in the loop already have segment dimensions. However, segments have `finishedEdges: undefined` and `edgeTypeNames: undefined`, and don't inherit `noStripEdges`.

### Q2: Rectangle strip generation code (lines 79–128)

`generateLaminationStrips()` uses `piece.width` and `piece.height` directly for strip dimensions. For segments, these are segment-sized (correct). But `piece.noStripEdges` is missing (segments don't inherit it), and `piece.edgeTypeNames` is undefined (segments have it cleared at line 331).

### Q3: Oversize splitting code (lines 254–345)

A segment placement object:
```typescript
{
  id: `${piece.id}-seg-${segmentIndex}`,
  width: thisWidth,           // segment dimension
  height: thisHeight,         // segment dimension
  label: `${piece.label} (Part ${segmentIndex + 1}/${totalSegments})`,
  canRotate: piece.canRotate,
  thickness: piece.thickness,
  finishedEdges: undefined,   // ← CLEARED
  edgeTypeNames: undefined,   // ← CLEARED
  isSegment: true,
  parentPieceId: piece.id,    // ← original piece ID
  segmentIndex,
  totalSegments,
}
```

Missing fields: `noStripEdges`, `edgeTypeNames`, `shapeType`, `shapeConfig`, `grainMatched`, `shapeConfigEdges`.

### Q4: optimizeSlabs() call sequence (lines 350–730)

1. **Step 1 (line 372):** Decompose L/U shapes + generate shape strips
2. **Step 1.5 (line 449):** `preprocessOversizePieces()` — split oversize pieces into segments
3. **Step 2 (line 468):** Generate lamination strips for all 40mm+ pieces (rectangle path)
4. **Step 2.5 (line 484):** Add pre-generated L/U shape strips
5. **Sort (line 494):** Sort all pieces by area (FFD)
6. **FFD loop (line 523):** Place pieces on slabs
7. **Results (line 680):** Calculate slab results + lamination summary

### Q5: Strip-parent piece association

Strips know their parent via `parentPieceId` (line 122). For normal pieces, this is the original piece ID. For oversize segments, the segment's `parentPieceId` is the original piece ID (line 334), BUT the strip's `parentPieceId` is the SEGMENT's ID (e.g., `{pieceId}-seg-0`), because `generateLaminationStrips()` uses `piece.id` (line 116) — and for a segment, `piece.id` = `{originalId}-seg-{N}`.

There is NO existing segment-aware strip logic. The comment at line 329 acknowledges this: `"Clear finishedEdges on segments — lamination for split pieces needs manual review"`.

### Q6: Affected vs unaffected strips

For Main Kitchen Benchtop (4941×600mm, split at ~2471+2470):
- **Top strip (4941mm long):** Spans split axis → MUST be split. Currently: two 2471mm and 2470mm top strips generated (one per segment) — correct size but unfindable by display.
- **Bottom strip (4941mm long):** Same as Top.
- **Left strip (600mm tall):** Does NOT span split axis → fits on one slab. Currently: TWO left strips generated (one per segment) — duplicate.
- **Right strip (600mm tall):** Same as Left — duplicate.

### Q7: findSlabForStrip lookup

`findSlabForStrip()` (PartsSection.tsx lines 133–146) searches placements by:
```typescript
pl.parentPieceId === String(pieceId) && pl.isLaminationStrip && pl.stripPosition === position
```

For a strip on segment 0, the placement has `parentPieceId = "{pieceId}-seg-0"`. The search uses `String(piece.id)` = the raw DB ID (e.g., `"183"`). These DON'T match → strip shows "—".

For Left/Right strips on non-oversize pieces, `parentPieceId` matches directly → shows "Slab N". This explains why short strips get slab assignments but long strips show "—".

### Q8: Optimizer behaviour confirmation

The optimizer DOES generate per-segment strips (verified from Step 2 code path). The line at 279 even has a guard: `if (piece.isLaminationStrip) { warnings.push(...skipped); continue; }` — oversize lamination strips are explicitly skipped by the oversize splitter.

The bug is NOT that strips are generated at full length. The bug is a **three-part data propagation failure**:
1. Segments don't inherit `noStripEdges` → duplicate strips on non-split edges
2. Segments don't inherit `edgeTypeNames` → wrong strip widths for mitre edges
3. Segment strip `parentPieceId` = segment ID, not original piece ID → display layer can't find them

---

## Summary

This is a **data propagation bug**, not an architectural flaw. The code structure is sound (generate strips after splitting), but the `preprocessOversizePieces()` function strips too much metadata from segments, and the display layer doesn't account for the segment-level parentage of strips.

**Estimated fix: ~50 lines across 2 files. No architectural change needed.**
