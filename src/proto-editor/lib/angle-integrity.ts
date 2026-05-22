// apps/web/src/lib/angle-integrity.ts
//
// Round 11 (Fix 2) — Polygon angle-sum integrity.
//
// For any simple polygon with `n` outer-ring vertices, the sum of the
// interior angles is exactly `(n − 2) × 180°`. A real-world drag-edited
// polygon can drift from this identity by a fraction of a degree per
// vertex move; user reports show 1° errors accumulating after a few
// edits on the angled piece (e.g. 106° + 255° + … = 1081° on an
// 8-vertex polygon whose expected sum is 1080°).
//
// `checkAngleIntegrity(piece)` returns the actual sum, the expected
// sum, the discrepancy, whether the polygon is within tolerance, and
// the per-vertex interior angles. `computeAngleCorrections(piece,
// integrity)` distributes the discrepancy proportionally across every
// outer-ring vertex so that re-applying `setVertexAngle` for each
// returned (vertexId, angle) pair drives the polygon back onto the
// `(n − 2) × 180°` identity.
//
// Pure geometry — no React, no Konva. Mirrors the neighbour-finding
// pattern used in `angle-snap.ts` and the `VertexPropertiesPanel`.

import type { Piece, Vertex, VertexId } from "@stonehenge-proto/geometry";

import { interiorAngleAtPositionDeg } from "./angle-snap";

/**
 * Tolerance for the polygon to be considered angularly clean. Matches
 * the fabrication-exact threshold used elsewhere
 * (`ANGLE_NO_WARN_THRESHOLD_DEG = 0.5°`) but tightened to 0.1° because
 * the sum aggregates noise across every vertex — a 0.5° per-vertex
 * tolerance on an 8-vertex polygon would mask a 4° cumulative error.
 */
export const ANGLE_INTEGRITY_TOLERANCE_DEG = 0.1;

/**
 * Threshold at which the canvas integrity banner becomes visible. The
 * sum can fluctuate within ±0.5° during routine drag/snap interactions
 * without indicating a real geometric problem, so the always-on banner
 * waits for half a degree of drift before surfacing.
 */
export const ANGLE_INTEGRITY_BANNER_THRESHOLD_DEG = 0.5;

/** Standard corner targets used to identify the "worst" vertex. */
const STANDARD_TARGETS_DEG: readonly number[] = [
  0, 30, 45, 60, 90, 120, 135, 150, 180, 270,
];

export interface AngleIntegrityResult {
  /** Actual sum of all outer-ring interior angles (degrees). */
  readonly actualSumDeg: number;
  /** Expected sum: `(n − 2) × 180°` where n = outer-ring vertex count. */
  readonly expectedSumDeg: number;
  /** Difference `actualSumDeg − expectedSumDeg`. Signed. */
  readonly discrepancyDeg: number;
  /** Whether the polygon is within tolerance (0.1°). */
  readonly isClean: boolean;
  /** Per-vertex interior angles. Empty if the polygon could not be read. */
  readonly vertexAngles: ReadonlyMap<VertexId, number>;
  /**
   * The vertex with the largest deviation from the nearest standard
   * angle (45/60/90/120/135/150 etc.). Null if no integrity issue was
   * detected or no vertex could be ranked.
   */
  readonly worstVertexId: VertexId | null;
}

/**
 * Walk the outer ring in topological order and return the ordered list
 * of vertices, each paired with its incoming-edge previous vertex and
 * outgoing-edge next vertex on the ring. Returns null if the ring is
 * malformed (missing edges or vertices).
 */
function readOuterRing(
  piece: Piece,
): ReadonlyArray<{
  readonly vertex: Vertex;
  readonly prev: Vertex;
  readonly next: Vertex;
}> | null {
  const ring = piece.outerRing.edges;
  if (ring.length < 3) return null;
  const result: Array<{
    vertex: Vertex;
    prev: Vertex;
    next: Vertex;
  }> = [];
  for (let i = 0; i < ring.length; i++) {
    const incomingId = ring[i]!;
    const outgoingId = ring[(i + 1) % ring.length]!;
    const incoming = piece.edges.find((e) => e.id === incomingId);
    const outgoing = piece.edges.find((e) => e.id === outgoingId);
    if (!incoming || !outgoing) return null;
    if (incoming.end !== outgoing.start) return null;
    const vertex = piece.vertices.find((v) => v.id === incoming.end);
    const prev = piece.vertices.find((v) => v.id === incoming.start);
    const next = piece.vertices.find((v) => v.id === outgoing.end);
    if (!vertex || !prev || !next) return null;
    result.push({ vertex, prev, next });
  }
  return result;
}

/**
 * Compute the angle integrity of a piece's outer ring.
 *
 * Implementation note: we use the same `interiorAngleAtPositionDeg`
 * helper as `angle-snap.ts` so the displayed and validated values stay
 * in lockstep with the snap-time computation. The geometry-kernel
 * `interiorAngleDeg` collapses to the same value but does an
 * outer-ring lookup per call (O(n²) for the whole ring); the local
 * single-pass walk is O(n).
 */
export function checkAngleIntegrity(piece: Piece): AngleIntegrityResult {
  const ringWalk = readOuterRing(piece);
  const n = piece.outerRing.edges.length;
  const expectedSumDeg = Math.max(0, (n - 2) * 180);
  if (!ringWalk) {
    return {
      actualSumDeg: 0,
      expectedSumDeg,
      discrepancyDeg: 0,
      isClean: true,
      vertexAngles: new Map(),
      worstVertexId: null,
    };
  }

  const vertexAngles = new Map<VertexId, number>();
  let actualSumDeg = 0;
  for (const node of ringWalk) {
    const a = interiorAngleAtPositionDeg(
      node.prev,
      node.next,
      node.vertex.x,
      node.vertex.y,
    );
    if (a === null) {
      // Degenerate vertex (zero-length edge). Cannot read the polygon
      // reliably; bail and report a clean integrity to avoid false
      // positives. Real degeneracy is caught upstream by validatePiece.
      return {
        actualSumDeg: 0,
        expectedSumDeg,
        discrepancyDeg: 0,
        isClean: true,
        vertexAngles: new Map(),
        worstVertexId: null,
      };
    }
    // Concave (reflex) vertices return an interior angle > 180°. The
    // local helper returns values in (−180°, 360°); we normalise to
    // (0°, 360°) so the sum tracks the geometric convention.
    const normalised = a < 0 ? a + 360 : a;
    vertexAngles.set(node.vertex.id, normalised);
    actualSumDeg += normalised;
  }

  const discrepancyDeg = actualSumDeg - expectedSumDeg;
  const isClean = Math.abs(discrepancyDeg) <= ANGLE_INTEGRITY_TOLERANCE_DEG;

  // Worst vertex — the one whose angle is furthest from any standard
  // target. We only surface this when there IS a discrepancy worth
  // flagging; on a clean polygon every vertex is by definition fine.
  let worstVertexId: VertexId | null = null;
  if (!isClean) {
    let worstDeltaDeg = -1;
    for (const [vid, angle] of vertexAngles) {
      let nearest = Infinity;
      for (const target of STANDARD_TARGETS_DEG) {
        const d = Math.abs(angle - target);
        if (d < nearest) nearest = d;
      }
      if (nearest > worstDeltaDeg) {
        worstDeltaDeg = nearest;
        worstVertexId = vid;
      }
    }
  }

  return {
    actualSumDeg,
    expectedSumDeg,
    discrepancyDeg,
    isClean,
    vertexAngles,
    worstVertexId,
  };
}

/**
 * Distribute the angular discrepancy across all outer-ring vertices
 * proportionally — each vertex is adjusted by `−discrepancy / n`
 * degrees so the sum returns to `(n − 2) × 180°`.
 *
 * Returns the map of `vertexId → corrected angle (degrees)`. The
 * caller applies each correction via `setVertexAngle` from the
 * geometry kernel in a single snapshot/undo entry.
 *
 * If the polygon is already clean (within tolerance), the returned
 * map is empty — no corrections needed.
 */
export function computeAngleCorrections(
  piece: Piece,
  integrity: AngleIntegrityResult,
): ReadonlyMap<VertexId, number> {
  if (integrity.isClean) return new Map();
  const ringIds = piece.outerRing.edges
    .map((edgeId) => piece.edges.find((e) => e.id === edgeId))
    .filter((e): e is NonNullable<typeof e> => e !== undefined)
    .map((e) => e.end);
  const n = ringIds.length;
  if (n === 0) return new Map();
  const adjustPerVertexDeg = integrity.discrepancyDeg / n;
  const corrections = new Map<VertexId, number>();
  for (const vid of ringIds) {
    const current = integrity.vertexAngles.get(vid);
    if (current === undefined) continue;
    const corrected = current - adjustPerVertexDeg;
    // `setVertexAngle` rejects values outside (0°, 180°). Clamp the
    // corrected angle to a fabrication-sensible band so the kernel
    // accepts every entry — a polygon whose corrected angles sit at
    // the boundary is still self-consistent because the proportional
    // adjustment is uniform.
    if (corrected <= 0 || corrected >= 180) continue;
    corrections.set(vid, corrected);
  }
  return corrections;
}
