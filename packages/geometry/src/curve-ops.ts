// packages/geometry/src/curve-ops.ts
//
// Round-3A: arc geometry. Two distinct curve concepts:
//
//   1. CORNER ARCS — a vertex with `cornerRadiusMm > 0` is fabricated as a
//      circular arc tangent to both adjacent straight edges. The arc starts
//      on the incoming edge `radius` away from the vertex, ends on the
//      outgoing edge `radius` away, and bulges inward toward the corner.
//
//   2. ROUND-END EDGES — an edge whose `curve` is set is fabricated as an
//      arc from edge.start to edge.end. We reuse the existing
//      `CurveDescriptor` (kind: "arc", radiusMm, bulge: "left" | "right")
//      and treat round-end as the special case where radius = chord/2 (the
//      arc is a semicircle).
//
// All functions are pure. CornerArc is a runtime computation result — we
// never persist it; it's reconstructed on each render / kernel pass from
// the cheaper-to-store (vertex, prev, next, radiusMm) tuple. This matches
// Sean's call on UNCERTAIN-2: stored shape stays as the existing
// `{kind, radiusMm, bulge}`; brief's centre/radius/clockwise lives here.

import type { CurveDescriptor, Vertex } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// CornerArc — runtime arc descriptor (not stored)
// ─────────────────────────────────────────────────────────────────────────────

export interface Pt2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Result of computing a corner arc. Consumers (Konva renderer, kernel
 * area/perimeter) read these fields to draw the arc and integrate over it.
 *
 * Coordinates in mm. Angles in radians, measured from the +x axis CCW.
 * `clockwise` is the sweep direction from `startAngleRad` to `endAngleRad`.
 */
export interface CornerArc {
  readonly arcStart: Pt2D;
  readonly arcEnd: Pt2D;
  readonly centre: Pt2D;
  readonly radiusMm: number;
  readonly startAngleRad: number;
  readonly endAngleRad: number;
  readonly clockwise: boolean;
  /** Sweep angle in radians, always positive. arc length = radius * sweep. */
  readonly sweepRad: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function sub(a: Pt2D, b: Pt2D): Pt2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

function len(v: Pt2D): number {
  return Math.hypot(v.x, v.y);
}

function normalize(v: Pt2D): Pt2D {
  const L = len(v);
  if (L === 0) return { x: 0, y: 0 };
  return { x: v.x / L, y: v.y / L };
}

function add(a: Pt2D, b: Pt2D): Pt2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: Pt2D, s: number): Pt2D {
  return { x: v.x * s, y: v.y * s };
}

/**
 * Cross-product z-component of two 2D vectors (a.x*b.y - a.y*b.x). Sign
 * tells us the rotational direction from a to b: positive = CCW.
 */
function cross2(a: Pt2D, b: Pt2D): number {
  return a.x * b.y - a.y * b.x;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the arc geometry for a rounded corner at `vertex`, given the
 * prev/next vertices on the ring.
 *
 * Construction:
 *   - Let u = unit vector from vertex toward prev (incoming edge, reversed)
 *   - Let v = unit vector from vertex toward next (outgoing edge)
 *   - Let θ = full angle between u and v (interior angle at the vertex)
 *   - The tangent length from the vertex to each arc endpoint is
 *     t = radius / tan(θ/2)
 *   - arcStart = vertex + u*t (on the incoming edge)
 *   - arcEnd   = vertex + v*t (on the outgoing edge)
 *   - The bisector points inward; the arc centre is at distance
 *     d = radius / sin(θ/2) from the vertex along that bisector.
 *
 * Returns null when:
 *   - radius ≤ 0
 *   - the vertex is collinear with prev/next (no corner to round)
 *   - the tangent length t exceeds either adjacent edge length (would
 *     overlap an adjacent corner — caller should fall back to a smaller
 *     radius or no rounding)
 */
export function computeCornerArc(
  vertex: Vertex,
  prevVertex: Vertex,
  nextVertex: Vertex,
  radiusMm: number,
): CornerArc | null {
  if (radiusMm <= 0) return null;

  const v0: Pt2D = { x: vertex.x, y: vertex.y };
  const u = normalize(sub({ x: prevVertex.x, y: prevVertex.y }, v0));
  const w = normalize(sub({ x: nextVertex.x, y: nextVertex.y }, v0));

  // Interior angle θ between u and w.
  const dot = u.x * w.x + u.y * w.y;
  const clamped = Math.min(1, Math.max(-1, dot));
  const theta = Math.acos(clamped);
  if (theta < 1e-6 || Math.PI - theta < 1e-6) {
    // Collinear: no corner to round (180° straight) or zero corner.
    return null;
  }

  const tangentLen = radiusMm / Math.tan(theta / 2);
  const lenIn = len(sub({ x: prevVertex.x, y: prevVertex.y }, v0));
  const lenOut = len(sub({ x: nextVertex.x, y: nextVertex.y }, v0));
  if (tangentLen > lenIn || tangentLen > lenOut) return null;

  const arcStart = add(v0, scale(u, tangentLen));
  const arcEnd = add(v0, scale(w, tangentLen));

  // Bisector direction from the vertex toward the arc centre. The arc
  // centre lies on the side opposite the corner — the bisector of u + w
  // points outward from the wedge for an interior corner; we negate.
  const bisector = normalize({ x: u.x + w.x, y: u.y + w.y });
  const centreDist = radiusMm / Math.sin(theta / 2);
  const centre = add(v0, scale(bisector, centreDist));

  // Angles measured from the centre to the arc endpoints.
  const startAngleRad = Math.atan2(arcStart.y - centre.y, arcStart.x - centre.x);
  const endAngleRad = Math.atan2(arcEnd.y - centre.y, arcEnd.x - centre.x);

  // Sweep direction: choose the short way around (sweep < π).
  // The cross-product of (centre→arcStart) and (centre→arcEnd) tells us
  // the sign: cross > 0 means CCW rotation start→end is positive.
  const csv = sub(arcStart, centre);
  const ce = sub(arcEnd, centre);
  const cz = cross2(csv, ce);
  const clockwise = cz < 0;

  // Sweep is the unsigned arc angle. For an interior corner of measure θ,
  // the arc subtends (π − θ) at its centre.
  const sweepRad = Math.PI - theta;

  return {
    arcStart,
    arcEnd,
    centre,
    radiusMm,
    startAngleRad,
    endAngleRad,
    clockwise,
    sweepRad,
  };
}

/**
 * Validate a corner radius proposal: returns true iff the radius produces a
 * corner arc whose tangent length fits within both adjacent edges.
 *
 * Convenience wrapper around `computeCornerArc` returning a boolean.
 */
export function isValidCornerRadius(
  vertex: Vertex,
  prevVertex: Vertex,
  nextVertex: Vertex,
  radiusMm: number,
): boolean {
  if (radiusMm <= 0) return true; // 0 = sharp corner, always valid
  return computeCornerArc(vertex, prevVertex, nextVertex, radiusMm) !== null;
}

/**
 * Build a `CurveDescriptor` for a "round end" — a semicircular arc from
 * edgeStart to edgeEnd, bulging outward.
 *
 * Round-end semantics: the chord is the edge; the arc is a half-circle
 * with radius = chord/2. The bulge side is the caller's choice — typically
 * the side away from the polygon interior.
 *
 * We construct the descriptor in the existing `{kind, radiusMm, bulge}`
 * shape rather than centre/radius (UNCERTAIN-2 [A]).
 */
export function computeRoundEndCurve(
  edgeStart: Pt2D,
  edgeEnd: Pt2D,
  bulge: "left" | "right" = "right",
): CurveDescriptor {
  const dx = edgeEnd.x - edgeStart.x;
  const dy = edgeEnd.y - edgeStart.y;
  const chordLen = Math.hypot(dx, dy);
  return {
    kind: "arc",
    radiusMm: chordLen / 2,
    bulge,
  };
}

/**
 * Length of an edge with a CurveDescriptor — arc length along the chord's
 * circular arc. For a semicircle (round-end case, radius = chord/2) this
 * returns π·radius = π·chord/2.
 *
 * For arbitrary radius ≥ chord/2, sweep = 2·asin(chord / (2·radius)).
 * Returns the chord length when radius equals chord/2 (semicircle limit
 * handled cleanly).
 */
export function curvedEdgeArcLengthMm(
  edgeStart: Pt2D,
  edgeEnd: Pt2D,
  curve: CurveDescriptor,
): number {
  const chord = Math.hypot(edgeEnd.x - edgeStart.x, edgeEnd.y - edgeStart.y);
  if (chord === 0) return 0;
  const r = curve.radiusMm;
  // Half-angle subtended at the circle centre.
  const halfChord = chord / 2;
  if (r < halfChord) {
    // Geometrically invalid (radius too small for the chord). Fall back to
    // chord length — caller's validation should reject before we get here.
    return chord;
  }
  const halfSweep = Math.asin(halfChord / r);
  return 2 * r * halfSweep;
}

/**
 * Signed area correction for one corner arc, relative to the straight
 * polygon at the same vertex.
 *
 * The straight polygon at a corner of interior angle θ encloses a triangle
 * (the corner) of area (1/2)·t²·sin(θ), where t = radius/tan(θ/2).
 * The arc-cut polygon replaces that triangle with a circular segment of
 * area (r²/2)·(α − sin α), where α = π − θ is the sweep.
 *
 * Returns (segment area − triangle area). Always negative because rounding
 * a corner removes material.
 */
export function cornerArcAreaCorrection(arc: CornerArc, interiorAngleRad: number): number {
  const r = arc.radiusMm;
  const theta = interiorAngleRad;
  const tHalf = Math.tan(theta / 2);
  if (tHalf === 0) return 0;
  const t = r / tHalf;
  const triangleArea = 0.5 * t * t * Math.sin(theta);
  const alpha = arc.sweepRad;
  const segmentArea = (r * r / 2) * (alpha - Math.sin(alpha));
  return segmentArea - triangleArea;
}

/**
 * Signed area correction for a curved edge, relative to the straight chord.
 *
 * For an edge with a `CurveDescriptor`, the chord shoelace already counts
 * the chord-bounded area. The arc adds (or subtracts) the area of the
 * circular segment between chord and arc.
 *
 * `bulge: "right"` means the arc bows to the right of the chord direction
 * (start → end). The correction is positive if the bulge adds enclosed
 * area to the polygon (i.e. it bulges outward CCW relative to the
 * polygon's authored orientation). The caller decides the sign based on
 * orientation; we return the unsigned segment area and let the kernel
 * apply the sign per ring orientation + bulge direction.
 */
export function curvedEdgeSegmentArea(
  edgeStart: Pt2D,
  edgeEnd: Pt2D,
  curve: CurveDescriptor,
): number {
  const chord = Math.hypot(edgeEnd.x - edgeStart.x, edgeEnd.y - edgeStart.y);
  if (chord === 0) return 0;
  const r = curve.radiusMm;
  const halfChord = chord / 2;
  if (r < halfChord) return 0;
  const halfSweep = Math.asin(halfChord / r);
  const sweep = 2 * halfSweep;
  // Circular segment area between chord and arc.
  return (r * r / 2) * (sweep - Math.sin(sweep));
}

/**
 * Interior angle at a vertex on a polygon, given the prev/next vertices.
 *
 * Returns the angle in radians, in [0, π]. Useful for the editor's
 * "show angle at selected vertex" UI and for arc constructions.
 */
export function interiorAngleRad(
  vertex: Vertex,
  prevVertex: Vertex,
  nextVertex: Vertex,
): number {
  const v0: Pt2D = { x: vertex.x, y: vertex.y };
  const u = normalize(sub({ x: prevVertex.x, y: prevVertex.y }, v0));
  const w = normalize(sub({ x: nextVertex.x, y: nextVertex.y }, v0));
  const dot = u.x * w.x + u.y * w.y;
  const clamped = Math.min(1, Math.max(-1, dot));
  return Math.acos(clamped);
}
