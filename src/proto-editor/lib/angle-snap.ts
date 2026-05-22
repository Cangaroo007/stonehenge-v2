// apps/web/src/lib/angle-snap.ts
//
// Round 9 (Issue 4) — Vertex angle-snap helper.
//
// During a vertex drag the helper computes whether the proposed
// position produces an interior angle close to a "standard" target
// (0, 30, 45, 60, 90, 120, 135, 150, 180 degrees). If within the snap
// threshold (3°) the proposed position is replaced with a snapped
// position that gives the EXACT target angle.
//
// Snap math: the locus of points V' producing a fixed interior angle θ
// at V', with A = prev and B = next fixed, is a circular arc through A
// and B (inscribed-angle theorem). The snap projects the proposed
// position onto this circumcircle.
//
// Edge cases:
//   * θ = 0° or 180° — degenerate; the locus is the line through AB.
//     Snap projects onto segment AB instead.
//   * The projection lands on the wrong side of AB (would flip polygon
//     orientation): return null so no snap fires.
//
// Pure geometry — no React, no Konva. Caller (PolygonCanvas + Konva
// dragBoundFunc) wires this in.

import type { Piece, Vertex, VertexId } from "@stonehenge-proto/geometry";

/** Snap targets, in degrees (brief UNCERTAIN-10 [A]). */
export const ANGLE_SNAP_TARGETS_DEG: readonly number[] = [
  0, 30, 45, 60, 90, 120, 135, 150, 180,
];

/**
 * Round 10 (Fix 1) — tightened thresholds. The 3° band proved too greedy on
 * everyday drags: on a 600 mm edge a 3° miss is ≈ 31 mm of vertex deviation,
 * which is enough that operators trying to make a non-standard angle felt
 * they were fighting the snap. The new bands:
 *
 *   - SNAP (magnetises)        : ≤ 1.0°
 *   - WARNING (chip + Square-it): > 0.5° and ≤ 2.0°
 *   - NO-WARN (close enough)   : ≤ 0.5°  — LiDAR is ±0.1° angular, so an
 *                                 angle within half a degree is treated as
 *                                 exact for fabrication purposes.
 */
/** Magnetic snap threshold — vertex sticks to standard angle within this range. */
export const ANGLE_SNAP_THRESHOLD_DEG = 1.0;
/** Warning threshold — "this is close to X° but not exact". */
export const ANGLE_WARNING_THRESHOLD_DEG = 2.0;
/** No-warn zone — close enough for fabrication (LiDAR ±0.1° angular accuracy). */
export const ANGLE_NO_WARN_THRESHOLD_DEG = 0.5;

/**
 * Round 11 (Fix 1) — exact-value angle display.
 *
 * Pre-Round-11 the canvas angle label, the panel angle input, and the
 * VertexAngleArc badge all ran through `Math.round`, masking up to 0.5°
 * of error per vertex. That hid the 1° integrity drift that motivates
 * Fix 2 — operators couldn't see that a "90°" corner was actually 89.5°.
 *
 * The new display rule: show whole numbers as integers, fractional
 * values to one decimal place. No rounding-up — the operator must see
 * when a corner is off by tenths of a degree.
 *
 *   90       → "90°"
 *   89.5     → "89.5°"
 *   106.34   → "106.3°"
 *   255      → "255°"
 *   89.96    → "90°"   (one decimal place, rounded to nearest tenth)
 *
 * Caller adds the °-suffix unless the variant is the bare numeric form
 * for input boxes — that variant is `formatAngleInputValue` below.
 */
export function formatAngleDisplay(angleDeg: number): string {
  if (!Number.isFinite(angleDeg)) return "—";
  const rounded = Math.round(angleDeg * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return `${Math.round(rounded)}°`;
  }
  return `${rounded.toFixed(1)}°`;
}

/**
 * Round 11 (Fix 1) — numeric form for the input box. Same precision
 * rule as `formatAngleDisplay` but without the °-suffix so the value
 * can be parsed back via `Number`.
 */
export function formatAngleInputValue(angleDeg: number): string {
  if (!Number.isFinite(angleDeg)) return "";
  const rounded = Math.round(angleDeg * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return `${Math.round(rounded)}`;
  }
  return rounded.toFixed(1);
}

export interface AngleSnapResult {
  /** Snapped position (mm), or the proposed position if no snap fired. */
  readonly x: number;
  readonly y: number;
  /**
   * The target angle that fired (degrees) if a snap fired, otherwise
   * null. Used to render the on-canvas snap indicator.
   */
  readonly snappedAngleDeg: number | null;
}

/**
 * Outer-ring neighbours for a vertex. Mirrors the logic used in
 * VertexPropertiesPanel — extracted here so the snap helper is
 * standalone.
 */
function findNeighbours(
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
    }
  }
  return null;
}

/**
 * Interior angle (degrees) at a proposed position, given the
 * outer-ring neighbours. Mirrors `interiorAngleDeg` from the geometry
 * kernel but operates on a hypothetical position rather than a stored
 * vertex.
 */
export function interiorAngleAtPositionDeg(
  prev: Vertex,
  next: Vertex,
  vertexX: number,
  vertexY: number,
): number | null {
  const inDx = vertexX - prev.x;
  const inDy = vertexY - prev.y;
  const outDx = next.x - vertexX;
  const outDy = next.y - vertexY;
  const inLen = Math.hypot(inDx, inDy);
  const outLen = Math.hypot(outDx, outDy);
  if (inLen === 0 || outLen === 0) return null;
  // Interior angle = 180° - turn angle between incoming and outgoing.
  const cross = inDx * outDy - inDy * outDx;
  const dot = inDx * outDx + inDy * outDy;
  const turnRad = Math.atan2(cross, dot);
  return 180 - (turnRad * 180) / Math.PI;
}

/**
 * Find the nearest snap target to a given angle. Returns the target
 * and the absolute delta. If no target is within the threshold,
 * returns null.
 */
function nearestSnapTarget(angleDeg: number): {
  readonly target: number;
  readonly deltaDeg: number;
} | null {
  let best: { target: number; deltaDeg: number } | null = null;
  for (const target of ANGLE_SNAP_TARGETS_DEG) {
    const delta = Math.abs(angleDeg - target);
    if (delta < ANGLE_SNAP_THRESHOLD_DEG) {
      if (!best || delta < best.deltaDeg) {
        best = { target, deltaDeg: delta };
      }
    }
  }
  return best;
}

/**
 * Project a point onto the circumcircle whose chord is AB and inscribed
 * angle at the circle is `targetAngleDeg`. Returns the projected point
 * on the same side of AB as the original vertex, or null on degenerate
 * input (zero-length AB, projection to wrong side, etc.).
 *
 * For target 0° / 180° (degenerate circle), the locus is the line AB;
 * snap projects onto the line segment.
 */
function projectOntoAngleLocus(
  prev: Vertex,
  next: Vertex,
  vertex: Vertex,
  proposedX: number,
  proposedY: number,
  targetAngleDeg: number,
): { readonly x: number; readonly y: number } | null {
  const abx = next.x - prev.x;
  const aby = next.y - prev.y;
  const lenAB = Math.hypot(abx, aby);
  if (lenAB === 0) return null;

  // Degenerate case: collinear targets.
  if (targetAngleDeg <= 0.01 || targetAngleDeg >= 179.99) {
    // Project proposed onto line through AB.
    const dx = proposedX - prev.x;
    const dy = proposedY - prev.y;
    const t = (dx * abx + dy * aby) / (lenAB * lenAB);
    return { x: prev.x + t * abx, y: prev.y + t * aby };
  }

  const thetaRad = (targetAngleDeg * Math.PI) / 180;
  const sinT = Math.sin(thetaRad);
  const cosT = Math.cos(thetaRad);
  const R = lenAB / (2 * sinT);

  // Unit perpendicular to AB, rotated 90° CCW: (-aby/lenAB, abx/lenAB).
  const nx = -aby / lenAB;
  const ny = abx / lenAB;

  // Distance from midpoint M to circumcentre O: |OM| = |AB|/(2 tan θ).
  // Sign chosen to keep V on the same side of AB as the original.
  const dMO = (lenAB / 2) * (cosT / sinT);
  const mx = (prev.x + next.x) / 2;
  const my = (prev.y + next.y) / 2;

  // Which side of AB is the original vertex on?
  const crossOrig = abx * (vertex.y - prev.y) - aby * (vertex.x - prev.x);
  const vertexSide = crossOrig > 0 ? 1 : -1;

  // Inscribed-angle theorem: V is on the major arc when θ < 90°, minor
  // arc when θ > 90°. The circumcentre sits on the OPPOSITE side of AB
  // from V when θ < 90°, SAME side when θ > 90°.
  const centreSide =
    targetAngleDeg < 90 ? -vertexSide : targetAngleDeg > 90 ? vertexSide : 0;

  // For θ exactly 90°, the centre IS the midpoint M (Thales' theorem).
  const ox = mx + nx * dMO * centreSide;
  const oy = my + ny * dMO * centreSide;

  const dpx = proposedX - ox;
  const dpy = proposedY - oy;
  const dpLen = Math.hypot(dpx, dpy);
  if (dpLen === 0) return null;

  const snappedX = ox + (dpx / dpLen) * R;
  const snappedY = oy + (dpy / dpLen) * R;

  // Ensure the snapped point landed on the right side of AB.
  const snappedCross =
    abx * (snappedY - prev.y) - aby * (snappedX - prev.x);
  const snappedSide = snappedCross > 0 ? 1 : -1;
  if (snappedSide !== vertexSide) {
    // Projected to the wrong arc (proposed was on the far side of AB).
    // No snap — preserve the user's drag.
    return null;
  }

  return { x: snappedX, y: snappedY };
}

/**
 * Snap the proposed drag position to the nearest standard angle if
 * within threshold. Returns the snapped result with `snappedAngleDeg`
 * naming the snap target, or the unchanged proposed position with
 * `snappedAngleDeg: null` when no snap fires.
 */
export function snapVertexAngle(
  piece: Piece,
  vertexId: VertexId,
  proposedX: number,
  proposedY: number,
): AngleSnapResult {
  const vertex = piece.vertices.find((v) => v.id === vertexId);
  if (!vertex) {
    return { x: proposedX, y: proposedY, snappedAngleDeg: null };
  }
  const neighbours = findNeighbours(piece, vertexId);
  if (!neighbours) {
    return { x: proposedX, y: proposedY, snappedAngleDeg: null };
  }
  const angleAtProposed = interiorAngleAtPositionDeg(
    neighbours.prev,
    neighbours.next,
    proposedX,
    proposedY,
  );
  if (angleAtProposed === null) {
    return { x: proposedX, y: proposedY, snappedAngleDeg: null };
  }
  const nearest = nearestSnapTarget(angleAtProposed);
  if (!nearest) {
    return { x: proposedX, y: proposedY, snappedAngleDeg: null };
  }
  const snapped = projectOntoAngleLocus(
    neighbours.prev,
    neighbours.next,
    vertex,
    proposedX,
    proposedY,
    nearest.target,
  );
  if (!snapped) {
    return { x: proposedX, y: proposedY, snappedAngleDeg: null };
  }
  return { x: snapped.x, y: snapped.y, snappedAngleDeg: nearest.target };
}
