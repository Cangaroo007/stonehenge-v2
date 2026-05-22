// apps/web/src/lib/square-corner.ts
//
// Round 17 (Fix 2) — square-corner helper that preserves the incoming
// edge's length while rotating the vertex to achieve a target interior
// angle. Replaces `setVertexAngle` in the "Square this corner" CTA path.
//
// Why this exists
// ───────────────
// The geometry package's `setVertexAngle` solves the "rotate V to make
// the interior angle equal θ" problem by preserving the OUTGOING edge
// length (|VB|). That's the V2 default, but it surfaces a fabrication
// bug: when a mason sets an OUTSIDE LEG (often the incoming edge of the
// corner being squared) to 1500 mm and then squares the corner, the leg
// is the one that shrinks — exactly the dimension the mason just
// measured. Sean reported 1500 → ~1482 in Round 16 testing.
//
// This helper inverts the constraint: the INCOMING edge length |AV| is
// preserved instead. V' lies on the circle radius |AV| around prev (A),
// and the angle at V' is exactly the target. The OUTGOING edge length
// |V'B| changes — for near-right-angle inputs (the common case: a
// polygon that's 88.3° and wants to be 90°), the change is sub-mm and
// the operator perceives both edges as preserved.
//
// Geometric construction
// ──────────────────────
// Triangle AV'B with the target angle θ at V':
//   |AB|² = |AV'|² + |V'B|² − 2·|AV'|·|V'B|·cos(θ)   (law of cosines)
// Solve the quadratic for |V'B| using the constraint |AV'| = |AV|
// (preserved). Then derive the angle at A via law of cosines:
//   cos(∠V'AB) = (|AV'|² + |AB|² − |V'B|²) / (2·|AV'|·|AB|)
// and rotate the unit vector A→B by ∠V'AB in the sign that keeps V on
// its original side of AB (preserving polygon orientation).
//
// Geometric impossibility cases
// ─────────────────────────────
// 1. The triangle inequality cannot be satisfied — |AB| is too small or
//    too large relative to |AV| at the target angle. Quadratic
//    discriminant is negative. Return null → caller shows a toast.
// 2. Both roots of the quadratic are non-positive (|V'B| must be > 0
//    for the triangle to exist). Return null.
// 3. The vertex isn't on the outer ring, or any of the adjacent edges
//    is degenerate (zero length). Return null.
//
// Edge case worth noting: when |AV| is very small (an already-collapsed
// vertex) and the target angle is far from 90°, the helper may pick
// the "wrong" of the two |V'B| roots — we pick the one closest to the
// original |VB| as a heuristic to minimise polygon disruption.
//
// Not modifying the geometry package
// ──────────────────────────────────
// Sean's brief explicitly placed `packages/geometry` out of scope for
// this round. This helper lives in `apps/web/` and produces a new Piece
// via plain vertex-array mutation. The MOVE_VERTEX action (which uses
// the geometry package's `moveVertex`) is the public ingress for
// committing the new position to the editor state.

import type { Piece, Vertex, VertexId } from "@stonehenge-proto/geometry";

import { bestIntegerPointAtDistance } from "./edge-length-edit";

/**
 * Compute V' such that the interior angle at V' is exactly
 * `targetAngleDeg` and |prev → V'| equals the original |prev → V|.
 * Returns a new Piece with that vertex moved, or null if no valid
 * triangle exists (caller should surface a toast). All other vertices
 * are unchanged.
 *
 * For Round 17's "Square this corner" CTA, the caller pre-rounds the
 * computed vertex coordinates to whole mm before committing — same
 * convention as `moveVertex` and `setVertexAngle`.
 */
export function squareCornerPreservingLengths(
  piece: Piece,
  vertexId: VertexId,
  targetAngleDeg: number,
): Piece | null {
  if (!Number.isFinite(targetAngleDeg)) return null;
  if (targetAngleDeg <= 0 || targetAngleDeg >= 180) return null;

  // Walk the outer ring once to find prev / current / next. Mirrors
  // the same scan vertex-ops.getOuterRingNeighbourVertices uses, but
  // implemented locally so the geometry package isn't touched.
  const ring = piece.outerRing.edges;
  let prev: Vertex | null = null;
  let next: Vertex | null = null;
  for (let i = 0; i < ring.length; i++) {
    const incomingId = ring[i]!;
    const outgoingId = ring[(i + 1) % ring.length]!;
    const incoming = piece.edges.find((e) => e.id === incomingId);
    const outgoing = piece.edges.find((e) => e.id === outgoingId);
    if (!incoming || !outgoing) continue;
    if (incoming.end === vertexId && outgoing.start === vertexId) {
      const p = piece.vertices.find((x) => x.id === incoming.start);
      const n = piece.vertices.find((x) => x.id === outgoing.end);
      if (p && n) {
        prev = p;
        next = n;
        break;
      }
    }
  }
  if (!prev || !next) return null;

  const current = piece.vertices.find((x) => x.id === vertexId);
  if (!current) return null;

  const A = prev;
  const V = current;
  const B = next;

  // Edge A length (incoming) — the one we preserve.
  const lenAV = Math.hypot(V.x - A.x, V.y - A.y);
  if (lenAV === 0) return null;
  const lenAB = Math.hypot(B.x - A.x, B.y - A.y);
  if (lenAB === 0) return null;

  const theta = (targetAngleDeg * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);

  // Quadratic in |V'B|: x² − 2·lenAV·cos(θ)·x + (lenAV² − lenAB²) = 0
  const qa = 1;
  const qb = -2 * lenAV * cosTheta;
  const qc = lenAV * lenAV - lenAB * lenAB;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return null; // no valid triangle

  const sqrtDisc = Math.sqrt(disc);
  const root1 = (-qb + sqrtDisc) / (2 * qa);
  const root2 = (-qb - sqrtDisc) / (2 * qa);
  const positiveRoots: number[] = [];
  if (root1 > 1e-9) positiveRoots.push(root1);
  if (root2 > 1e-9 && Math.abs(root2 - root1) > 1e-9) positiveRoots.push(root2);
  if (positiveRoots.length === 0) return null;

  // Pick the root closest to the ORIGINAL |VB| to minimise disruption
  // to the polygon beyond V. For near-right-angle starting geometry
  // this is sub-mm away from the original.
  const lenVB_orig = Math.hypot(V.x - B.x, V.y - B.y);
  positiveRoots.sort(
    (p, q) => Math.abs(p - lenVB_orig) - Math.abs(q - lenVB_orig),
  );
  const lenVB = positiveRoots[0]!;

  // Angle at A in the new triangle, via law of cosines (no asin sign
  // ambiguity).
  //   cos(∠V'AB) = (lenAV² + lenAB² − lenVB²) / (2·lenAV·lenAB)
  let cosAngleAtA =
    (lenAV * lenAV + lenAB * lenAB - lenVB * lenVB) / (2 * lenAV * lenAB);
  // Clamp for floating-point noise.
  cosAngleAtA = Math.max(-1, Math.min(1, cosAngleAtA));
  const angleAtA = Math.acos(cosAngleAtA);

  // Unit direction A→B.
  const uABx = (B.x - A.x) / lenAB;
  const uABy = (B.y - A.y) / lenAB;

  // Keep V' on the same side of AB as the original V (preserve
  // polygon orientation). Cross-product test mirrors setVertexAngle.
  const cross =
    (B.x - A.x) * (V.y - A.y) - (B.y - A.y) * (V.x - A.x);
  const sign = cross >= 0 ? 1 : -1;

  // Rotate A→B by angleAtA in the chosen sign, then scale by lenAV
  // (preserves |AV|).
  const cosR = Math.cos(angleAtA);
  const sinR = Math.sin(angleAtA) * sign;
  const dirX = uABx * cosR - uABy * sinR;
  const dirY = uABx * sinR + uABy * cosR;

  // Round 18 (Fix 1) — use `bestIntegerPointAtDistance` instead of
  // rounding x/y independently. The naive `Math.round` lands off-by-1mm
  // for angled edges where the float endpoint's fractional parts sit
  // either side of 0.5; the previous SET_EDGE_LENGTH suffered the same
  // bug, so without this fix a 1600 mm leg typed in, then squared,
  // could read back as 1598 or 1599 mm. See the helper's comment for
  // the worked example.
  const pt = bestIntegerPointAtDistance(
    A.x,
    A.y,
    A.x + lenAV * dirX,
    A.y + lenAV * dirY,
    lenAV,
  );
  const newX = pt.x;
  const newY = pt.y;

  const nextVertices = piece.vertices.map((v) =>
    v.id === vertexId ? { ...v, x: newX, y: newY } : v,
  );
  // Guard against the (rare) numerical case where rounding collapses
  // V' onto A. If that happens we'd produce a degenerate edge — bail
  // out so the caller can show the toast instead of mutating the piece
  // into an invalid state.
  if (newX === A.x && newY === A.y) return null;
  return { ...piece, vertices: nextVertices };
}
