// packages/geometry/src/validation.ts
//
// Invariant checks on the polygon primitive. Two flavours:
//
//   1. `validatePiece` — structural integrity (IDs resolve, rings chain,
//      vertices participate). Returns a list of human-readable error
//      messages so a caller can surface them.
//   2. `isSimplePolygon` — geometric integrity (no non-adjacent edge
//      intersection). Phase-1 implementation is O(n²) and treats curves as
//      straight chords.
//
// Plus `validateEdgeIdStability`, the contractual check used by the V2
// regression suite: given a piece before and after an edit, assert that a
// nominated set of edge IDs still exist with byte-identical metadata.

import { isValidCornerRadius } from "./curve-ops";
import type { Edge, EdgeId, Piece, Ring, Vertex, VertexId } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// validatePiece
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function checkRingChain(
  ring: Ring,
  edgesById: Map<EdgeId, Edge>,
  ringLabel: string,
  errors: string[],
): void {
  if (ring.edges.length === 0) {
    errors.push(`${ringLabel}: ring has zero edges`);
    return;
  }
  const resolved: Edge[] = [];
  for (const id of ring.edges) {
    const e = edgesById.get(id);
    if (!e) {
      errors.push(`${ringLabel}: unknown edge id ${String(id)}`);
      return;
    }
    resolved.push(e);
  }
  for (let i = 0; i < resolved.length; i++) {
    const a = resolved[i]!;
    const b = resolved[(i + 1) % resolved.length]!;
    if (a.end !== b.start) {
      errors.push(
        `${ringLabel}: edges ${String(a.id)} and ${String(b.id)} do not chain (a.end !== b.start)`,
      );
    }
  }
}

export function validatePiece(piece: Piece): ValidationResult {
  const errors: string[] = [];

  // Duplicate vertex IDs.
  const vertexIds = new Set<string>();
  for (const v of piece.vertices) {
    if (vertexIds.has(v.id)) {
      errors.push(`duplicate vertex id ${String(v.id)}`);
    }
    vertexIds.add(v.id);
  }

  // Duplicate edge IDs.
  const edgesById = new Map<EdgeId, Edge>();
  for (const e of piece.edges) {
    if (edgesById.has(e.id)) {
      errors.push(`duplicate edge id ${String(e.id)}`);
    }
    edgesById.set(e.id, e);
  }

  // Edge endpoints reference known vertices.
  for (const e of piece.edges) {
    if (!vertexIds.has(e.start)) {
      errors.push(
        `edge ${String(e.id)} references unknown start vertex ${String(e.start)}`,
      );
    }
    if (!vertexIds.has(e.end)) {
      errors.push(
        `edge ${String(e.id)} references unknown end vertex ${String(e.end)}`,
      );
    }
  }

  // Ring chains.
  checkRingChain(piece.outerRing, edgesById, "outerRing", errors);
  for (let i = 0; i < piece.innerRings.length; i++) {
    checkRingChain(
      piece.innerRings[i]!,
      edgesById,
      `innerRings[${i}]`,
      errors,
    );
  }

  // Edge-count contract: the count of edges in piece.edges must equal the
  // sum of edges across outerRing + innerRings, since every edge belongs to
  // exactly one ring in the prototype.
  const ringEdgeCount =
    piece.outerRing.edges.length +
    piece.innerRings.reduce((acc, r) => acc + r.edges.length, 0);
  if (ringEdgeCount !== piece.edges.length) {
    errors.push(
      `edge count mismatch: piece.edges=${piece.edges.length} rings=${ringEdgeCount}`,
    );
  }

  // Every vertex must appear in at least one edge.
  const usedVertexIds = new Set<string>();
  for (const e of piece.edges) {
    usedVertexIds.add(e.start);
    usedVertexIds.add(e.end);
  }
  for (const v of piece.vertices) {
    if (!usedVertexIds.has(v.id)) {
      errors.push(`vertex ${String(v.id)} is not referenced by any edge`);
    }
  }

  // Round-3A: corner-radius validity. A corner radius is valid iff the
  // tangent length (radius / tan(θ/2)) fits within both adjacent edges.
  // The check needs ring context, so we only validate vertices on the
  // outer ring (inner-ring rounded corners are deferred).
  if (errors.length === 0) {
    for (const v of piece.vertices) {
      const r = v.cornerRadiusMm;
      if (r === undefined || r <= 0) continue;
      const link = outerRingNeighbours(piece, v.id);
      if (!link) continue; // not on outer ring (e.g. inner ring or stale)
      if (!isValidCornerRadius(v, link.prev, link.next, r)) {
        errors.push(
          `vertex ${String(v.id)} corner radius ${r} mm is too large for its adjacent edges`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Locate a vertex's prev/next neighbours on the outer ring. Returns null
 * if the vertex is not on the outer ring or the ring is malformed.
 */
function outerRingNeighbours(
  piece: Piece,
  vertexId: VertexId,
): { readonly prev: Vertex; readonly next: Vertex } | null {
  const ring = piece.outerRing.edges;
  for (let i = 0; i < ring.length; i++) {
    const incomingId = ring[i]!;
    const outgoingId = ring[(i + 1) % ring.length]!;
    const incoming = piece.edges.find((e) => e.id === incomingId);
    const outgoing = piece.edges.find((e) => e.id === outgoingId);
    if (!incoming || !outgoing) continue;
    if (incoming.end === vertexId && outgoing.start === vertexId) {
      const prev = piece.vertices.find((x) => x.id === incoming.start);
      const next = piece.vertices.find((x) => x.id === outgoing.end);
      if (prev && next) return { prev, next };
      return null;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// isSimplePolygon — straight-chord, non-adjacent intersection check
// ─────────────────────────────────────────────────────────────────────────────

interface Pt {
  readonly x: number;
  readonly y: number;
}

/**
 * Standard segment-segment intersection (exclusive of endpoints sharing).
 * Returns true if segments AB and CD properly cross.
 */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  // Collinear overlap cases are not treated as crossings here; for the
  // prototype we deliberately keep the check conservative.
  return false;
}

function orient(p: Pt, q: Pt, r: Pt): number {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

export function isSimplePolygon(piece: Piece): boolean {
  const verticesById = new Map(piece.vertices.map((v) => [v.id, v as Pt]));
  const edgesById = new Map(piece.edges.map((e) => [e.id, e]));

  const segments: Array<{ a: Pt; b: Pt; id: EdgeId }> = [];
  for (const id of piece.outerRing.edges) {
    const e = edgesById.get(id);
    if (!e) return false;
    const a = verticesById.get(e.start);
    const b = verticesById.get(e.end);
    if (!a || !b) return false;
    segments.push({ a, b, id });
  }
  const n = segments.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges (they share a vertex by construction).
      if (j === i + 1) continue;
      if (i === 0 && j === n - 1) continue;
      const s1 = segments[i]!;
      const s2 = segments[j]!;
      if (segmentsCross(s1.a, s1.b, s2.a, s2.b)) return false;
    }
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// validateEdgeIdStability — the V2 regression contract
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Asserts that every edge ID listed in `unchangedEdgeIds` exists in both
 * `before` and `after`, and that `profile`, `finish`, `exposure`, `curve`,
 * and `buildUp` are byte-identical.
 *
 * Returns `true` only when every nominated edge survives unchanged. Returns
 * `false` if any edge is missing from either side, or if any of the inspected
 * metadata fields differ.
 *
 * This is the regression check for the V2 edge-metadata loss bug.
 */
export function validateEdgeIdStability(
  before: Piece,
  after: Piece,
  unchangedEdgeIds: readonly EdgeId[],
): boolean {
  const beforeById = new Map(before.edges.map((e) => [e.id, e]));
  const afterById = new Map(after.edges.map((e) => [e.id, e]));
  for (const id of unchangedEdgeIds) {
    const b = beforeById.get(id);
    const a = afterById.get(id);
    if (!b || !a) return false;
    if (b.profile !== a.profile) return false;
    if (b.finish !== a.finish) return false;
    if (b.exposure !== a.exposure) return false;
    if (!buildUpEqual(b.buildUp, a.buildUp)) return false;
    if (!curvesEqual(b.curve, a.curve)) return false;
  }
  return true;
}

function curvesEqual(
  a: Edge["curve"] | undefined,
  b: Edge["curve"] | undefined,
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return (
    a.kind === b.kind && a.radiusMm === b.radiusMm && a.bulge === b.bulge
  );
}

function buildUpEqual(
  a: Edge["buildUp"] | undefined,
  b: Edge["buildUp"] | undefined,
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return (
    a.targetThicknessMm === b.targetThicknessMm &&
    a.method === b.method &&
    a.stripWidthMm === b.stripWidthMm
  );
}

// Convenience: re-export Vertex type-level helpers used by tests.
export type { Vertex };
