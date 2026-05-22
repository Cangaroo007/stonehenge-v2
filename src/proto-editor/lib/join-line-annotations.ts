// apps/web/src/lib/join-line-annotations.ts
//
// Round 14 (Section A) — pure computation for join line annotations.
//
// Walks a piece's outer ring, identifies reflex (concave) vertices, and
// for each one emits a `JoinLineAnnotation` describing where the natural
// "cut line" would land if a mason were splitting the polygon into
// rectangular pieces for CNC nesting.
//
// "Natural cut line" heuristic:
//   - For a 90° interior reflex (the L-shape's inner corner, the
//     U-shape's two inner corners), drop a straight line from the
//     reflex vertex along the bisector of the two adjacent edges.
//     The line terminates at the first opposite edge it intersects.
//   - For an angled reflex (the angled peninsula's 225° corner), the
//     same bisector approach gives a diagonal line — that's the mitre
//     join.
//
// Join kind label:
//   - "Butt join" when the reflex vertex's interior angle is roughly
//     90° (within ±5° tolerance). Manufacturer convention: a right
//     angle gets a butt join where the two rectangles meet face-to-end.
//   - "Mitre join" when the reflex's interior angle is non-perpendicular
//     (typically 135° for the canonical angled peninsula). The two
//     rectangles meet on a diagonal seam.
//
// Pure TypeScript — no React, no Konva. Tests target this module
// directly.

import type { Edge, Piece, Vertex, VertexId } from "@stonehenge-proto/geometry";

export interface JoinLineAnnotation {
  /** The reflex vertex this annotation is attached to. */
  readonly atVertexId: VertexId;
  /** The reflex vertex's position — start of the join line. */
  readonly startMm: { readonly x: number; readonly y: number };
  /** Far end of the join line — where it meets an opposite edge. */
  readonly endMm: { readonly x: number; readonly y: number };
  /** Midpoint of the join line — used for label placement. */
  readonly midMm: { readonly x: number; readonly y: number };
  /** Interior angle at the reflex vertex (degrees, >180 by definition). */
  readonly interiorAngleDeg: number;
  /** Human-readable kind for the on-canvas label. */
  readonly label: "Butt join" | "Mitre join";
}

/**
 * Reflex-vertex tolerance: an interior angle within 5° of 180° is
 * effectively a straight edge, not a corner. Excluded so curved-edge
 * polygons (where consecutive edges aren't strictly distinct) don't
 * spam the canvas with spurious join lines.
 */
const REFLEX_EPSILON_DEG = 5;

/**
 * "Butt join" angle band: any reflex with interior in
 * [270 − band, 270 + band]° is labeled a butt join (270° reflex on a
 * 90° L-shape interior). Mitre otherwise.
 */
const BUTT_JOIN_ANGLE_BAND_DEG = 10;

/**
 * Compute join line annotations for a piece. Returns one entry per
 * reflex vertex on the outer ring. Returns an empty array for convex
 * polygons (rectangle, island) and for polygons where every interior
 * angle is within `REFLEX_EPSILON_DEG` of 180°.
 */
export function computeJoinLineAnnotations(
  piece: Piece,
): readonly JoinLineAnnotation[] {
  const ring = piece.outerRing.edges;
  if (ring.length < 3) return [];

  // Build edge → start/end vertex map. We honour the outer ring's edge
  // order (not the piece.edges insertion order) so the reflex check
  // walks vertices in CCW traversal order.
  const edgesById = new Map<string, Edge>(piece.edges.map((e) => [e.id, e]));
  const verticesById = new Map<VertexId, Vertex>(
    piece.vertices.map((v) => [v.id, v]),
  );
  // Each ring step gives (prevVertex, currVertex, nextVertex). currVertex
  // is the start of edge i; nextVertex is the start of edge i+1. prev is
  // the start of edge i-1.
  interface RingStep {
    readonly prev: Vertex;
    readonly curr: Vertex;
    readonly next: Vertex;
  }
  const steps: RingStep[] = [];
  for (let i = 0; i < ring.length; i++) {
    const e = edgesById.get(ring[i]!);
    const ePrev = edgesById.get(ring[(i - 1 + ring.length) % ring.length]!);
    const eNext = edgesById.get(ring[(i + 1) % ring.length]!);
    if (!e || !ePrev || !eNext) return [];
    const curr = verticesById.get(e.start);
    const prev = verticesById.get(ePrev.start);
    const next = verticesById.get(eNext.start);
    if (!curr || !prev || !next) return [];
    steps.push({ prev, curr, next });
  }

  const signedArea = outerSignedAreaForPiece(piece);
  // For positive signed area in screen-down y (i.e. CW in math coords),
  // the interior sits on the LEFT of each forward edge direction. The
  // interior angle at a vertex is the angle you'd sweep from the
  // INCOMING edge direction to the OUTGOING edge direction, measured
  // through the interior side.
  const isInteriorLeftHand = signedArea > 0;

  // Precompute a polygon-rim polyline for ray-casting the bisector
  // against opposite edges.
  const rim: Array<{ readonly x: number; readonly y: number }> = [];
  for (const step of steps) {
    rim.push({ x: step.curr.x, y: step.curr.y });
  }

  const out: JoinLineAnnotation[] = [];
  for (let i = 0; i < steps.length; i++) {
    const { prev, curr, next } = steps[i]!;
    const interiorDeg = interiorAngleAtDeg(prev, curr, next, isInteriorLeftHand);
    if (interiorDeg <= 180 + REFLEX_EPSILON_DEG) continue; // not reflex
    // Compute the inward bisector direction. The bisector formula
    // `-inU + outU` gives the bisector of the SMALLER wedge between
    // the back-along-incoming and forward-along-outgoing vectors. For
    // a convex vertex (interior < 180°) the smaller wedge IS the
    // interior — the bisector points inward. For a reflex vertex
    // (interior > 180°) the smaller wedge is the EXTERIOR, so the
    // bisector points the WRONG way; we negate it to recover the
    // interior direction.
    const halfBisector = inwardBisector(prev, curr, next, isInteriorLeftHand);
    if (!halfBisector) continue;
    const isReflex = interiorDeg > 180;
    const bisector = isReflex
      ? { x: -halfBisector.x, y: -halfBisector.y }
      : halfBisector;
    // Ray-cast from `curr` along `bisector` and find the closest
    // intersection with any non-adjacent rim segment.
    const hit = rayHitRim(curr, bisector, rim, i);
    if (!hit) continue;
    const label: "Butt join" | "Mitre join" =
      Math.abs(interiorDeg - 270) <= BUTT_JOIN_ANGLE_BAND_DEG
        ? "Butt join"
        : "Mitre join";
    out.push({
      atVertexId: curr.id,
      startMm: { x: curr.x, y: curr.y },
      endMm: hit,
      midMm: { x: (curr.x + hit.x) / 2, y: (curr.y + hit.y) / 2 },
      interiorAngleDeg: interiorDeg,
      label,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────

function interiorAngleAtDeg(
  prev: Vertex,
  curr: Vertex,
  next: Vertex,
  interiorLeftHand: boolean,
): number {
  // Incoming direction: prev → curr. Outgoing: curr → next.
  const inx = curr.x - prev.x;
  const iny = curr.y - prev.y;
  const onx = next.x - curr.x;
  const ony = next.y - curr.y;
  // Turn angle (signed, in radians): atan2 of the cross product over the
  // dot product. For a straight edge, this is 0. For a left turn (CCW
  // in math coords), positive; for a right turn, negative.
  const cross = inx * ony - iny * onx;
  const dot = inx * onx + iny * ony;
  const turnRad = Math.atan2(cross, dot);
  // Exterior angle (the amount you'd turn at this corner) = turnRad
  // measured in the polygon's winding direction.
  //   - When the interior is on the LEFT of each forward edge (CW in
  //     screen-down = CCW in math), a left turn (positive turnRad)
  //     means the interior angle is LESS than 180° (convex). A right
  //     turn (negative turnRad) means MORE than 180° (reflex).
  //   - When the interior is on the RIGHT, the signs flip.
  let interiorRad: number;
  if (interiorLeftHand) {
    interiorRad = Math.PI - turnRad;
  } else {
    interiorRad = Math.PI + turnRad;
  }
  // Normalise to (0, 360°].
  let deg = (interiorRad * 180) / Math.PI;
  if (deg < 0) deg += 360;
  if (deg > 360) deg -= 360;
  return deg;
}

/**
 * Unit vector along the inward angle bisector at `curr`. "Inward" means
 * pointing into the polygon interior. For a reflex vertex on a polygon
 * with interior on the LEFT of forward edges, the inward bisector is
 * the average of `-inDir` and `outDir` (i.e. the bisector of the
 * exterior angle, since the interior angle is reflex), then flipped to
 * the interior side.
 */
function inwardBisector(
  prev: Vertex,
  curr: Vertex,
  next: Vertex,
  interiorLeftHand: boolean,
): { readonly x: number; readonly y: number } | null {
  const inx = curr.x - prev.x;
  const iny = curr.y - prev.y;
  const onx = next.x - curr.x;
  const ony = next.y - curr.y;
  const inLen = Math.hypot(inx, iny);
  const outLen = Math.hypot(onx, ony);
  if (inLen === 0 || outLen === 0) return null;
  const inUx = inx / inLen;
  const inUy = iny / inLen;
  const outUx = onx / outLen;
  const outUy = ony / outLen;
  // The angle bisector at a vertex with edges going prev→curr→next
  // points along `(-inU + outU)` (the bisector of the exterior turn),
  // normalised. For a reflex vertex, this bisector points INTO the
  // polygon interior — exactly what we want.
  let bx = -inUx + outUx;
  let by = -inUy + outUy;
  const bLen = Math.hypot(bx, by);
  if (bLen < 1e-9) {
    // Straight edge (no turn) — pick the inward perpendicular instead.
    if (interiorLeftHand) {
      bx = -iny / inLen;
      by = inx / inLen;
    } else {
      bx = iny / inLen;
      by = -inx / inLen;
    }
  } else {
    bx /= bLen;
    by /= bLen;
  }
  return { x: bx, y: by };
}

/**
 * Cast a ray from `origin` in direction `dir` and find the closest
 * intersection with any segment of `rim` (excluding the two segments
 * adjacent to vertex index `vertexIdx`). Returns null when the ray
 * misses every non-adjacent segment.
 */
function rayHitRim(
  origin: { readonly x: number; readonly y: number },
  dir: { readonly x: number; readonly y: number },
  rim: readonly { readonly x: number; readonly y: number }[],
  vertexIdx: number,
): { readonly x: number; readonly y: number } | null {
  const n = rim.length;
  let bestT = Number.POSITIVE_INFINITY;
  let bestPt: { readonly x: number; readonly y: number } | null = null;
  for (let i = 0; i < n; i++) {
    // Adjacent segments: the edge ending at curr (i = vertexIdx-1) and
    // the edge starting at curr (i = vertexIdx). Skip both.
    if (i === vertexIdx || i === (vertexIdx - 1 + n) % n) continue;
    const a = rim[i]!;
    const b = rim[(i + 1) % n]!;
    const hit = raySegmentIntersect(origin, dir, a, b);
    if (hit && hit.t > 1e-3 && hit.t < bestT) {
      bestT = hit.t;
      bestPt = hit.pt;
    }
  }
  return bestPt;
}

/**
 * Outer-ring signed area in screen-down coordinates. Positive when the
 * ring is wound CW in math coords (equivalently CCW in screen-down).
 * Inlined here so the join-line module is self-contained.
 */
function outerSignedAreaForPiece(piece: Piece): number {
  const edgesById = new Map<string, Edge>(piece.edges.map((e) => [e.id, e]));
  const verticesById = new Map<VertexId, Vertex>(
    piece.vertices.map((v) => [v.id, v]),
  );
  const pts: { x: number; y: number }[] = [];
  for (const id of piece.outerRing.edges) {
    const e = edgesById.get(id);
    if (!e) continue;
    const v = verticesById.get(e.start);
    if (!v) continue;
    pts.push({ x: v.x, y: v.y });
  }
  if (pts.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/**
 * Parametric ray–segment intersection. Ray = origin + t * dir (t > 0).
 * Segment = a + s * (b - a) (0 <= s <= 1). Returns the hit point and
 * the ray's t value, or null on no hit.
 */
function raySegmentIntersect(
  origin: { readonly x: number; readonly y: number },
  dir: { readonly x: number; readonly y: number },
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): { readonly pt: { readonly x: number; readonly y: number }; readonly t: number } | null {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const denom = dir.x * sy - dir.y * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const dx = a.x - origin.x;
  const dy = a.y - origin.y;
  const t = (dx * sy - dy * sx) / denom;
  const u = (dx * dir.y - dy * dir.x) / denom;
  if (t <= 0) return null;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  return {
    pt: { x: origin.x + t * dir.x, y: origin.y + t * dir.y },
    t,
  };
}
