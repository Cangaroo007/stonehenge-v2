# AUDIT-10 FINDINGS

> **Date:** March 1, 2026
> **Branch:** audit/strip-oversize-splitting (read-only)
> **Scope:** Read only — no code changes
> **Audit version:** 1.0

---

## Problem A — Ghost Strips

### A-filter status

**Yes** — the ghost strip filter is present on main at `slab-optimizer.ts:193-200`.

The filter logic (line 193-200):
```typescript
const strips = allPieces.filter((p) =>
  p.isLaminationStrip === true &&
  !(p.parentPieceId &&
    allPieces.some(seg =>
      seg.isSegment && seg.parentPieceId === p.parentPieceId
    ) &&
    !p.id.includes('-seg-')
  )
);
```

This correctly excludes pre-split "ghost" strips — strips whose `parentPieceId` matches a piece that was split into segments, unless the strip itself is a per-segment strip (ID contains `-seg-`).

Commit `8aec506` ("fix: exclude pre-split ghost strips from laminationSummary (#294)") confirms the filter merged to main.

### A-data pipeline

| Question | Answer |
|----------|--------|
| Does PartsSection use GET (saved) or POST (fresh)? | **GET only.** `PartsSection.tsx:514` fetches `GET /api/quotes/${quoteId}/optimize` on mount. There is NO POST call in PartsSection. |
| Is laminationSummary saved to DB or regenerated on GET? | **Saved to DB.** The POST handler saves `laminationSummary` to the `slab_optimizations` record at `route.ts:490-498` (multi-material) and `route.ts:604` (single-material). The GET handler at `route.ts:175-180` returns the raw DB record — it does NOT regenerate `laminationSummary`. |
| Is there a re-run button? | **No dedicated re-run button in PartsSection.** The optimizer is triggered elsewhere (likely a "Run Optimiser" button in a different component or the Slab Visualiser). PartsSection only reads saved results via GET. It accepts an `optimiserRefreshKey` prop (line 75, 527) to re-fetch after external runs. |

### A-root cause

Ghost strips still appear in the parts list because **PartsSection reads the saved DB record via GET, and old records saved before the filter was added still contain the pre-fix `laminationSummary` with ghost strips** — the filter only runs during POST (fresh optimizer run) inside `generateLaminationSummary`, and the GET handler returns the DB record verbatim without regeneration.

### A-fix

**Re-run the optimizer (POST) for any quote that was last optimised before commit `8aec506`**, which will generate a fresh `laminationSummary` with the ghost strip filter applied and save it to the DB. Alternatively, add a migration script or a "Recalculate" button (see DF-1 in rulebook Rule 58) that triggers a fresh POST and overwrites the stale record.

---

## Problem B — Strip Oversize Splitting

### B-call order

The exact call sequence inside `optimizeSlabs()` (starting at line 449):

1. **Step 1 (line 471-542):** L/U shape decomposition + L/U shape strip generation (`generateShapeStrips`). Output: `decomposedPieces[]` and `shapeStrips[]`.
2. **Step 1.5 (line 544-555):** `preprocessOversizePieces(decomposedPieces, usableWidth, usableHeight, ...)`. Output: `normalizedPieces[]` (segments + surviving pieces) and `warnings[]`.
3. **Step 2 (line 568-597):** Rectangle strip generation loop. Iterates `normalizedPieces`, generates strips via `generateLaminationStrips()` for non-segment, non-decomposed pieces. Adds L/U `shapeStrips`. Output: `allPieces[]` (main pieces + all strips).
4. **FFD (line 636-779):** Sorts `allPieces` by area and runs First Fit Decreasing placement.

### B-strip exclusion

**Exact lines:** `slab-optimizer.ts:286-289`

```typescript
// Skip lamination strips that are somehow oversize (shouldn't happen)
if (piece.isLaminationStrip) {
  warnings.push(`Lamination strip "${piece.label}" exceeds slab dimensions — skipped`);
  continue;
}
```

**What happens after skip:** The strip is **dropped entirely** — it is not added to `processed[]` (line 268). It does not appear in `normalizedPieces`, does not enter `allPieces`, does not reach FFD, and does not appear in `laminationSummary`. The parts list shows "—" for its slab because the strip simply does not exist in the optimizer output.

**Critical finding:** This skip logic is wrong for the current architecture. Strips ARE passed into `preprocessOversizePieces` because:
- Step 2 (strip generation at line 568-594) runs AFTER `preprocessOversizePieces` (Step 1.5)
- Strips generated at Step 2 are added to `allPieces` which goes directly to FFD
- Strips are NOT passed through `preprocessOversizePieces`
- Therefore, the skip at line 286 **only fires for strips that were already in the input `pieces[]` array** — which should never happen

**However**, the real problem is different: oversize strips (4941mm, 3200mm, 4400mm) are generated at Step 2 with their full parent-piece dimension. When they reach FFD at line 643-653, they fail the fit check (`fitsNormal` and `fitsRotated` both false) and are added to `unplacedPieces[]`. They DO appear in `laminationSummary` (because `generateLaminationSummary` at line 799 reads from `allPieces`), but their slab lookup returns null/undefined, so PartsSection shows "—".

### B-fix location

**Inside `preprocessOversizePieces` is NOT the right place** — strips don't flow through it in the current architecture (they're generated after it runs at Step 2).

The fix should be **a new `splitOversizeStrips()` function** called between Step 2 (strip generation) and the FFD sort (line 607). This function would:
1. Iterate `allPieces` looking for strips where `width > usableWidth || height > usableHeight`
2. Split them into segment-sized strips matching their parent piece's segments
3. Replace the original strip with the split segments in `allPieces`

Alternatively, the fix could be applied **inside `generateLaminationStrips()`** — if the parent piece is oversize and has been split into segments, generate per-segment strips instead of one full-length strip. But this is already done for pieces that go through `preprocessOversizePieces` (lines 360-433). The gap is: **rectangle pieces that are NOT oversize but have oversize STRIPS** — this shouldn't happen because strip width is always the parent piece's edge length, and if the edge length exceeds the slab, the piece itself should be oversize.

**Root cause clarification:** The 4941mm, 3200mm, 4400mm strips come from oversize PARENT PIECES. These parent pieces DO go through `preprocessOversizePieces` and ARE correctly split into segments with per-segment strips (lines 360-433). The problem is that `generateLaminationStrips()` at Step 2 (line 592) **also generates full-length strips for these pieces** because the `decomposedPieceIds` set at line 574-578 is **built from an empty `allPieces` array** — it's constructed BEFORE the loop at line 580 populates `allPieces`.

**Bug at line 574-578:**
```typescript
const decomposedPieceIds = new Set(
  allPieces                    // <-- allPieces is EMPTY here!
    .filter(p => p.isSegment && p.parentPieceId)
    .map(p => p.parentPieceId as string)
);
```

This means `decomposedPieceIds` is always an empty Set, so the skip at line 587 (`decomposedPieceIds.has(piece.id)`) never fires, and full-length ghost strips are generated alongside the correct per-segment strips.

**The actual fix:** Move the `decomposedPieceIds` construction to AFTER the `normalizedPieces` loop, or build it from `normalizedPieces` instead of the empty `allPieces`:
```typescript
const decomposedPieceIds = new Set(
  normalizedPieces
    .filter(p => p.isSegment && p.parentPieceId)
    .map(p => p.parentPieceId as string)
);
```

### B-segment naming for strips

Current per-segment strip IDs (generated inside `preprocessOversizePieces` at lines 368-430):
```
${piece.id}-seg-${segmentIndex}-lam-${position}
```
Example: `"123-seg-0-lam-top"`, `"123-seg-1-lam-top"`

The ghost (full-length) strips generated at Step 2 via `generateLaminationStrips` use:
```
${piece.id}-lam-${position}
```
Example: `"123-lam-top"`

The ghost strip filter at line 199 (`!p.id.includes('-seg-')`) correctly distinguishes them — strips WITHOUT `-seg-` in their ID that share a `parentPieceId` with segments are excluded. **This filter works correctly IF the ghost strips are in `allPieces`.** The real fix is preventing ghost strip generation entirely by fixing the `decomposedPieceIds` bug.

### B-laminationSummary impact

After fixing `decomposedPieceIds`:
- Ghost (full-length) strips will no longer be generated at Step 2
- Only per-segment strips from `preprocessOversizePieces` will exist in `allPieces`
- The existing ghost strip filter at line 193-200 becomes a safety net (no strips to filter)
- `laminationSummary.stripsByParent` will correctly contain only per-segment strips grouped under the original piece's ID

**No changes needed to `generateLaminationSummary`** — it will work correctly once ghost strips stop being generated.

### B-partsSection impact

PartsSection at `derivePartsForPiece` (line 318-348) looks up strips via:
```typescript
const stripsByParent = laminationSummary?.stripsByParent?.find(
  (sp) => sp.parentPieceId === String(piece.id)
);
```

Per-segment strips have `parentPieceId` set to the original piece ID (line 374, 392, etc.), so they will correctly group under the parent piece in `stripsByParent`.

The `positionOccurrences` tracking at line 326-330 already handles multiple strips per position (e.g., two "top" strips from two segments). `findSlabForStrip` at line 345 uses the occurrence index to find the correct slab.

**PartsSection will automatically show split strip rows** once the optimizer output is correct. No changes needed to `derivePartsForPiece`.

### B-estimated fix complexity

| Metric | Value |
|--------|-------|
| Lines of code to change | ~3 lines (move `decomposedPieceIds` source from `allPieces` to `normalizedPieces`) |
| Files affected | 1 (`src/lib/services/slab-optimizer.ts`) |
| Stop gates | `npm run build`, `npx tsc --noEmit`, verify with a quote containing an oversize 40mm piece |
| Risk | Low — the fix narrows what goes into FFD (removes ghost strips). No structural changes. |

---

## Do Not Touch

### AUDIT-6 Do Not Touch list — still applies

All items from AUDIT-6 remain valid:

- Optimizer decomposition logic (`slab-optimizer.ts:471-542`)
- Optimizer oversize splitting (`slab-optimizer.ts:260-444`)
- Optimizer FFD placement (`slab-optimizer.ts:636-779`)
- Optimizer edge allowance formula (`slab-optimizer.ts:453-454`)
- Lamination strip generation (`slab-optimizer.ts` `generateLaminationStrips`)
- `generateLaminationSummary` (`slab-optimizer.ts:189-250`)
- `decomposeShapeIntoRects` (`shapes.ts`)
- `getFinishableEdgeLengthsMm` (`shapes.ts`)
- `findSlabForPiece`, `findSlabForSegment`, `findSlabForStrip` (`PartsSection.tsx`)
- L/U leg-to-edge grouping (`PartsSection.tsx`)

### AUDIT-9 — no separate file found

No `AUDIT-9` document exists in `docs/`. Confirmed via glob search.

### Additions for AUDIT-10

| File | Lines | Do Not Touch | Reason |
|------|-------|-------------|--------|
| `slab-optimizer.ts` | 189-250 | `generateLaminationSummary` ghost strip filter | Working correctly — filters pre-split strips. Safety net. |
| `slab-optimizer.ts` | 360-433 | Per-segment strip generation inside `preprocessOversizePieces` | Correctly generates position-aware strips per segment with end-cap logic. |
| `slab-optimizer.ts` | 596-597 | `shapeStrips` addition to `allPieces` | L/U shape strips added after rectangle strip loop — correct. |
| `PartsSection.tsx` | 318-348 | Strip rendering with `positionOccurrences` tracking | Already handles multiple strips per position for oversize pieces. |
| `route.ts` (optimize) | 175-180 | GET handler | Returns raw DB record. By design — no regeneration on GET. |
| `route.ts` (optimize) | 456-498, 587-607 | POST handler DB save (both paths) | Correctly persists `laminationSummary` alongside placements. |

---

## Summary

| Problem | Root Cause | Fix |
|---------|-----------|-----|
| **A: Ghost strips in parts list** | PartsSection reads stale DB record via GET. Old records saved before the ghost-filter commit contain pre-fix `laminationSummary`. The filter only runs during POST (fresh run). | Re-run optimizer for affected quotes, or add a "Recalculate" button (DF-1). |
| **B: Oversize strips show "—"** | `decomposedPieceIds` set built from empty `allPieces` array (line 574-578). Always empty, so `generateLaminationStrips` generates full-length ghost strips for oversize pieces. These ghost strips are too large for FFD and land in `unplacedPieces`. Per-segment strips from `preprocessOversizePieces` are correct but coexist with the ghosts. | Change `decomposedPieceIds` to build from `normalizedPieces` instead of empty `allPieces`. ~3 lines. |
