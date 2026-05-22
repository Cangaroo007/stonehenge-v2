// apps/web/src/lib/feature-snap.ts
//
// Snap preview computation. Pure functions — no React, no Konva.
//
// Two thresholds (UNCERTAIN-4 [B] — intentional split):
//   PLACEMENT_SNAP_THRESHOLD_MM = 200  — placement-mode is stricter
//   DRAG_SNAP_THRESHOLD_MM      = 300  — drag is more forgiving;
//                                        beyond it, the feature rubber-bands
//                                        back rather than vanishing.

import type {
  Edge,
  EdgeId,
  Feature,
  Piece,
  Vertex,
  VertexId,
} from "@stonehenge-proto/geometry";

import {
  DEFAULT_INWARD_OFFSET_MM,
  computeFeaturePosition,
  distanceToEdge,
  featureFitsInPiece,
  getValidReferenceEdges,
  projectOntoEdge,
} from "./feature-placement";
import type { FeaturePlacement } from "../types/editor";

export const PLACEMENT_SNAP_THRESHOLD_MM = 200;
export const DRAG_SNAP_THRESHOLD_MM = 300;

export interface SnapPreview {
  readonly placement: FeaturePlacement;
  /** Centre of the ghost feature, mm. */
  readonly ghostX: number;
  readonly ghostY: number;
  /** Edge direction, degrees. Used to rotate the ghost. */
  readonly ghostRotationDeg: number;
  /** Whether the ghost feature fits inside the piece outer ring. */
  readonly fits: boolean;
  /** World endpoints of the snapped reference edge, for rendering the guide. */
  readonly edgeStart: { readonly x: number; readonly y: number };
  readonly edgeEnd: { readonly x: number; readonly y: number };
  /** Perpendicular distance from cursor to the snapped edge (mm). */
  readonly cursorDistanceMm: number;
}

export interface ComputeSnapPreviewInput {
  readonly piece: Piece;
  readonly cursorX: number;
  readonly cursorY: number;
  readonly featureKind: Feature["kind"];
  readonly featureWidthMm: number;
  readonly featureDepthMm: number;
  /** Beyond this distance from the nearest valid edge, returns `null`. */
  readonly thresholdMm: number;
  /**
   * Override the inward offset. When omitted, uses the kind's default
   * (`DEFAULT_INWARD_OFFSET_MM`). During drag the caller passes the
   * feature's existing inward offset so the operator slides along (not
   * toward) the edge.
   */
  readonly inwardOffsetMm?: number;
}

/**
 * Compute a snap preview for placement or drag. Returns `null` if no valid
 * reference edge is within `thresholdMm` of the cursor.
 */
export function computeSnapPreview(
  input: ComputeSnapPreviewInput,
): SnapPreview | null {
  const {
    piece,
    cursorX,
    cursorY,
    featureKind,
    featureWidthMm,
    featureDepthMm,
    thresholdMm,
    inwardOffsetMm,
  } = input;

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
    const d = distanceToEdge({ x: cursorX, y: cursorY }, start, end);
    if (d < bestDist) {
      bestDist = d;
      bestEdge = edge;
      bestStart = start;
      bestEnd = end;
    }
  }

  if (!bestEdge || !bestStart || !bestEnd) return null;
  if (bestDist > thresholdMm) return null;

  const offsetAlongEdgeMm = projectOntoEdge(
    { x: cursorX, y: cursorY },
    bestStart,
    bestEnd,
  );
  const offsetInwardMm =
    inwardOffsetMm ?? DEFAULT_INWARD_OFFSET_MM[featureKind];
  const placement: FeaturePlacement = {
    referenceEdgeId: bestEdge.id,
    offsetAlongEdgeMm,
    offsetInwardMm,
  };

  const pos = computeFeaturePosition(piece, placement, featureDepthMm);
  if (!pos) return null;

  const fits = featureFitsInPiece(
    piece,
    placement,
    featureWidthMm,
    featureDepthMm,
  );

  return {
    placement,
    ghostX: pos.centreX,
    ghostY: pos.centreY,
    ghostRotationDeg: pos.rotationDeg,
    fits,
    edgeStart: { x: bestStart.x, y: bestStart.y },
    edgeEnd: { x: bestEnd.x, y: bestEnd.y },
    cursorDistanceMm: bestDist,
  };
}
