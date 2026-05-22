// apps/web/src/lib/feature-placement.ts
//
// Edge-aware feature placement geometry. Pure functions — no React, no Konva,
// no Next.js. Imports only `@stonehenge-proto/geometry` types and the
// `FeaturePlacement` editor type.
//
// Each feature except `custom-cutout` is anchored to a reference edge by a
// `FeaturePlacement` carrying:
//   - `referenceEdgeId`     — which edge the feature is referenced from
//   - `offsetAlongEdgeMm`   — distance along the edge from the START vertex
//                             to the feature's centre, projected onto the
//                             edge direction
//   - `offsetInwardMm`      — distance from the reference edge to the
//                             feature's OUTER face (UNCERTAIN-2 [A]).
//                             0 = flush with the edge.
//
// The feature's centre is `outer_face_position + half_depth_inward`, so a
// sink with bowlDepthMm=450 and offsetInwardMm=60 sits with its near face
// 60 mm from the edge and its centre 60 + 225 = 285 mm from the edge.
//
// Reference-edge eligibility per feature kind (UNCERTAIN-1 [A], geometry-pure):
//   undermount-sink   → exposed
//   overmount-sink    → exposed
//   cooktop-cutout    → exposed
//   tap-hole          → exposed (sink-aware placement deferred to Round 2)
//   window-recess     → wall
//   custom-cutout     → none (free placement)

import type {
  Edge,
  EdgeId,
  Feature,
  Piece,
  Vertex,
  VertexId,
} from "@stonehenge-proto/geometry";

import type { FeaturePlacement } from "../types/editor";

/** Default outer-face offset from the reference edge, per feature kind. */
export const DEFAULT_INWARD_OFFSET_MM: Readonly<
  Record<Feature["kind"], number>
> = {
  "undermount-sink": 60,
  "overmount-sink": 40,
  "cooktop-cutout": 80,
  "tap-hole": 80,
  "window-recess": 0,
  "custom-cutout": 0,
};

const TOLERANCE_MM = 1;

// ─────────────────────────────────────────────────────────────────────────
// Bounding box
// ─────────────────────────────────────────────────────────────────────────

export interface FeatureBboxMm {
  readonly widthMm: number;
  readonly depthMm: number;
}

/**
 * Width (along reference edge) and depth (inward from edge) of a feature's
 * bbox. Tap-hole uses diameter for both. Custom-cutout derives from outline.
 */
export function featureBboxMm(feature: Feature): FeatureBboxMm {
  switch (feature.kind) {
    case "undermount-sink":
      return { widthMm: feature.bowlWidthMm, depthMm: feature.bowlDepthMm };
    case "overmount-sink":
      return {
        widthMm: feature.cutoutWidthMm,
        depthMm: feature.cutoutDepthMm,
      };
    case "cooktop-cutout":
      return {
        widthMm: feature.cutoutWidthMm,
        depthMm: feature.cutoutDepthMm,
      };
    case "tap-hole":
      return { widthMm: feature.diameterMm, depthMm: feature.diameterMm };
    case "window-recess":
      return { widthMm: feature.widthMm, depthMm: feature.intrusionMm };
    case "custom-cutout": {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const pt of feature.outline) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
      const widthMm = Number.isFinite(minX) ? maxX - minX : 0;
      const depthMm = Number.isFinite(minY) ? maxY - minY : 0;
      return { widthMm, depthMm };
    }
    default: {
      const _exhaustive: never = feature;
      return _exhaustive;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reference-edge selection
// ─────────────────────────────────────────────────────────────────────────

/**
 * Edges from the piece's outer ring that may anchor a feature of this kind.
 * Returns an empty array for `custom-cutout` (free placement).
 *
 * Round 15 (Fix 8) — UNCERTAIN: Sean's brief asked for a topology-aware
 * filter rejecting "internal" L/U-cut edges even when their exposure is
 * marked `exposed`. The straightforward "reject any edge with a reflex
 * endpoint" check over-rejects: it also blocks the legitimate front of
 * the back run on an L-shape (which terminates at the inside corner)
 * and the front-of-bench edges of the U-shape's arms. Distinguishing
 * "front of bench that happens to abut the inside corner" from "the
 * actual inside-of-leg edge" needs more than reflex-adjacency — likely
 * a combination of edge length, perpendicular direction relative to
 * the polygon centroid, and edge-pair grouping around each reflex.
 *
 * For now the function still filters by exposure only. The mason can
 * mark inside-of-leg edges as `wall` explicitly to opt them out of
 * placement, which restores the desired behaviour for any case where
 * the operator's intent is clear. Sean to revisit the topology gate as
 * a Round 16 follow-up.
 */
export function getValidReferenceEdges(
  piece: Piece,
  featureKind: Feature["kind"],
): Edge[] {
  if (featureKind === "custom-cutout") return [];

  const allowedExposure: "exposed" | "wall" =
    featureKind === "window-recess" ? "wall" : "exposed";

  const edgesById = new Map<EdgeId, Edge>(piece.edges.map((e) => [e.id, e]));
  const result: Edge[] = [];
  for (const id of piece.outerRing.edges) {
    const edge = edgesById.get(id);
    if (!edge) continue;
    if (edge.exposure === allowedExposure) result.push(edge);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Edge / vertex lookups
// ─────────────────────────────────────────────────────────────────────────

function getEdgeVertices(
  piece: Piece,
  edgeId: EdgeId,
): { readonly start: Vertex; readonly end: Vertex } | null {
  const edge = piece.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const start = piece.vertices.find((v) => v.id === edge.start);
  const end = piece.vertices.find((v) => v.id === edge.end);
  if (!start || !end) return null;
  return { start, end };
}

function outerCentroid(piece: Piece): { readonly cx: number; readonly cy: number } {
  const edgesById = new Map<EdgeId, Edge>(piece.edges.map((e) => [e.id, e]));
  const verticesById = new Map<VertexId, Vertex>(
    piece.vertices.map((v) => [v.id, v]),
  );
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const id of piece.outerRing.edges) {
    const e = edgesById.get(id);
    if (!e) continue;
    const v = verticesById.get(e.start);
    if (!v) continue;
    sumX += v.x;
    sumY += v.y;
    count++;
  }
  if (count === 0) return { cx: 0, cy: 0 };
  return { cx: sumX / count, cy: sumY / count };
}

/**
 * Round 10 (Fix 2) — signed area of the outer ring in piece-local
 * coordinates. The shoelace formula gives a positive value when the
 * vertex traversal is clockwise in screen coordinates (y axis pointing
 * down) and negative when counter-clockwise.
 *
 * Used by `edgeInwardNormal` to determine the interior side without
 * relying on the polygon centroid — which, for concave polygons like a
 * U-shape, can fall OUTSIDE the polygon and flip the inward normal to
 * the wrong side.
 */
function outerSignedArea(piece: Piece): number {
  const edgesById = new Map<EdgeId, Edge>(piece.edges.map((e) => [e.id, e]));
  const verticesById = new Map<VertexId, Vertex>(
    piece.vertices.map((v) => [v.id, v]),
  );
  const points: { x: number; y: number }[] = [];
  for (const id of piece.outerRing.edges) {
    const e = edgesById.get(id);
    if (!e) continue;
    const v = verticesById.get(e.start);
    if (!v) continue;
    points.push({ x: v.x, y: v.y });
  }
  if (points.length < 3) return 0;
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

// ─────────────────────────────────────────────────────────────────────────
// Edge tangent angle (Round 9, Issue 3 + Issue 4)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Edge tangent angle in radians. Used by:
 *   - FeatureOverlay rotation (Issue 3): an edge-anchored feature's
 *     local frame aligns with this tangent so the visual rotates onto
 *     the reference edge.
 *   - Vertex angle-snap during drag (Issue 4): the snap math reads
 *     adjacent-edge tangents to compute the interior angle.
 *
 * Returns 0 when the edge is missing or zero-length. This is a safe
 * default — the Konva Group's `rotation` prop accepts 0 cleanly and
 * the angle-snap path falls back to "no snap" when an angle can't be
 * computed.
 */
export function edgeAngleRad(piece: Piece, edgeId: EdgeId): number {
  const ev = getEdgeVertices(piece, edgeId);
  if (!ev) return 0;
  const dx = ev.end.x - ev.start.x;
  const dy = ev.end.y - ev.start.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx);
}

// ─────────────────────────────────────────────────────────────────────────
// Inward normal
// ─────────────────────────────────────────────────────────────────────────

/**
 * Unit vector perpendicular to the edge, pointing toward the polygon's
 * interior.
 *
 * Round 10 (Fix 2): switched from a centroid-based test to a
 * winding-based test using the outer ring's signed area. The previous
 * implementation took the average of all vertex positions and picked
 * whichever perpendicular pointed toward that average — but for concave
 * polygons (a U-shape with a notch in the middle, the inverted-U LiDAR
 * scan shape, an L-shape near the concave corner) the vertex average
 * can land OUTSIDE the polygon, in the notch itself. That made the
 * inward normal flip to the wrong side for edges adjacent to the
 * concave region, which in turn made `featureFitsInPiece` reject valid
 * placements like a 760 × 450 mm sink on a 2400 mm exposed edge of the
 * U-shape scan.
 *
 * The winding-based fix is robust for any simple polygon (convex or
 * concave): the polygon interior always lies on the same side of every
 * edge — the "left" perpendicular of the edge direction for CW
 * polygons (positive signed area in screen-down y coordinates) and the
 * "right" perpendicular for CCW polygons. We compute the signed area
 * once and pick the matching perpendicular.
 *
 * Falls back to the legacy centroid pick on a degenerate (zero-area)
 * polygon to keep behaviour deterministic — `outerCentroid` is retained
 * for that path and is still referenced elsewhere.
 */
export function edgeInwardNormal(
  piece: Piece,
  edgeId: EdgeId,
): { readonly nx: number; readonly ny: number } {
  const ev = getEdgeVertices(piece, edgeId);
  if (!ev) return { nx: 0, ny: 0 };
  const dx = ev.end.x - ev.start.x;
  const dy = ev.end.y - ev.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { nx: 0, ny: 0 };

  const signedArea = outerSignedArea(piece);
  if (signedArea !== 0) {
    // Left perpendicular of (dx, dy) is (-dy, dx); right is (dy, -dx).
    // For positive signed area (CW in screen-down coords), interior is
    // on the LEFT of each edge direction; for negative signed area
    // (CCW), interior is on the RIGHT.
    const sign = signedArea > 0 ? 1 : -1;
    return { nx: (sign * -dy) / len, ny: (sign * dx) / len };
  }

  // Fallback (degenerate polygon, zero signed area): use the legacy
  // centroid-distance pick. This path is unreachable for any valid
  // piece because `validatePiece` rejects zero-area rings, but the
  // guard keeps the function total in case it is called on a partially
  // constructed piece during a multi-step topology operation.
  const left = { nx: -dy / len, ny: dx / len };
  const right = { nx: dy / len, ny: -dx / len };
  const { cx, cy } = outerCentroid(piece);
  const midX = (ev.start.x + ev.end.x) / 2;
  const midY = (ev.start.y + ev.end.y) / 2;
  const toCentroidX = cx - midX;
  const toCentroidY = cy - midY;
  const dotLeft = left.nx * toCentroidX + left.ny * toCentroidY;
  const dotRight = right.nx * toCentroidX + right.ny * toCentroidY;
  return dotLeft >= dotRight ? left : right;
}

// ─────────────────────────────────────────────────────────────────────────
// Position computation
// ─────────────────────────────────────────────────────────────────────────

export interface ComputedPosition {
  readonly centreX: number;
  readonly centreY: number;
  /** Edge direction angle, degrees. Used for rotating the feature in the canvas. */
  readonly rotationDeg: number;
}

/**
 * Compute the feature's centre position (mm, piece-local) and rotation
 * (degrees) from a placement. Outer-edge semantics: `offsetInwardMm = 0`
 * means the feature's outer face is flush with the reference edge; the
 * centre is then `outer_face + featureDepthMm/2` inward.
 */
export function computeFeaturePosition(
  piece: Piece,
  placement: FeaturePlacement,
  featureDepthMm: number,
): ComputedPosition | null {
  const ev = getEdgeVertices(piece, placement.referenceEdgeId);
  if (!ev) return null;
  const dx = ev.end.x - ev.start.x;
  const dy = ev.end.y - ev.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const tx = dx / len;
  const ty = dy / len;

  const alongX = ev.start.x + tx * placement.offsetAlongEdgeMm;
  const alongY = ev.start.y + ty * placement.offsetAlongEdgeMm;

  const { nx, ny } = edgeInwardNormal(piece, placement.referenceEdgeId);
  const totalInwardMm = placement.offsetInwardMm + featureDepthMm / 2;
  const centreX = alongX + nx * totalInwardMm;
  const centreY = alongY + ny * totalInwardMm;

  const rotationDeg = (Math.atan2(ty, tx) * 180) / Math.PI;
  return { centreX, centreY, rotationDeg };
}

// ─────────────────────────────────────────────────────────────────────────
// Geometric primitives
// ─────────────────────────────────────────────────────────────────────────

function distanceToSegment(
  point: { readonly x: number; readonly y: number },
  segStart: { readonly x: number; readonly y: number },
  segEnd: { readonly x: number; readonly y: number },
): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(point.x - segStart.x, point.y - segStart.y);
  }
  const tRaw =
    ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lenSq;
  const t = Math.max(0, Math.min(1, tRaw));
  const px = segStart.x + t * dx;
  const py = segStart.y + t * dy;
  return Math.hypot(point.x - px, point.y - py);
}

/**
 * Perpendicular distance from a point to an edge segment. Clamped within
 * the segment endpoints (i.e. returns the distance to the nearer endpoint
 * if the perpendicular foot lies outside).
 */
export function distanceToEdge(
  point: { readonly x: number; readonly y: number },
  edgeStart: Vertex,
  edgeEnd: Vertex,
): number {
  return distanceToSegment(point, edgeStart, edgeEnd);
}

/**
 * Project a point onto an edge segment. Returns the distance along the edge
 * from the START vertex, clamped to [0, edgeLength].
 */
export function projectOntoEdge(
  point: { readonly x: number; readonly y: number },
  edgeStart: Vertex,
  edgeEnd: Vertex,
): number {
  const dx = edgeEnd.x - edgeStart.x;
  const dy = edgeEnd.y - edgeStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  const len = Math.sqrt(lenSq);
  const tRaw =
    ((point.x - edgeStart.x) * dx + (point.y - edgeStart.y) * dy) / lenSq;
  const tClamped = Math.max(0, Math.min(1, tRaw));
  return tClamped * len;
}

// ─────────────────────────────────────────────────────────────────────────
// Snap to nearest valid edge
// ─────────────────────────────────────────────────────────────────────────

/**
 * Find the nearest valid reference edge for a feature kind given a point
 * in piece-local coordinates. Returns a placement whose `offsetAlongEdgeMm`
 * is the projection of the point onto that edge and whose `offsetInwardMm`
 * is the kind's default. Caller may override the inward offset (e.g. when
 * preserving an existing inward offset during drag).
 *
 * Returns `null` if the feature kind has no valid reference edges in this
 * piece (e.g. an island piece with no `wall` edges + a `window-recess`
 * placement attempt).
 */
export function snapToNearestEdge(
  piece: Piece,
  clickX: number,
  clickY: number,
  featureKind: Feature["kind"],
): FeaturePlacement | null {
  const candidates = getValidReferenceEdges(piece, featureKind);
  if (candidates.length === 0) return null;

  const verticesById = new Map<VertexId, Vertex>(
    piece.vertices.map((v) => [v.id, v]),
  );

  let bestEdge: Edge | null = null;
  let bestStart: Vertex | null = null;
  let bestEnd: Vertex | null = null;
  let bestDist = Infinity;

  for (const edge of candidates) {
    const start = verticesById.get(edge.start);
    const end = verticesById.get(edge.end);
    if (!start || !end) continue;
    const d = distanceToEdge({ x: clickX, y: clickY }, start, end);
    if (d < bestDist) {
      bestDist = d;
      bestEdge = edge;
      bestStart = start;
      bestEnd = end;
    }
  }

  if (!bestEdge || !bestStart || !bestEnd) return null;

  const offsetAlongEdgeMm = projectOntoEdge(
    { x: clickX, y: clickY },
    bestStart,
    bestEnd,
  );
  return {
    referenceEdgeId: bestEdge.id,
    offsetAlongEdgeMm,
    offsetInwardMm: DEFAULT_INWARD_OFFSET_MM[featureKind],
  };
}

/**
 * Bootstrap a placement for a legacy (Vision/NL-extracted) feature on its
 * first drag (UNCERTAIN-8 [A]). Snaps the feature to its nearest valid
 * reference edge and infers offsets from its current centre so the rendered
 * position is preserved when the placement-driven render path takes over.
 *
 * Returns `null` for `custom-cutout` (no edge constraint) or when no valid
 * reference edge exists in the piece.
 */
export function bootstrapPlacementFromPosition(
  piece: Piece,
  feature: Feature,
): FeaturePlacement | null {
  if (feature.kind === "custom-cutout") return null;

  const candidates = getValidReferenceEdges(piece, feature.kind);
  if (candidates.length === 0) return null;

  const verticesById = new Map<VertexId, Vertex>(
    piece.vertices.map((v) => [v.id, v]),
  );

  let bestEdge: Edge | null = null;
  let bestStart: Vertex | null = null;
  let bestEnd: Vertex | null = null;
  let bestDist = Infinity;

  for (const edge of candidates) {
    const start = verticesById.get(edge.start);
    const end = verticesById.get(edge.end);
    if (!start || !end) continue;
    const d = distanceToEdge(feature.position, start, end);
    if (d < bestDist) {
      bestDist = d;
      bestEdge = edge;
      bestStart = start;
      bestEnd = end;
    }
  }

  if (!bestEdge || !bestStart || !bestEnd) return null;

  const offsetAlongEdgeMm = projectOntoEdge(
    feature.position,
    bestStart,
    bestEnd,
  );
  // Inferred inward offset: perpendicular distance from edge to centre,
  // minus half the feature's depth (centre = outer_face + half_depth).
  const { depthMm } = featureBboxMm(feature);
  const offsetInwardMm = Math.max(0, bestDist - depthMm / 2);

  return {
    referenceEdgeId: bestEdge.id,
    offsetAlongEdgeMm,
    offsetInwardMm,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Fit check
// ─────────────────────────────────────────────────────────────────────────

interface PolyPoint {
  readonly x: number;
  readonly y: number;
}

function ringWorldPoints(piece: Piece): PolyPoint[] {
  const verticesById = new Map<VertexId, Vertex>(
    piece.vertices.map((v) => [v.id, v]),
  );
  const edgesById = new Map<EdgeId, Edge>(piece.edges.map((e) => [e.id, e]));
  const points: PolyPoint[] = [];
  for (const id of piece.outerRing.edges) {
    const e = edgesById.get(id);
    if (!e) continue;
    const v = verticesById.get(e.start);
    if (!v) continue;
    points.push({ x: v.x, y: v.y });
  }
  return points;
}

function pointInPolygon(
  poly: ReadonlyArray<PolyPoint>,
  x: number,
  y: number,
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    const intersect =
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distanceToPolygonBoundary(
  poly: ReadonlyArray<PolyPoint>,
  point: PolyPoint,
): number {
  let min = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distanceToSegment(point, poly[j]!, poly[i]!);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Whether the feature's bbox fits inside the piece's outer ring at the
 * proposed placement, with a 1 mm boundary tolerance (UNCERTAIN-5 [A]).
 * The tolerance lets edge-flush features (e.g. window-recess with
 * offsetInwardMm = 0) report `fits = true` even though their outer corners
 * sit on the polygon boundary.
 */
export function featureFitsInPiece(
  piece: Piece,
  placement: FeaturePlacement,
  featureWidthMm: number,
  featureDepthMm: number,
): boolean {
  const pos = computeFeaturePosition(piece, placement, featureDepthMm);
  if (!pos) return false;

  const ev = getEdgeVertices(piece, placement.referenceEdgeId);
  if (!ev) return false;
  const dx = ev.end.x - ev.start.x;
  const dy = ev.end.y - ev.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;
  const tx = dx / len;
  const ty = dy / len;
  const { nx, ny } = edgeInwardNormal(piece, placement.referenceEdgeId);

  const halfW = featureWidthMm / 2;
  const halfD = featureDepthMm / 2;

  const localCorners: ReadonlyArray<readonly [number, number]> = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];

  const poly = ringWorldPoints(piece);
  if (poly.length < 3) return false;

  for (const [along, inward] of localCorners) {
    const wx = pos.centreX + tx * along + nx * inward;
    const wy = pos.centreY + ty * along + ny * inward;
    if (pointInPolygon(poly, wx, wy)) continue;
    // Outside the polygon, but accept if within 1 mm of the boundary
    // (edge-flush features by definition sit on the boundary).
    const boundaryDist = distanceToPolygonBoundary(poly, { x: wx, y: wy });
    if (boundaryDist > TOLERANCE_MM) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Round 5 — bounds enforcement
// ─────────────────────────────────────────────────────────────────────────

/**
 * Get the length of an edge in mm.
 */
function edgeLengthMm(piece: Piece, edgeId: EdgeId): number {
  const ev = getEdgeVertices(piece, edgeId);
  if (!ev) return 0;
  return Math.hypot(ev.end.x - ev.start.x, ev.end.y - ev.start.y);
}

/**
 * Round 5 — Clamp a desired width/depth so the feature fits inside the
 * polygon at the given placement.
 *
 * Returns the clamped dimensions plus a `clamped` flag. The clamp is
 * computed by:
 *   - width: bounded by the edge length minus the along-edge protrusion
 *     either side of the centre (so the feature doesn't slide past either
 *     endpoint). Caps at the smaller of `desiredWidthMm` and the available
 *     along-edge span.
 *   - depth: bounded by the polygon depth perpendicular to the edge at
 *     the feature's centre, minus the inward offset.
 *
 * If the position itself is out-of-bounds (e.g. offsetAlongEdgeMm > edge
 * length), the result is `clamped: true` with the minimum 50 × 50 mm.
 */
export function clampFeatureToBounds(
  piece: Piece,
  placement: FeaturePlacement,
  desiredWidthMm: number,
  desiredDepthMm: number,
): { widthMm: number; depthMm: number; clamped: boolean } {
  const minMm = 50;
  const edgeLen = edgeLengthMm(piece, placement.referenceEdgeId);
  if (edgeLen <= 0) {
    return { widthMm: minMm, depthMm: minMm, clamped: true };
  }
  // Available along-edge span. The feature's centre is at
  // offsetAlongEdgeMm; the bbox extends ±widthMm/2 along the edge.
  const offset = placement.offsetAlongEdgeMm;
  const alongLeft = Math.max(0, offset);
  const alongRight = Math.max(0, edgeLen - offset);
  const maxWidth = 2 * Math.min(alongLeft, alongRight);

  // For depth, search inward and find the maximum depth that keeps the
  // bbox inside the polygon. Binary-search on depth.
  let lowD = minMm;
  let highD = Math.max(desiredDepthMm, minMm) + 1;
  // First check if desired depth fits at clamped width.
  const tryWidth = Math.min(Math.max(desiredWidthMm, minMm), Math.max(maxWidth, minMm));
  let maxDepth = highD;
  if (
    !featureFitsInPiece(piece, placement, tryWidth, highD)
  ) {
    // Binary-search down to find the largest depth that fits.
    for (let i = 0; i < 14; i++) {
      const mid = (lowD + highD) / 2;
      if (featureFitsInPiece(piece, placement, tryWidth, mid)) {
        lowD = mid;
      } else {
        highD = mid;
      }
    }
    maxDepth = Math.max(minMm, lowD);
  }

  const widthMm = Math.min(Math.max(desiredWidthMm, minMm), Math.max(maxWidth, minMm));
  const depthMm = Math.min(Math.max(desiredDepthMm, minMm), maxDepth);
  const clamped = widthMm < desiredWidthMm - 0.5 || depthMm < desiredDepthMm - 0.5;
  return { widthMm, depthMm, clamped };
}

/**
 * Round 5 — Clamp a placement's `offsetAlongEdgeMm` so the feature's bbox
 * stays inside the polygon along the edge direction.
 *
 * Used during drag to prevent the feature from sliding past the polygon
 * boundary along its reference edge.
 */
export function clampPlacementToBounds(
  piece: Piece,
  placement: FeaturePlacement,
  featureWidthMm: number,
  featureDepthMm: number,
): FeaturePlacement {
  const edgeLen = edgeLengthMm(piece, placement.referenceEdgeId);
  if (edgeLen <= 0) return placement;
  const halfW = featureWidthMm / 2;
  const minOffset = halfW;
  const maxOffset = Math.max(halfW, edgeLen - halfW);
  const clampedOffset = Math.max(minOffset, Math.min(maxOffset, placement.offsetAlongEdgeMm));
  if (clampedOffset === placement.offsetAlongEdgeMm) return placement;
  void featureDepthMm; // depth is not used for along-edge clamp
  return {
    ...placement,
    offsetAlongEdgeMm: clampedOffset,
  };
}
