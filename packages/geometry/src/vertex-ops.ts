// packages/geometry/src/vertex-ops.ts
//
// Round-3A: vertex topology operations. Insertion + removal change the
// vertex/edge count of a piece, but the unaffected edges keep their IDs.
//
// Per Sean's UNCERTAIN-1 [A] call, `insertVertexOnEdge` is a thin wrapper
// over the existing `splitEdge` (edge-ops.ts:127). `splitEdge` already
// retires the parent edge, mints two new EdgeIds, propagates metadata, and
// rewrites rings. `insertVertexOnEdge`'s contribution is:
//   - projecting a free-form (x, y) point onto the target edge
//   - minting the new VertexId from `ids.ts`
//   - returning `null` instead of throwing on unknown edge
//
// `removeVertex` is symmetric: looks up the vertex's two adjacent edges in
// the ring and delegates to `mergeEdges`. The minimum-3-vertex guard is
// applied before delegation. Returns `null` if the vertex isn't found,
// isn't on the outer ring, or removing it would produce a degenerate piece.

import { mergeEdges, splitEdge } from "./edge-ops";
import { vertexId as mintVertexId } from "./ids";
import type { Edge, EdgeId, Piece, Vertex, VertexId } from "./types";
import { interiorAngleRad } from "./curve-ops";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

interface Pt {
  readonly x: number;
  readonly y: number;
}

function projectPointOntoSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: a.x, y: a.y };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  // Clamp to [0, 1] so we never produce a point beyond the edge endpoints.
  // We clamp slightly inside the endpoints to keep `splitEdge` from
  // creating zero-length sub-edges (which validation would still reject
  // but it's friendlier to round here).
  const tc = Math.min(1 - 1e-9, Math.max(1e-9, t));
  return { x: a.x + dx * tc, y: a.y + dy * tc };
}

function findEdgeRingNeighbours(
  piece: Piece,
  vertexId: VertexId,
): { incomingEdgeId: EdgeId; outgoingEdgeId: EdgeId; ringKind: "outer" } | null {
  // For Round 3A we only support vertex insertion/removal on the OUTER ring.
  // Inner-ring (hole) vertex ops are deferred — none of the round-3A
  // workflows require them.
  const ring = piece.outerRing.edges;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const eA = piece.edges.find((x) => x.id === a);
    const eB = piece.edges.find((x) => x.id === b);
    if (!eA || !eB) continue;
    if (eA.end === vertexId && eB.start === vertexId) {
      return { incomingEdgeId: a, outgoingEdgeId: b, ringKind: "outer" };
    }
  }
  return null;
}

function getOuterRingNeighbourVertices(
  piece: Piece,
  v: VertexId,
): { prev: Vertex; next: Vertex } | null {
  const link = findEdgeRingNeighbours(piece, v);
  if (!link) return null;
  const incoming = piece.edges.find((e) => e.id === link.incomingEdgeId);
  const outgoing = piece.edges.find((e) => e.id === link.outgoingEdgeId);
  if (!incoming || !outgoing) return null;
  const prev = piece.vertices.find((x) => x.id === incoming.start);
  const next = piece.vertices.find((x) => x.id === outgoing.end);
  if (!prev || !next) return null;
  return { prev, next };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new vertex on an existing edge, splitting it into two edges.
 *
 * The point is projected (and clamped) onto the target edge, then a new
 * VertexId is minted and `splitEdge` does the topology rewrite. Both
 * resulting edges inherit the parent's profile/finish/exposure/curve/
 * buildUp and are tagged `generatedBy: "split"`.
 *
 * Returns `null` if `edgeId` is not found in the piece.
 */
export function insertVertexOnEdge(
  piece: Piece,
  edgeId: EdgeId,
  pointMm: Pt,
): Piece | null {
  const edge = piece.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const start = piece.vertices.find((v) => v.id === edge.start);
  const end = piece.vertices.find((v) => v.id === edge.end);
  if (!start || !end) return null;

  const proj = projectPointOntoSegment(pointMm, start, end);
  const newVertex: Vertex = {
    id: mintVertexId(),
    x: Math.round(proj.x),
    y: Math.round(proj.y),
  };
  return splitEdge(piece, edgeId, newVertex);
}

/**
 * Insert a new vertex at the midpoint of an existing edge. Convenience
 * wrapper over `insertVertexOnEdge`.
 */
export function insertVertexAtMidpoint(
  piece: Piece,
  edgeId: EdgeId,
): Piece | null {
  const edge = piece.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const start = piece.vertices.find((v) => v.id === edge.start);
  const end = piece.vertices.find((v) => v.id === edge.end);
  if (!start || !end) return null;
  const mid: Pt = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return insertVertexOnEdge(piece, edgeId, mid);
}

/**
 * Remove a vertex from the outer ring. Adjacent edges merge into one,
 * inheriting the incoming edge's metadata (the existing `mergeEdges`
 * contract). Returns `null` if:
 *   - the vertex is not found
 *   - the vertex is not on the outer ring
 *   - removing it would leave fewer than 3 vertices on the outer ring
 */
export function removeVertex(piece: Piece, targetVertexId: VertexId): Piece | null {
  if (piece.outerRing.edges.length <= 3) return null;
  const link = findEdgeRingNeighbours(piece, targetVertexId);
  if (!link) return null;
  return mergeEdges(piece, link.incomingEdgeId, link.outgoingEdgeId);
}

/**
 * Interior angle at the named vertex, in degrees. Returns null if the
 * vertex is not on the outer ring.
 */
export function interiorAngleDeg(piece: Piece, targetVertexId: VertexId): number | null {
  const link = getOuterRingNeighbourVertices(piece, targetVertexId);
  if (!link) return null;
  const vertex = piece.vertices.find((v) => v.id === targetVertexId);
  if (!vertex) return null;
  const rad = interiorAngleRad(vertex, link.prev, link.next);
  return (rad * 180) / Math.PI;
}

/**
 * Move a vertex so the interior angle at it matches `targetAngleDeg`,
 * preserving the OUTGOING edge length |VB|. The incoming edge length
 * |VA| changes.
 *
 * Construction (law of sines on triangle AV'B):
 *   - Let A = prev, V = current vertex, B = next; we seek V'.
 *   - In the triangle AV'B: |AB| / sin(θ) = |V'B| / sin(∠V'AB)
 *     where θ is the desired angle at V'.
 *   - sin(∠V'AB) = |V'B|·sin(θ) / |AB| → returns null if > 1 (no
 *     valid triangle exists for that combination of side lengths and
 *     target angle).
 *   - ∠V'BA = π − θ − ∠V'AB
 *   - |V'A| = |AB|·sin(∠V'BA) / sin(θ)
 *   - V' = A + |V'A| · R(∠V'AB) · uAB, where the rotation sign is chosen
 *     so V' stays on the side of AB the original V was on (preserves
 *     ring orientation).
 *
 * Returns null if the vertex is not on the outer ring or the target angle
 * is outside (0, 180) degrees, or no valid triangle exists.
 */
export function setVertexAngle(
  piece: Piece,
  targetVertexId: VertexId,
  targetAngleDeg: number,
): Piece | null {
  if (targetAngleDeg <= 0 || targetAngleDeg >= 180) return null;
  const link = getOuterRingNeighbourVertices(piece, targetVertexId);
  if (!link) return null;
  const vertex = piece.vertices.find((v) => v.id === targetVertexId);
  if (!vertex) return null;
  const A = link.prev;
  const B = link.next;

  const outgoingLen = Math.hypot(vertex.x - B.x, vertex.y - B.y);
  if (outgoingLen === 0) return null;
  const lenAB = Math.hypot(B.x - A.x, B.y - A.y);
  if (lenAB === 0) return null;

  const theta = (targetAngleDeg * Math.PI) / 180;
  const sinAVB = (outgoingLen * Math.sin(theta)) / lenAB;
  if (sinAVB > 1) return null; // no valid triangle

  const angleVAB = Math.asin(sinAVB);
  const angleVBA = Math.PI - theta - angleVAB;
  if (angleVBA <= 0) return null;
  const lenVA = (lenAB * Math.sin(angleVBA)) / Math.sin(theta);

  // Direction from A toward B (unit vector).
  const uABx = (B.x - A.x) / lenAB;
  const uABy = (B.y - A.y) / lenAB;

  // Sign of rotation — keep V' on the same side of AB as the original V,
  // so the polygon orientation is preserved. Cross-product of AB and AV:
  // positive → V is on the left of A→B; the new direction must be rotated
  // CCW by `angleVAB`. negative → CW.
  const cross = (B.x - A.x) * (vertex.y - A.y) - (B.y - A.y) * (vertex.x - A.x);
  const sign = cross >= 0 ? 1 : -1;

  const cos = Math.cos(angleVAB);
  const sin = Math.sin(angleVAB) * sign;
  const dirX = uABx * cos - uABy * sin;
  const dirY = uABx * sin + uABy * cos;

  const newX = Math.round(A.x + lenVA * dirX);
  const newY = Math.round(A.y + lenVA * dirY);

  const nextVertices: Vertex[] = piece.vertices.map((v) => {
    if (v.id !== targetVertexId) return v;
    return { ...v, x: newX, y: newY };
  });
  return { ...piece, vertices: nextVertices };
}

/**
 * Set the corner radius on a vertex. Returns a new piece with the vertex's
 * `cornerRadiusMm` updated.
 *
 * `radiusMm <= 0` clears the field (sharp corner). Caller is responsible
 * for validating that the new radius fits within both adjacent edges
 * (use `isValidCornerRadius` from curve-ops or rely on `validatePiece`).
 */
export function setVertexCornerRadius(
  piece: Piece,
  targetVertexId: VertexId,
  radiusMm: number,
): Piece | null {
  const idx = piece.vertices.findIndex((v) => v.id === targetVertexId);
  if (idx === -1) return null;
  const cur = piece.vertices[idx]!;
  // Rebuild explicitly — conditional spread keeps exactOptionalPropertyTypes
  // happy (mitre and cornerRadiusMm must be either present-with-value or
  // fully absent).
  const next: Vertex = {
    id: cur.id,
    x: cur.x,
    y: cur.y,
    ...(cur.mitre !== undefined ? { mitre: cur.mitre } : {}),
    ...(radiusMm > 0 ? { cornerRadiusMm: radiusMm } : {}),
  };
  const nextVertices = piece.vertices.map((v, i) => (i === idx ? next : v));
  return { ...piece, vertices: nextVertices };
}

/**
 * Set or clear the curve descriptor on an edge — used by the editor's
 * "Round end" toggle.
 *
 * `curve === null` clears the field (straight edge). Otherwise the curve
 * is stored as-is. Validation is the caller's responsibility (typically
 * via `computeRoundEndCurve` from curve-ops).
 *
 * `exactOptionalPropertyTypes: true` requires us to construct the new
 * Edge without a `curve` field at all when clearing — `{ curve: undefined }`
 * is an error. We rebuild the object explicitly with conditional spread.
 */
export function setEdgeCurve(
  piece: Piece,
  targetEdgeId: EdgeId,
  curve: NonNullable<Edge["curve"]> | null,
): Piece | null {
  const idx = piece.edges.findIndex((e) => e.id === targetEdgeId);
  if (idx === -1) return null;
  const cur = piece.edges[idx]!;
  // Rebuild Edge explicitly so the `curve` field can be either present
  // (with a non-undefined value) or fully absent. Conditional spread
  // satisfies exactOptionalPropertyTypes.
  const next: Edge = {
    id: cur.id,
    start: cur.start,
    end: cur.end,
    profile: cur.profile,
    finish: cur.finish,
    exposure: cur.exposure,
    ...(curve !== null ? { curve } : {}),
    ...(cur.buildUp !== undefined ? { buildUp: cur.buildUp } : {}),
    ...(cur.generatedBy !== undefined ? { generatedBy: cur.generatedBy } : {}),
  };
  const nextEdges = piece.edges.map((e, i) => (i === idx ? next : e));
  return { ...piece, edges: nextEdges };
}
