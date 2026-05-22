// apps/web/src/lib/measurement-lines.ts
//
// Round 14 (Section B) — pure computation for the on-canvas measurement
// overlay.
//
// When the operator turns on measurement mode (M key / MEAS button),
// the canvas overlays:
//
//   1. Feature-to-edge distance lines from each face of a SELECTED
//      feature's bounding box outward to the nearest polygon edge in
//      each cardinal direction.
//   2. Edge subdivision dimensions ALONG each polygon edge: how the
//      edge length is partitioned by the features that anchor to it.
//      Example — a 3200 mm edge with a centred 760 mm sink reads
//      "1220 mm | 760 mm sink | 1220 mm".
//
// Pure TypeScript — no React, no Konva. Tests target this module
// directly via `computeMeasurementLines` / `computeEdgeSubdivisions`.
//
// The render layer (`MeasurementOverlay`) projects the returned
// world-coords through the canvas viewport and renders dashed lines +
// monospace labels.

import type {
  Edge,
  EdgeId,
  Feature,
  FeatureId,
  Piece,
  Vertex,
} from "@stonehenge-proto/geometry";

import { featureBboxMm, type FeatureBboxMm } from "./feature-placement";
import type { FeaturePlacement } from "../types/editor";

// ─────────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────────

/**
 * Round 15 (Fix 7) — semantic role of a feature-placement measurement
 * line. When the operator has a feature selected and an edge-aligned
 * placement exists, the canvas labels each of the four mason-relevant
 * dimensions: where the feature sits relative to the reference edge's
 * end vertices ("left margin", "right margin"), how far back from the
 * reference edge the feature sits ("back setback"), and how far the
 * feature is from the opposite (front) exposed edge ("front clearance").
 *
 * Generic cardinal-ray measurements (the legacy `computeFeatureToEdgeLines`
 * path) carry no `kind` because they aren't tied to a reference edge.
 */
export type MeasurementLineKind =
  | "left-margin"
  | "right-margin"
  | "back-setback"
  | "front-clearance";

export interface MeasurementLine {
  /** Line endpoints in piece-local mm. */
  readonly startMm: { readonly x: number; readonly y: number };
  readonly endMm: { readonly x: number; readonly y: number };
  /** Distance in mm — drives the on-canvas label. */
  readonly distanceMm: number;
  /** Where the label sits (midpoint of the line, in piece-local mm). */
  readonly labelMm: { readonly x: number; readonly y: number };
  /**
   * Round 15 (Fix 7) — when present, the label renders with a "kind"
   * prefix ("left margin 220 mm", "back setback 110 mm", etc.) so the
   * mason can read the four reference-edge measurements at a glance.
   * Generic cardinal lines omit this and render as bare "{N} mm".
   */
  readonly kind?: MeasurementLineKind;
}

export interface EdgeSubdivisionSegment {
  /** Start of the segment along the edge (mm from edge.start). */
  readonly fromAlongMm: number;
  /** End of the segment along the edge (mm from edge.start). */
  readonly toAlongMm: number;
  /** Segment length (mm). */
  readonly lengthMm: number;
  /** Position of the segment midpoint, in piece-local mm. */
  readonly midpointMm: { readonly x: number; readonly y: number };
  /**
   * `feature` is set when the segment IS a feature (the sink/cooktop
   * itself); `null` when it's an empty gap between features or between
   * a feature and the edge end.
   */
  readonly feature: Feature | null;
}

export interface EdgeSubdivision {
  readonly edgeId: EdgeId;
  /** Total edge length (mm). */
  readonly totalLengthMm: number;
  /** Ordered segments along the edge (gaps + features). */
  readonly segments: readonly EdgeSubdivisionSegment[];
}

// ─────────────────────────────────────────────────────────────────────────
// Feature-to-edge distance lines
// ─────────────────────────────────────────────────────────────────────────

/**
 * For an axis-aligned feature bounding box centred at `feature.position`,
 * compute four measurement lines — one from each face of the bbox
 * outward to the nearest polygon edge in each cardinal direction.
 *
 * The four lines correspond to:
 *   - +y (front face → front of polygon)    "bottom"
 *   - -y (back face → back of polygon)      "top"
 *   - -x (left face → left of polygon)      "left"
 *   - +x (right face → right of polygon)    "right"
 *
 * Returns an empty array when the feature has no measurable bbox (an
 * incomplete `custom-cutout`, for example) or when the cardinal ray
 * fails to hit a polygon edge in that direction.
 */
export function computeFeatureToEdgeLines(
  piece: Piece,
  feature: Feature,
): readonly MeasurementLine[] {
  const bbox = featureBboxMm(feature);
  if (bbox.widthMm <= 0 || bbox.depthMm <= 0) return [];

  const cx = feature.position.x;
  const cy = feature.position.y;
  const hw = bbox.widthMm / 2;
  const hd = bbox.depthMm / 2;

  // Four ray origins on each face of the bbox, plus the cardinal
  // direction vector for that face.
  const probes: ReadonlyArray<{
    readonly origin: { readonly x: number; readonly y: number };
    readonly dir: { readonly x: number; readonly y: number };
  }> = [
    { origin: { x: cx, y: cy - hd }, dir: { x: 0, y: -1 } }, // top
    { origin: { x: cx, y: cy + hd }, dir: { x: 0, y: 1 } }, // bottom
    { origin: { x: cx - hw, y: cy }, dir: { x: -1, y: 0 } }, // left
    { origin: { x: cx + hw, y: cy }, dir: { x: 1, y: 0 } }, // right
  ];

  const rim = outerRingVertices(piece);
  if (rim.length < 3) return [];

  const out: MeasurementLine[] = [];
  for (const probe of probes) {
    const hit = castRayToRim(probe.origin, probe.dir, rim);
    if (!hit) continue;
    if (hit.t < 1) continue; // ignore essentially-zero distances
    out.push({
      startMm: probe.origin,
      endMm: hit.point,
      distanceMm: hit.t,
      labelMm: {
        x: (probe.origin.x + hit.point.x) / 2,
        y: (probe.origin.y + hit.point.y) / 2,
      },
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Round 15 (Fix 7) — Placement-aware measurements
// ─────────────────────────────────────────────────────────────────────────

/**
 * Compute the four mason-relevant measurements for a feature anchored to
 * a reference edge:
 *
 *   1. `left-margin`  — distance along the reference edge from the
 *                       feature's leading (start-side) bbox face to the
 *                       reference edge's START vertex.
 *   2. `right-margin` — distance along the reference edge from the
 *                       feature's trailing (end-side) bbox face to the
 *                       reference edge's END vertex.
 *   3. `back-setback` — inward distance from the reference edge to the
 *                       feature's back (closest-to-edge) face. Drives
 *                       the "how far inboard does the cutout sit"
 *                       reading.
 *   4. `front-clearance` — distance from the feature's front (furthest-
 *                       from-edge) face to the polygon edge encountered
 *                       along the inward normal beyond it. Drives the
 *                       "how much bench remains in front of the cutout"
 *                       reading.
 *
 * The line endpoints render directly on the canvas; the label kind
 * drives the prefix text the operator sees ("Left margin 220 mm" etc.).
 *
 * Returns an empty array when:
 *   - the placement's reference edge isn't on the outer ring
 *   - the feature has no measurable bbox
 *   - the front-clearance ray misses the polygon (returns the other three)
 */
export function computeFeaturePlacementMeasurements(
  piece: Piece,
  feature: Feature,
  placement: FeaturePlacement,
): readonly MeasurementLine[] {
  const bbox = featureBboxMm(feature);
  if (bbox.widthMm <= 0 || bbox.depthMm <= 0) return [];

  const edge = piece.edges.find((e) => e.id === placement.referenceEdgeId);
  if (!edge) return [];
  const startV = piece.vertices.find((v) => v.id === edge.start);
  const endV = piece.vertices.find((v) => v.id === edge.end);
  if (!startV || !endV) return [];

  const ex = endV.x - startV.x;
  const ey = endV.y - startV.y;
  const edgeLenMm = Math.hypot(ex, ey);
  if (edgeLenMm === 0) return [];

  // Edge tangent (unit) and inward normal. The inward normal points
  // toward the polygon interior; we determine it by the polygon's
  // signed area sign (CCW outer ring in screen-down coords ⇒ left
  // perpendicular is inward).
  const ux = ex / edgeLenMm;
  const uy = ey / edgeLenMm;
  // Left perpendicular of (ux, uy) is (-uy, ux). For a CCW outer ring
  // in screen-down coords (positive signed area in our convention) the
  // interior is on the left — `edgeInwardNormal` in feature-placement.ts
  // already exposes this logic, but we replicate it locally to avoid a
  // circular dependency and to keep this module pure-data.
  const signedArea = outerSignedArea(piece);
  const inwardSign = signedArea > 0 ? 1 : -1;
  const nx = -uy * inwardSign;
  const ny = ux * inwardSign;

  // Feature centre and bbox half-extents in the edge frame.
  const halfAlong = bbox.widthMm / 2;
  const halfNormal = bbox.depthMm / 2;

  // Centre of the feature, projected onto the edge frame:
  //   along  = projection onto (ux, uy)   (equals placement.offsetAlongEdgeMm)
  //   normal = projection onto (nx, ny)   (equals placement.offsetInwardMm
  //                                        + halfNormal — the centre sits
  //                                        halfDepth inboard from the
  //                                        bbox's leading face)
  const along = placement.offsetAlongEdgeMm;
  // Bbox face positions in the edge frame (mm from edge start):
  const leftAlong = along - halfAlong; // start-side face
  const rightAlong = along + halfAlong; // end-side face
  // Inward distance to the feature's BACK face (closest to the
  // reference edge) and FRONT face (furthest from the reference edge).
  const backInward = placement.offsetInwardMm; // bbox edge nearest the ref edge
  const frontInward = placement.offsetInwardMm + bbox.depthMm;

  // World-space coordinates of the 4 face midpoints.
  const featureCentre = {
    x: startV.x + ux * along + nx * (backInward + halfNormal),
    y: startV.y + uy * along + ny * (backInward + halfNormal),
  };
  // Left face midpoint (along the edge from feature centre).
  const leftFaceMid = {
    x: featureCentre.x - ux * halfAlong,
    y: featureCentre.y - uy * halfAlong,
  };
  const rightFaceMid = {
    x: featureCentre.x + ux * halfAlong,
    y: featureCentre.y + uy * halfAlong,
  };
  // Back face midpoint (closest to reference edge).
  const backFaceMid = {
    x: featureCentre.x - nx * halfNormal,
    y: featureCentre.y - ny * halfNormal,
  };
  const frontFaceMid = {
    x: featureCentre.x + nx * halfNormal,
    y: featureCentre.y + ny * halfNormal,
  };

  // Back-setback foot on the reference edge — drop a perpendicular
  // from the back face midpoint onto the edge line.
  const backFoot = {
    x: startV.x + ux * along,
    y: startV.y + uy * along,
  };

  const out: MeasurementLine[] = [];

  // 1. Left margin: from leftFaceMid back to edge START vertex along
  //    the edge tangent direction (so the line sits on the reference
  //    edge, parallel to it, not diagonal).
  if (leftAlong > 1) {
    const startPt = {
      x: startV.x + ux * 0,
      y: startV.y + uy * 0,
    };
    const endPt = {
      x: startV.x + ux * leftAlong,
      y: startV.y + uy * leftAlong,
    };
    out.push({
      kind: "left-margin",
      startMm: startPt,
      endMm: endPt,
      distanceMm: leftAlong,
      labelMm: {
        x: (startPt.x + endPt.x) / 2,
        y: (startPt.y + endPt.y) / 2,
      },
    });
  }

  // 2. Right margin: from rightFaceMid forward to edge END vertex along
  //    the edge tangent direction.
  const rightGap = edgeLenMm - rightAlong;
  if (rightGap > 1) {
    const startPt = {
      x: startV.x + ux * rightAlong,
      y: startV.y + uy * rightAlong,
    };
    const endPt = {
      x: endV.x,
      y: endV.y,
    };
    out.push({
      kind: "right-margin",
      startMm: startPt,
      endMm: endPt,
      distanceMm: rightGap,
      labelMm: {
        x: (startPt.x + endPt.x) / 2,
        y: (startPt.y + endPt.y) / 2,
      },
    });
  }

  // 3. Back setback: from the back face midpoint perpendicularly into
  //    the reference edge (this is the placement's `offsetInwardMm`,
  //    by definition the distance from the reference edge to the
  //    feature's leading face). When it's zero the feature is flush —
  //    we still emit the label so the operator sees "0 mm" rather
  //    than wondering whether the panel forgot it. We DO drop near-
  //    zero values (< 1 mm) the same way the cardinal-ray path does.
  if (backInward > 0.5) {
    out.push({
      kind: "back-setback",
      startMm: backFoot,
      endMm: backFaceMid,
      distanceMm: backInward,
      labelMm: {
        x: (backFoot.x + backFaceMid.x) / 2,
        y: (backFoot.y + backFaceMid.y) / 2,
      },
    });
  }

  // 4. Front clearance: cast a ray from the front face midpoint in
  //    the inward direction (continues past the feature, away from the
  //    reference edge) to find the next polygon boundary. The hit
  //    distance is the "how much bench is in front of the cutout".
  const rim = outerRingVertices(piece);
  if (rim.length >= 3) {
    const hit = castRayToRim(frontFaceMid, { x: nx, y: ny }, rim);
    if (hit && hit.t > 0.5) {
      out.push({
        kind: "front-clearance",
        startMm: frontFaceMid,
        endMm: hit.point,
        distanceMm: hit.t,
        labelMm: {
          x: (frontFaceMid.x + hit.point.x) / 2,
          y: (frontFaceMid.y + hit.point.y) / 2,
        },
      });
    }
  }

  return out;
}

/**
 * Signed area of the outer ring (shoelace) in screen-down coords. Used
 * here to determine the inward-normal direction without depending on
 * `feature-placement.ts` (which imports back from this module's
 * `featureBboxMm` re-export).
 */
function outerSignedArea(piece: Piece): number {
  const edges = new Map<EdgeId, Edge>(piece.edges.map((e) => [e.id, e]));
  const verts = new Map(piece.vertices.map((v) => [v.id, v]));
  const pts: { x: number; y: number }[] = [];
  for (const id of piece.outerRing.edges) {
    const e = edges.get(id);
    if (!e) continue;
    const v = verts.get(e.start);
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

// ─────────────────────────────────────────────────────────────────────────
// Edge subdivision dimensions
// ─────────────────────────────────────────────────────────────────────────

/**
 * For every edge on the piece's outer ring, partition it by the
 * features anchored to it (via `placements.referenceEdgeId`). Returns
 * an `EdgeSubdivision` per edge with the ordered segments along that
 * edge.
 *
 * Segments include both:
 *   - Empty gaps (`feature: null`)
 *   - Feature spans (`feature: <Feature>`)
 *
 * Edges with no features anchored contribute a single segment spanning
 * the entire edge length. The caller is responsible for choosing what
 * to render — typically only the segments are drawn when measurement
 * mode is on AND the edge subdivision has more than one segment (i.e.
 * at least one feature is anchored).
 */
export function computeEdgeSubdivisions(
  piece: Piece,
  placements: ReadonlyMap<FeatureId, FeaturePlacement>,
): readonly EdgeSubdivision[] {
  const out: EdgeSubdivision[] = [];
  // Per-edge feature membership.
  const featuresByEdge = new Map<EdgeId, Feature[]>();
  const placementByFeatureId = placements;
  for (const f of piece.features) {
    const p = placementByFeatureId.get(f.id);
    if (!p) continue;
    const list = featuresByEdge.get(p.referenceEdgeId) ?? [];
    list.push(f);
    featuresByEdge.set(p.referenceEdgeId, list);
  }

  for (const edgeId of piece.outerRing.edges) {
    const edge = piece.edges.find((e) => e.id === edgeId);
    if (!edge) continue;
    const start = piece.vertices.find((v) => v.id === edge.start);
    const end = piece.vertices.find((v) => v.id === edge.end);
    if (!start || !end) continue;
    const edgeLenMm = Math.hypot(end.x - start.x, end.y - start.y);
    if (edgeLenMm === 0) continue;
    const ux = (end.x - start.x) / edgeLenMm;
    const uy = (end.y - start.y) / edgeLenMm;
    const featuresOnEdge = (featuresByEdge.get(edge.id) ?? []).slice();
    featuresOnEdge.sort((a, b) => {
      const pa = placementByFeatureId.get(a.id)?.offsetAlongEdgeMm ?? 0;
      const pb = placementByFeatureId.get(b.id)?.offsetAlongEdgeMm ?? 0;
      return pa - pb;
    });

    const segments: EdgeSubdivisionSegment[] = [];
    let cursor = 0;
    for (const f of featuresOnEdge) {
      const placement = placementByFeatureId.get(f.id);
      if (!placement) continue;
      const bbox = featureBboxMm(f);
      const halfAlong = bbox.widthMm / 2;
      const featureFromAlong = clampMm(
        placement.offsetAlongEdgeMm - halfAlong,
        0,
        edgeLenMm,
      );
      const featureToAlong = clampMm(
        placement.offsetAlongEdgeMm + halfAlong,
        0,
        edgeLenMm,
      );
      if (featureFromAlong > cursor) {
        segments.push(
          makeGapSegment(cursor, featureFromAlong, start, ux, uy),
        );
      }
      // Skip features whose along-edge span has zero width (rare edge
      // case from clamping); they don't usefully partition the edge.
      if (featureToAlong > featureFromAlong) {
        segments.push(
          makeFeatureSegment(featureFromAlong, featureToAlong, start, ux, uy, f),
        );
      }
      cursor = Math.max(cursor, featureToAlong);
    }
    if (cursor < edgeLenMm) {
      segments.push(makeGapSegment(cursor, edgeLenMm, start, ux, uy));
    }
    out.push({
      edgeId: edge.id,
      totalLengthMm: edgeLenMm,
      segments,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function makeGapSegment(
  fromAlongMm: number,
  toAlongMm: number,
  start: Vertex,
  ux: number,
  uy: number,
): EdgeSubdivisionSegment {
  const lengthMm = toAlongMm - fromAlongMm;
  const midAlong = (fromAlongMm + toAlongMm) / 2;
  return {
    fromAlongMm,
    toAlongMm,
    lengthMm,
    midpointMm: { x: start.x + ux * midAlong, y: start.y + uy * midAlong },
    feature: null,
  };
}

function makeFeatureSegment(
  fromAlongMm: number,
  toAlongMm: number,
  start: Vertex,
  ux: number,
  uy: number,
  feature: Feature,
): EdgeSubdivisionSegment {
  const lengthMm = toAlongMm - fromAlongMm;
  const midAlong = (fromAlongMm + toAlongMm) / 2;
  return {
    fromAlongMm,
    toAlongMm,
    lengthMm,
    midpointMm: { x: start.x + ux * midAlong, y: start.y + uy * midAlong },
    feature,
  };
}

function clampMm(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function outerRingVertices(
  piece: Piece,
): readonly { readonly x: number; readonly y: number }[] {
  const edges = new Map<EdgeId, Edge>(piece.edges.map((e) => [e.id, e]));
  const verts = new Map(piece.vertices.map((v) => [v.id, v]));
  const out: { x: number; y: number }[] = [];
  for (const id of piece.outerRing.edges) {
    const e = edges.get(id);
    if (!e) continue;
    const v = verts.get(e.start);
    if (!v) continue;
    out.push({ x: v.x, y: v.y });
  }
  return out;
}

/**
 * Cast a ray from `origin` in `dir` (unit) and return the first
 * intersection with the closed polygon rim. Returns null on no hit.
 */
function castRayToRim(
  origin: { readonly x: number; readonly y: number },
  dir: { readonly x: number; readonly y: number },
  rim: readonly { readonly x: number; readonly y: number }[],
): { readonly point: { readonly x: number; readonly y: number }; readonly t: number } | null {
  const n = rim.length;
  let bestT = Number.POSITIVE_INFINITY;
  let bestPt: { x: number; y: number } | null = null;
  for (let i = 0; i < n; i++) {
    const a = rim[i]!;
    const b = rim[(i + 1) % n]!;
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const denom = dir.x * sy - dir.y * sx;
    if (Math.abs(denom) < 1e-9) continue;
    const dx = a.x - origin.x;
    const dy = a.y - origin.y;
    const t = (dx * sy - dy * sx) / denom;
    const u = (dx * dir.y - dy * dir.x) / denom;
    if (t <= 1e-6) continue;
    if (u < -1e-6 || u > 1 + 1e-6) continue;
    if (t < bestT) {
      bestT = t;
      bestPt = { x: origin.x + t * dir.x, y: origin.y + t * dir.y };
    }
  }
  return bestPt ? { point: bestPt, t: bestT } : null;
}

/** Re-export `featureBboxMm` so MeasurementOverlay can avoid the long import. */
export type { FeatureBboxMm } from "./feature-placement";
