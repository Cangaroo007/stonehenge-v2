"use client";

// apps/web/src/hooks/useFeaturePlacement.ts
//
// Edge-aware feature placement (Round 1, this brief).
//
// Replaces the original click-to-place flow. The operator clicks a palette
// item to arm placement; the canvas drives mouse-move snap previews via
// `computeSnapPreview` (rendered in `PolygonCanvas`). On click, this hook
// commits the snapped placement.
//
// Flow:
//   1. Operator clicks a palette item → caller dispatches `SET_TOOL_MODE`
//      with `{ kind: 'feature-place', featureKind }`.
//   2. Canvas mouse-move computes a snap preview; if the cursor is within
//      the placement threshold of a valid reference edge, a ghost is shown.
//   3. Operator clicks the canvas; this hook calls `snapToNearestEdge` at
//      the click point. If a placement is returned and the feature fits,
//      ADD_FEATURE fires with the placement; tool mode reverts to `select`.
//   4. If the click misses (no snap or doesn't fit), nothing happens —
//      placement mode stays armed for retry.
//
// `custom-cutout` has no edge constraint; it falls back to the original
// point-in-polygon check and is added without a placement.
//
// Round 12 (Section A): the rejection path now exposes a reason so the
// editor can surface an amber "doesn't fit" toast when the bbox-overflow
// branch fires. The legacy `tryPlace` returning `Feature | null` is
// preserved (existing tests stick to that signature); a new
// `tryPlaceWithReason` returns the discriminated result.

import { useCallback } from "react";

import { featureId } from "@stonehenge-proto/geometry";
import type {
  Edge,
  Feature,
  Piece,
  Vertex,
} from "@stonehenge-proto/geometry";

import {
  featureBboxMm,
  featureFitsInPiece,
  snapToNearestEdge,
} from "../lib/feature-placement";
import { edgeLengthMm } from "../lib/feature-overflow";
import type { FeaturePlacement, ToolMode } from "../types/editor";

export interface UseFeaturePlacementApi {
  /**
   * Try to commit a feature at the given piece-local mm point. Returns the
   * created feature on success, or `null` if the click missed (no valid
   * snap target, or the feature wouldn't fit).
   */
  readonly tryPlace: (xMm: number, yMm: number) => Feature | null;
  /**
   * Round 12 (Section A) — richer variant that names the rejection reason
   * so the editor can render an amber overflow toast.
   */
  readonly tryPlaceWithReason: (xMm: number, yMm: number) => TryPlaceResult;
}

/**
 * Round 12 (Section A) — discriminated placement result.
 *
 *   - "placed"    Successful placement. Carries the feature.
 *   - "no-tool"   Tool mode isn't `feature-place`; the click was for
 *                  something else (vertex drag, edge select, etc.).
 *                  The editor should ignore.
 *   - "no-snap"   No valid reference edge near the click. Silent — same
 *                  as the legacy null return so the operator can retry.
 *   - "overflow"  The feature's bbox extends past the polygon at the
 *                  snapped placement. The editor renders an amber toast
 *                  built from the carried details.
 */
export type TryPlaceResult =
  | { readonly kind: "placed"; readonly feature: Feature }
  | { readonly kind: "no-tool" }
  | { readonly kind: "no-snap" }
  | {
      readonly kind: "overflow";
      readonly featureKind: Feature["kind"];
      readonly featureWidthMm: number;
      readonly featureDepthMm: number;
      readonly edgeLengthMm: number;
      readonly feature: Feature;
    };

export interface UseFeaturePlacementInput {
  readonly piece: Piece;
  readonly toolMode: ToolMode;
  readonly addFeature: (feature: Feature, placement?: FeaturePlacement) => void;
  readonly setToolMode: (mode: ToolMode) => void;
}

export function useFeaturePlacement(
  input: UseFeaturePlacementInput,
): UseFeaturePlacementApi {
  const { piece, toolMode, addFeature, setToolMode } = input;

  const tryPlaceWithReason = useCallback(
    (xMm: number, yMm: number): TryPlaceResult => {
      if (toolMode.kind !== "feature-place") return { kind: "no-tool" };
      const kind = toolMode.featureKind;

      // Custom-cutout has no edge constraint — keep the existing
      // point-in-polygon check and place at raw coords.
      if (kind === "custom-cutout") {
        if (!pointInPiece(piece, xMm, yMm)) return { kind: "no-snap" };
        const feature = buildFeature(kind, xMm, yMm);
        addFeature(feature);
        setToolMode({ kind: "select" });
        return { kind: "placed", feature };
      }

      // All other kinds require a valid reference edge.
      const placement = snapToNearestEdge(piece, xMm, yMm, kind);
      if (!placement) return { kind: "no-snap" };

      const feature = buildFeature(kind, xMm, yMm);
      const bbox = featureBboxMm(feature);
      if (!featureFitsInPiece(piece, placement, bbox.widthMm, bbox.depthMm)) {
        return {
          kind: "overflow",
          featureKind: kind,
          featureWidthMm: bbox.widthMm,
          featureDepthMm: bbox.depthMm,
          edgeLengthMm: edgeLengthMm(piece, placement.referenceEdgeId),
          feature,
        };
      }

      addFeature(feature, placement);
      setToolMode({ kind: "select" });
      return { kind: "placed", feature };
    },
    [piece, toolMode, addFeature, setToolMode],
  );

  const tryPlace = useCallback(
    (xMm: number, yMm: number): Feature | null => {
      const result = tryPlaceWithReason(xMm, yMm);
      return result.kind === "placed" ? result.feature : null;
    },
    [tryPlaceWithReason],
  );

  return { tryPlace, tryPlaceWithReason };
}

// ─────────────────────────────────────────────────────────────────────────
// Defaults — shape and dimensions only. The reducer recomputes the
// feature's `position` from the placement's outer-edge offsets, so the
// (xMm, yMm) passed here is overwritten when a placement is supplied.
// ─────────────────────────────────────────────────────────────────────────

function buildFeature(
  kind: Feature["kind"],
  xMm: number,
  yMm: number,
): Feature {
  switch (kind) {
    case "undermount-sink":
      return {
        id: featureId(),
        kind: "undermount-sink",
        position: { x: xMm, y: yMm },
        bowlWidthMm: 760,
        bowlDepthMm: 450,
      };
    case "overmount-sink":
      return {
        id: featureId(),
        kind: "overmount-sink",
        position: { x: xMm, y: yMm },
        cutoutWidthMm: 760,
        cutoutDepthMm: 450,
      };
    case "cooktop-cutout":
      return {
        id: featureId(),
        kind: "cooktop-cutout",
        position: { x: xMm, y: yMm },
        cutoutWidthMm: 600,
        cutoutDepthMm: 520,
        cornerRadiusMm: 6,
      };
    case "tap-hole":
      return {
        id: featureId(),
        kind: "tap-hole",
        position: { x: xMm, y: yMm },
        diameterMm: 35,
      };
    case "window-recess":
      return {
        id: featureId(),
        kind: "window-recess",
        position: { x: xMm, y: yMm },
        widthMm: 900,
        depthMm: 100,
        intrusionMm: 100,
      };
    case "custom-cutout":
      return {
        id: featureId(),
        kind: "custom-cutout",
        position: { x: xMm, y: yMm },
        outline: [
          { x: -100, y: -100 },
          { x: 100, y: -100 },
          { x: 100, y: 100 },
          { x: -100, y: 100 },
        ],
      };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Point-in-polygon check (custom-cutout fallback).
// ─────────────────────────────────────────────────────────────────────────

function pointInPiece(piece: Piece, xMm: number, yMm: number): boolean {
  const verticesById = new Map<string, Vertex>(
    piece.vertices.map((v) => [v.id, v]),
  );
  const edgesById = new Map<string, Edge>(piece.edges.map((e) => [e.id, e]));
  const ringPoints: Array<{ x: number; y: number }> = [];
  for (const id of piece.outerRing.edges) {
    const e = edgesById.get(id);
    if (!e) return false;
    const v = verticesById.get(e.start);
    if (!v) return false;
    ringPoints.push({ x: v.x, y: v.y });
  }
  return rayCastInside(ringPoints, xMm, yMm);
}

function rayCastInside(
  poly: ReadonlyArray<{ x: number; y: number }>,
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
