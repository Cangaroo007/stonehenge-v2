// apps/web/src/lib/feature-overflow.ts
//
// Round 12 (Section A) — feature overflow detection + display strings.
//
// Three call sites:
//   1. Editor placement (`handleCanvasPlacement`): pre-check whether a
//      pending feature will fit before commit. On fail, show an amber
//      toast that names the feature and the edge length it tried to
//      span.
//   2. Scan import (`pieceFromScan` → `clampScanFeatures`): drop
//      features whose bbox still extends past the polygon after the
//      bootstrap-and-clamp round-trip, and emit a `manual.edit` event
//      so the operator can later see what was lost.
//   3. Runtime overflow (vertex drag / edge length edit): once a piece
//      mutates, walk every feature and surface the ids that no longer
//      fit. Drives a red highlight in `FeatureOverlay` and a banner
//      above the canvas.
//
// Pure module — no React, no Konva, no Next.js. Imports only the
// geometry types and the feature-placement pure helpers.

import type {
  Edge,
  Feature,
  FeatureId,
  Piece,
  Vertex,
} from "@stonehenge-proto/geometry";

import type { FeaturePlacement, FixtureMetadata } from "../types/editor";

import {
  bootstrapPlacementFromPosition,
  edgeAngleRad,
  featureBboxMm,
  featureFitsInPiece,
  type FeatureBboxMm,
} from "./feature-placement";

// ─────────────────────────────────────────────────────────────────────────
// Display labels — mirror of the `FEATURE_KIND_LABEL` table that lives in
// the editor page. Duplicated here (rather than imported) because this
// module is pure and stands alone for tests.
// ─────────────────────────────────────────────────────────────────────────

const KIND_LABEL: Readonly<Record<Feature["kind"], string>> = {
  "undermount-sink": "undermount sink",
  "overmount-sink": "overmount sink",
  "cooktop-cutout": "cooktop",
  "tap-hole": "tap hole",
  "window-recess": "window recess",
  "custom-cutout": "cutout",
};

/**
 * Human-readable name for a feature. Prefers the catalogue brand + model
 * when present (the same logic as the success-toast label in the editor),
 * falling back to the kind label.
 */
export function featureDisplayName(
  feature: Feature,
  metadata?: FixtureMetadata | null,
): string {
  if (metadata && metadata.brand && metadata.model) {
    return `${metadata.brand} ${metadata.model}`;
  }
  return KIND_LABEL[feature.kind];
}

// ─────────────────────────────────────────────────────────────────────────
// Edge length lookup
// ─────────────────────────────────────────────────────────────────────────

function edgeVertices(
  piece: Piece,
  edgeId: string,
): { readonly start: Vertex; readonly end: Vertex } | null {
  const edge = piece.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const start = piece.vertices.find((v) => v.id === edge.start);
  const end = piece.vertices.find((v) => v.id === edge.end);
  if (!start || !end) return null;
  return { start, end };
}

/** Length in mm of the edge identified by `edgeId`, or 0 if missing. */
export function edgeLengthMm(piece: Piece, edgeId: string): number {
  const ev = edgeVertices(piece, edgeId);
  if (!ev) return 0;
  return Math.hypot(ev.end.x - ev.start.x, ev.end.y - ev.start.y);
}

// ─────────────────────────────────────────────────────────────────────────
// Fit info — for placement-time pre-check
// ─────────────────────────────────────────────────────────────────────────

export interface FitInfo {
  readonly fits: boolean;
  /** Reference edge length in mm. Zero when the placement has no edge. */
  readonly edgeLengthMm: number;
  readonly bbox: FeatureBboxMm;
}

/**
 * Test whether a hypothetical placement of `feature` at `placement`
 * fits inside the piece. Reports the relevant edge length so callers can
 * compose error messages.
 */
export function featureFitInfo(
  piece: Piece,
  placement: FeaturePlacement,
  feature: Feature,
): FitInfo {
  const bbox = featureBboxMm(feature);
  const fits = featureFitsInPiece(piece, placement, bbox.widthMm, bbox.depthMm);
  const lengthMm = edgeLengthMm(piece, placement.referenceEdgeId);
  return { fits, edgeLengthMm: lengthMm, bbox };
}

/**
 * Compose the amber-toast string surfaced when a placement is rejected
 * because the feature's bbox extends past the polygon boundary.
 *
 *   "⚠ Bosch cooktop (600×520 mm) doesn't fit — edge is only 500 mm.
 *    Try a smaller product or a longer edge."
 *
 * The brief specifies the exact wording (with the ⚠ prefix); keep the
 * sentence intact when changing message format because `CanvasToast`
 * styles around the ⚠ as the variant marker.
 */
export function overflowToastMessage(params: {
  readonly feature: Feature;
  readonly metadata?: FixtureMetadata | null;
  readonly bbox: FeatureBboxMm;
  readonly edgeLengthMm: number;
}): string {
  const name = featureDisplayName(params.feature, params.metadata);
  const w = Math.round(params.bbox.widthMm);
  const d = Math.round(params.bbox.depthMm);
  const edge = Math.round(params.edgeLengthMm);
  if (edge > 0) {
    return (
      `⚠ ${name} (${w}×${d} mm) doesn't fit — edge is only ${edge} mm. ` +
      `Try a smaller product or a longer edge.`
    );
  }
  // Fallback when we can't read an edge length (custom-cutout, no
  // reference edge). The point-in-polygon test is the failure mode.
  return `⚠ ${name} (${w}×${d} mm) doesn't fit inside the piece.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Runtime overflow scan — for already-placed features after a polygon
// mutation. Walks every feature; for each, tries the matching placement
// (if any) first, then a bootstrap-from-position fallback. A feature is
// overflowing when neither path produces a fitting bbox.
// ─────────────────────────────────────────────────────────────────────────

export interface OverflowReason {
  readonly featureId: FeatureId;
  readonly kind: Feature["kind"];
  readonly bbox: FeatureBboxMm;
  /**
   * Edge length the feature was trying to live on, if a reference edge is
   * available. Zero for `custom-cutout`.
   */
  readonly edgeLengthMm: number;
}

/**
 * Walk every feature in `piece` and return a map of FeatureId →
 * OverflowReason for those that no longer fit.
 *
 * Strategy per feature:
 *   1. If `featurePlacements.get(id)` is set, run `featureFitsInPiece`
 *      against that placement.
 *   2. Otherwise (legacy features that pre-date the placement model),
 *      `bootstrapPlacementFromPosition` is consulted; if it yields a
 *      placement, use that. If not (true free-placement like
 *      `custom-cutout`), the feature is reported as non-overflowing.
 *
 * Cost is O(features × edges). For the prototype's piece sizes (≤ a
 * dozen edges, ≤ a dozen features) this is negligible per render.
 */
export function findOverflowingFeatures(
  piece: Piece,
  featurePlacements: ReadonlyMap<FeatureId, FeaturePlacement>,
): ReadonlyMap<FeatureId, OverflowReason> {
  const out = new Map<FeatureId, OverflowReason>();

  for (const f of piece.features) {
    if (f.kind === "custom-cutout") {
      // Custom cutouts have no reference edge; they're free-placement.
      // We don't have a robust "still fits inside the polygon" test for
      // arbitrary outlines this round — skip.
      continue;
    }
    let placement = featurePlacements.get(f.id);
    if (!placement) {
      const bootstrap = bootstrapPlacementFromPosition(piece, f);
      if (!bootstrap) continue;
      placement = bootstrap;
    }
    const bbox = featureBboxMm(f);
    const fits = featureFitsInPiece(piece, placement, bbox.widthMm, bbox.depthMm);
    if (fits) continue;
    out.set(f.id, {
      featureId: f.id,
      kind: f.kind,
      bbox,
      edgeLengthMm: edgeLengthMm(piece, placement.referenceEdgeId),
    });
  }

  return out;
}

/**
 * Compose the banner text for the editor's persistent overflow banner.
 *
 *   1 feature: "⚠ 1 feature no longer fits the polygon. Delete or resize it."
 *   n features: "⚠ <n> features no longer fit the polygon. Delete or resize them."
 */
export function overflowBannerMessage(count: number): string {
  if (count <= 1) {
    return "⚠ 1 feature no longer fits the polygon. Delete or resize it.";
  }
  return `⚠ ${count} features no longer fit the polygon. Delete or resize them.`;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers re-exported for callers that already pull from this module
// ─────────────────────────────────────────────────────────────────────────

export { featureBboxMm };

/** Re-export so scan-import callers don't duplicate the bbox math. */
export function featureFitsAtPosition(
  piece: Piece,
  feature: Feature,
): boolean {
  if (feature.kind === "custom-cutout") return true; // not edge-anchored
  const placement = bootstrapPlacementFromPosition(piece, feature);
  if (!placement) return false;
  const bbox = featureBboxMm(feature);
  return featureFitsInPiece(piece, placement, bbox.widthMm, bbox.depthMm);
}

/**
 * Reference-edge angle in degrees (for tests that want to verify the
 * runtime overflow detection sees an angled edge correctly). Wraps the
 * pure helper from feature-placement.
 */
export function referenceEdgeAngleDeg(piece: Piece, edgeId: string): number {
  return (edgeAngleRad(piece, edgeId as unknown as Edge["id"]) * 180) / Math.PI;
}
