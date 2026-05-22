// apps/web/src/lib/edge-length-edit.ts
//
// Edge-length editing — given an edge and a desired new length in
// millimetres, compute where the END vertex needs to move so the edge
// reaches that length. The START vertex is anchored; the END vertex
// slides along the existing edge direction.
//
// For edges where the END vertex is shared with another edge (typical
// in L/U shapes) the adjacent edge's length naturally updates because
// it shares the same vertex. The dimension labels for adjacent edges
// recompute on the next render.
//
// `usePiece` consumes the result and dispatches `MOVE_VERTEX`, which
// goes through the geometry package's `moveVertex` (edge IDs preserved
// — the V2 regression contract).

import type { EdgeId, Piece, VertexId } from "@stonehenge-proto/geometry";

/** Minimum permitted edge length in millimetres. */
export const MIN_EDGE_LENGTH_MM = 10;
/** Maximum permitted edge length in millimetres. */
export const MAX_EDGE_LENGTH_MM = 20000;

export interface EdgeLengthEdit {
  readonly vertexId: VertexId;
  readonly newX: number;
  readonly newY: number;
}

/**
 * Round 18 (Fix 1) — pick the integer-mm point closest in distance to
 * `targetLen` from `(anchorX, anchorY)`, given a floating-point candidate
 * `(floatX, floatY)`. Used by both edge-length editing and the
 * "Square this corner" CTA to dodge the 1599-mm rounding regression.
 *
 * The bug it solves
 * ─────────────────
 * Rounding x and y independently via `Math.round` can land the integer
 * endpoint a sub-mm away from the requested distance. For a 45° edge
 * from (1000, 1000) requested 1600 mm, the float endpoint is
 * (2131.371, 2131.371) — naive rounding gives (2131, 2131), whose actual
 * distance from anchor is 1599.476 mm. `DimensionLabel` then displays
 * `Math.round(1599.476) = 1599`. The bug is angle-dependent (axis-
 * aligned, 30°, etc. happen to round correctly), which is why it only
 * surfaced during Sean's handoff testing.
 *
 * Conservative guard
 * ──────────────────
 * The naive `Math.round(x), Math.round(y)` is the right answer for the
 * vast majority of cases (axis-aligned edges, edges where the rounding
 * error happens to round back to the target mm). The helper only kicks
 * in when `Math.round(baseLen) !== Math.round(targetLen)` — i.e. when
 * the displayed length would visibly mismatch the requested length.
 * This preserves every existing test in `edge-length-edit.test.ts` while
 * fixing the angle-dependent failure mode.
 */
export function bestIntegerPointAtDistance(
  anchorX: number,
  anchorY: number,
  floatX: number,
  floatY: number,
  targetLen: number,
): { readonly x: number; readonly y: number } {
  const baseX = Math.round(floatX);
  const baseY = Math.round(floatY);
  const baseLen = Math.hypot(baseX - anchorX, baseY - anchorY);
  // Naive round already produces a display-correct length — keep it so
  // the snap-to-mm behaviour stays identical for the common case.
  if (Math.round(baseLen) === Math.round(targetLen)) {
    return { x: baseX, y: baseY };
  }
  // Otherwise scan the nine-point integer neighbourhood and pick the
  // candidate whose distance from the anchor is closest to targetLen.
  let bestX = baseX;
  let bestY = baseY;
  let bestErr = Math.abs(baseLen - targetLen);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      if (ox === 0 && oy === 0) continue;
      const cx = baseX + ox;
      const cy = baseY + oy;
      const len = Math.hypot(cx - anchorX, cy - anchorY);
      const err = Math.abs(len - targetLen);
      if (err < bestErr) {
        bestErr = err;
        bestX = cx;
        bestY = cy;
      }
    }
  }
  return { x: bestX, y: bestY };
}

/**
 * Computes the vertex move needed to set the edge identified by
 * `edgeId` to `newLengthMm`. Returns `null` when:
 *
 *   - `newLengthMm` is not a finite number
 *   - `newLengthMm` is outside [MIN_EDGE_LENGTH_MM, MAX_EDGE_LENGTH_MM]
 *   - `edgeId` does not exist on the piece
 *   - the edge has degenerate length (start == end) so direction is undefined
 *
 * The returned coordinates are integer-mm. For angled edges where naive
 * `Math.round` would land off-by-1mm in the displayed length (see
 * `bestIntegerPointAtDistance` for the failure mode), the helper picks
 * the best neighbouring integer pair instead.
 */
export function computeVertexMoveForEdgeLength(
  piece: Piece,
  edgeId: EdgeId,
  newLengthMm: number,
): EdgeLengthEdit | null {
  if (!Number.isFinite(newLengthMm)) return null;
  if (newLengthMm < MIN_EDGE_LENGTH_MM) return null;
  if (newLengthMm > MAX_EDGE_LENGTH_MM) return null;

  const edge = piece.edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const start = piece.vertices.find((v) => v.id === edge.start);
  const end = piece.vertices.find((v) => v.id === edge.end);
  if (!start || !end) return null;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const currentLengthMm = Math.hypot(dx, dy);
  if (currentLengthMm === 0) return null;

  const ux = dx / currentLengthMm;
  const uy = dy / currentLengthMm;
  const floatX = start.x + ux * newLengthMm;
  const floatY = start.y + uy * newLengthMm;

  const pt = bestIntegerPointAtDistance(
    start.x,
    start.y,
    floatX,
    floatY,
    newLengthMm,
  );

  return {
    vertexId: end.id,
    newX: pt.x,
    newY: pt.y,
  };
}
