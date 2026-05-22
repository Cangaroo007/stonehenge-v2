// packages/geometry/src/kernel.ts
//
// Pure geometric computations on the polygon primitive. No side effects, no
// I/O, no imports outside this package.
//
// Coordinate system: millimetres, origin at the piece-local zero. Outer ring
// authored CCW yields positive signed area; inner rings authored CW yield
// negative signed area, so the shoelace sum is `outer − inners` directly.
//
// Round-3A: area + perimeter are arc-aware by default (UNCERTAIN-3 [A]).
// For each vertex with `cornerRadiusMm > 0` we subtract two tangent lengths
// from the straight perimeter and add the arc length; we subtract a small
// area correction equal to `triangleArea − segmentArea`. For each edge with
// a `CurveDescriptor` we replace chord length with arc length and add a
// circular-segment area correction.
//
// Pieces with no corner radii and no curved edges produce identical results
// to the pre-Round-3A kernel — the original three rectangle/L/U area tests
// remain green.

import { Decimal } from "decimal.js";

import {
  cornerArcAreaCorrection,
  computeCornerArc,
  curvedEdgeArcLengthMm,
  curvedEdgeSegmentArea,
  interiorAngleRad,
} from "./curve-ops";
import type {
  BoundingBoxMm,
  Edge,
  EdgeId,
  Piece,
  Ring,
  Vertex,
  VertexId,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function indexVertices(vertices: readonly Vertex[]): Map<VertexId, Vertex> {
  const m = new Map<VertexId, Vertex>();
  for (const v of vertices) m.set(v.id, v);
  return m;
}

function indexEdges(edges: readonly Edge[]): Map<EdgeId, Edge> {
  const m = new Map<EdgeId, Edge>();
  for (const e of edges) m.set(e.id, e);
  return m;
}

/**
 * Walk a ring's edges in order, yielding the ordered vertex sequence
 * (start of each edge). Throws if any edge ID is unknown or the ring is
 * malformed (an edge's end does not chain to the next edge's start).
 */
function ringVertexSequence(
  ring: Ring,
  edgesById: ReadonlyMap<EdgeId, Edge>,
  verticesById: ReadonlyMap<VertexId, Vertex>,
): Vertex[] {
  if (ring.edges.length === 0) {
    throw new Error("ringVertexSequence: ring has no edges");
  }
  const out: Vertex[] = [];
  for (let i = 0; i < ring.edges.length; i++) {
    const id = ring.edges[i]!;
    const edge = edgesById.get(id);
    if (!edge) {
      throw new Error(`ringVertexSequence: unknown edge id ${String(id)}`);
    }
    const startVertex = verticesById.get(edge.start);
    if (!startVertex) {
      throw new Error(
        `ringVertexSequence: unknown start vertex ${String(edge.start)}`,
      );
    }
    out.push(startVertex);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public kernel API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Length of a single edge in mm. Straight edges: Euclidean distance between
 * endpoints. Curved edges: chord length for Phase 1 (see module header).
 */
export function computeEdgeLengthMm(
  edge: Edge,
  vertices: readonly Vertex[],
): number {
  const verticesById = indexVertices(vertices);
  return edgeLengthMmFromMaps(edge, verticesById);
}

function edgeLengthMmFromMaps(
  edge: Edge,
  verticesById: ReadonlyMap<VertexId, Vertex>,
): number {
  const a = verticesById.get(edge.start);
  const b = verticesById.get(edge.end);
  if (!a || !b) {
    throw new Error(
      `computeEdgeLengthMm: edge ${String(edge.id)} references unknown vertex`,
    );
  }
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (edge.curve) {
    return curvedEdgeArcLengthMm({ x: a.x, y: a.y }, { x: b.x, y: b.y }, edge.curve);
  }
  return chord;
}

/**
 * Round-3A: total adjustment to a ring's perimeter from corner radii on
 * its vertices. Each rounded corner replaces two `tangentLen` segments
 * (subtracted from the straight perimeter) with one arc of length
 * `radius * sweep` (added).
 *
 * Returns `addArcLength − subtractTangents`, so the caller adds it to the
 * straight-perimeter total.
 *
 * Pieces with no corner radii return 0 — the existing tests (rectangle,
 * L, U) all hit this fast path.
 */
function ringCornerAdjustmentMm(
  ring: Ring,
  edgesById: ReadonlyMap<EdgeId, Edge>,
  verticesById: ReadonlyMap<VertexId, Vertex>,
): number {
  let adj = 0;
  const seq = ringVertexSequence(ring, edgesById, verticesById);
  const n = seq.length;
  for (let i = 0; i < n; i++) {
    const v = seq[i]!;
    const r = v.cornerRadiusMm;
    if (!r || r <= 0) continue;
    const prev = seq[(i - 1 + n) % n]!;
    const next = seq[(i + 1) % n]!;
    const arc = computeCornerArc(v, prev, next, r);
    if (!arc) continue;
    const theta = interiorAngleRad(v, prev, next);
    const tangentLen = r / Math.tan(theta / 2);
    const arcLength = r * arc.sweepRad;
    adj += arcLength - 2 * tangentLen;
  }
  return adj;
}

/**
 * Round-3A: total area correction from corner radii on a ring's vertices.
 * Each rounded corner removes a small wedge of material; the correction is
 * always negative (or zero).
 */
function ringCornerAreaCorrectionMm2(
  ring: Ring,
  edgesById: ReadonlyMap<EdgeId, Edge>,
  verticesById: ReadonlyMap<VertexId, Vertex>,
): number {
  let acc = 0;
  const seq = ringVertexSequence(ring, edgesById, verticesById);
  const n = seq.length;
  for (let i = 0; i < n; i++) {
    const v = seq[i]!;
    const r = v.cornerRadiusMm;
    if (!r || r <= 0) continue;
    const prev = seq[(i - 1 + n) % n]!;
    const next = seq[(i + 1) % n]!;
    const arc = computeCornerArc(v, prev, next, r);
    if (!arc) continue;
    const theta = interiorAngleRad(v, prev, next);
    acc += cornerArcAreaCorrection(arc, theta);
  }
  return acc;
}

/**
 * Round-3A: total area correction from curved edges on a ring. For each
 * edge with a `CurveDescriptor` we add a circular-segment area, signed
 * according to the ring orientation and the bulge direction.
 *
 * Sign convention: a `bulge: "right"` arc on a CCW ring bulges OUTWARD
 * (adds area) iff the edge direction is CCW around the ring — which is
 * the authored direction. We apply +segmentArea for "right" on CCW and
 * "left" on CW; − for the opposites.
 */
function ringCurvedEdgeAreaCorrectionMm2(
  ring: Ring,
  edgesById: ReadonlyMap<EdgeId, Edge>,
  verticesById: ReadonlyMap<VertexId, Vertex>,
): number {
  let acc = 0;
  for (const id of ring.edges) {
    const e = edgesById.get(id);
    if (!e || !e.curve) continue;
    const a = verticesById.get(e.start);
    const b = verticesById.get(e.end);
    if (!a || !b) continue;
    const segArea = curvedEdgeSegmentArea(
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      e.curve,
    );
    const outwardCCW =
      (ring.orientation === "ccw" && e.curve.bulge === "right") ||
      (ring.orientation === "cw" && e.curve.bulge === "left");
    acc += outwardCCW ? segArea : -segArea;
  }
  return acc;
}

/**
 * Signed shoelace area of a ring in mm². The sign reflects the authored
 * traversal direction: positive when CCW, negative when CW. Curved edges are
 * treated as straight chords (Phase 1).
 */
function signedShoelaceMm2(
  ring: Ring,
  edgesById: ReadonlyMap<EdgeId, Edge>,
  verticesById: ReadonlyMap<VertexId, Vertex>,
): number {
  const seq = ringVertexSequence(ring, edgesById, verticesById);
  let acc = 0;
  for (let i = 0; i < seq.length; i++) {
    const a = seq[i]!;
    const b = seq[(i + 1) % seq.length]!;
    acc += a.x * b.y - b.x * a.y;
  }
  return acc / 2;
}

/**
 * Polygon area in mm². Computed from the outer ring minus the inner rings.
 * Authored conventions (outer CCW, inner CW) give a direct sum that nets to
 * outer − inners.
 *
 * Round-3A: arc-aware. After the chord-shoelace baseline we apply two
 * corrections per ring:
 *   - corner-radius correction (always non-positive): rounding a corner
 *     removes a small wedge of stone
 *   - curved-edge correction (signed by orientation × bulge): a round-end
 *     edge that bulges outward adds a circular segment of stone
 *
 * Pieces with no corner radii and no curved edges are unaffected (both
 * corrections evaluate to 0); the existing rectangle/L/U area tests pass
 * unchanged.
 */
export function computeAreaMm2(
  vertices: readonly Vertex[],
  outerRing: Ring,
  edges: readonly Edge[],
  innerRings: readonly Ring[] = [],
): number {
  const edgesById = indexEdges(edges);
  const verticesById = indexVertices(vertices);
  let signed = signedShoelaceMm2(outerRing, edgesById, verticesById);
  for (const inner of innerRings) {
    signed += signedShoelaceMm2(inner, edgesById, verticesById);
  }
  // Apply Round-3A arc corrections. Both helpers return 0 for pieces with
  // no corner radii / no curved edges, so the rectangle/L/U fast path is
  // intact.
  let corrected = Math.abs(signed);
  corrected += ringCornerAreaCorrectionMm2(outerRing, edgesById, verticesById);
  corrected += ringCurvedEdgeAreaCorrectionMm2(outerRing, edgesById, verticesById);
  for (const inner of innerRings) {
    // Inner rings represent holes — the same corrections apply but with
    // sign reversed (a rounded corner on a hole adds material to the
    // piece because it removes less of the hole).
    corrected -= ringCornerAreaCorrectionMm2(inner, edgesById, verticesById);
    corrected -= ringCurvedEdgeAreaCorrectionMm2(inner, edgesById, verticesById);
  }
  return corrected;
}

/**
 * Polygon area in m² as a `Decimal` for downstream pricing. Conversion is
 * `mm² / 1_000_000`. Constructed from a string to keep the Decimal pipeline
 * pure even though the upstream computation uses Number.
 */
export function computeAreaM2(
  vertices: readonly Vertex[],
  outerRing: Ring,
  edges: readonly Edge[],
  innerRings: readonly Ring[] = [],
): Decimal {
  const mm2 = computeAreaMm2(vertices, outerRing, edges, innerRings);
  return new Decimal(mm2.toString()).dividedBy(new Decimal("1000000"));
}

/**
 * Perimeter of the outer ring in mm. Sum of edge lengths along the ring.
 *
 * Round-3A: arc-aware. Edges with a `CurveDescriptor` contribute arc length
 * (not chord); each rounded corner replaces two `tangentLen` segments with
 * one arc of length `radius * sweep`.
 *
 * Pieces with no corner radii and no curved edges return the same value as
 * the pre-Round-3A kernel.
 */
export function computePerimeterMm(
  vertices: readonly Vertex[],
  outerRing: Ring,
  edges: readonly Edge[],
): number {
  const edgesById = indexEdges(edges);
  const verticesById = indexVertices(vertices);
  let acc = 0;
  for (const id of outerRing.edges) {
    const e = edgesById.get(id);
    if (!e) {
      throw new Error(`computePerimeterMm: unknown edge id ${String(id)}`);
    }
    // edgeLengthMmFromMaps already returns arc length for curved edges.
    acc += edgeLengthMmFromMaps(e, verticesById);
  }
  acc += ringCornerAdjustmentMm(outerRing, edgesById, verticesById);
  return acc;
}

/**
 * Sum of lengths of edges in the piece's outer ring whose `exposure ===
 * "exposed"`. Inner rings are not considered (they describe holes; they are
 * not exposed run length).
 *
 * Round-3A: curved edges contribute arc length (handled by
 * `edgeLengthMmFromMaps`). Corner-radius adjustment is intentionally NOT
 * applied here — exposed-perimeter pricing measures the linear run of
 * profiled edge, and rounded-corner fabrication is billed via a separate
 * surcharge in V3 (deferred). The existing exposed-perimeter test
 * (rectangle marked exposed = 3200 mm exact) is preserved.
 */
export function computeExposedPerimeterMm(piece: Piece): number {
  const edgesById = indexEdges(piece.edges);
  const verticesById = indexVertices(piece.vertices);
  let acc = 0;
  for (const id of piece.outerRing.edges) {
    const e = edgesById.get(id);
    if (!e) {
      throw new Error(
        `computeExposedPerimeterMm: unknown edge id ${String(id)}`,
      );
    }
    if (e.exposure === "exposed") {
      acc += edgeLengthMmFromMaps(e, verticesById);
    }
  }
  return acc;
}

/**
 * Axis-aligned bounding box of a vertex set in mm.
 */
export function computeBoundingBox(vertices: readonly Vertex[]): BoundingBoxMm {
  if (vertices.length === 0) {
    throw new Error("computeBoundingBox: no vertices");
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY };
}
