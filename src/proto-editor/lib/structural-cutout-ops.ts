// apps/web/src/lib/structural-cutout-ops.ts
//
// Round-3A: structural columns/poles. Per Sean's call on UNCERTAIN-8 [A],
// we lift the resize lock on `custom-cutout` features for entries marked
// `installationType === "structural"` in their fixture metadata.
//
// This module owns the geometry of structural cutout outlines:
//   - circle: 16-sided polygon approximation
//   - rectangle: 4-vertex axis-aligned outline
//
// Both are emitted as `CustomCutout.outline: ReadonlyArray<{x, y}>`.

import type { CustomCutout, FeatureId } from "@stonehenge-proto/geometry";
import { featureId as mintFeatureId } from "@stonehenge-proto/geometry";

import type { FixtureMetadata } from "../types/editor";

const CIRCLE_SEGMENTS = 16;

/**
 * Build a circular structural cutout outline (16-gon approximation).
 *
 * Coordinates are in piece-local mm, centred on the requested centre.
 */
export function buildCircularStructuralOutline(
  centreMm: { readonly x: number; readonly y: number },
  diameterMm: number,
): ReadonlyArray<{ readonly x: number; readonly y: number }> {
  const r = diameterMm / 2;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const t = (i / CIRCLE_SEGMENTS) * 2 * Math.PI;
    out.push({
      x: Math.round(centreMm.x + r * Math.cos(t)),
      y: Math.round(centreMm.y + r * Math.sin(t)),
    });
  }
  return out;
}

/**
 * Build a rectangular structural cutout outline.
 */
export function buildRectangularStructuralOutline(
  centreMm: { readonly x: number; readonly y: number },
  widthMm: number,
  depthMm: number,
): ReadonlyArray<{ readonly x: number; readonly y: number }> {
  const halfW = widthMm / 2;
  const halfD = depthMm / 2;
  return [
    { x: Math.round(centreMm.x - halfW), y: Math.round(centreMm.y - halfD) },
    { x: Math.round(centreMm.x + halfW), y: Math.round(centreMm.y - halfD) },
    { x: Math.round(centreMm.x + halfW), y: Math.round(centreMm.y + halfD) },
    { x: Math.round(centreMm.x - halfW), y: Math.round(centreMm.y + halfD) },
  ];
}

/**
 * Round 7A (FIX 3): L-shape structural cutout outline — for corner posts
 * and structural notches. The L's outer bounds are `widthMm × depthMm`;
 * the inner notch removes the bottom-right quadrant (half the bounding
 * width × half the bounding depth). Returns 6 vertices in CCW order.
 *
 * Layout (centred on `centreMm`, +x right, +y down):
 *
 *   (−w/2, −d/2) ─────────────── (w/2, −d/2)
 *        │                              │
 *        │                              │
 *        │              ┌───────────────┤
 *        │              │  (notched arm)
 *        │              │
 *   (−w/2, d/2) ─── (0, d/2)
 */
export function buildLShapeStructuralOutline(
  centreMm: { readonly x: number; readonly y: number },
  widthMm: number,
  depthMm: number,
): ReadonlyArray<{ readonly x: number; readonly y: number }> {
  const halfW = widthMm / 2;
  const halfD = depthMm / 2;
  return [
    { x: Math.round(centreMm.x - halfW), y: Math.round(centreMm.y - halfD) },
    { x: Math.round(centreMm.x + halfW), y: Math.round(centreMm.y - halfD) },
    { x: Math.round(centreMm.x + halfW), y: Math.round(centreMm.y) },
    { x: Math.round(centreMm.x), y: Math.round(centreMm.y) },
    { x: Math.round(centreMm.x), y: Math.round(centreMm.y + halfD) },
    { x: Math.round(centreMm.x - halfW), y: Math.round(centreMm.y + halfD) },
  ];
}

/**
 * Construct a structural-cutout feature ready for the reducer.
 *
 * `id` is auto-minted; the caller should add the feature via
 * ADD_FEATURE with the matching `FixtureMetadata` so the resize lock
 * detection can see `installationType === "structural"`.
 */
export type StructuralShape = "circle" | "rectangle" | "l-shape";

export function buildStructuralCutoutFeature(input: {
  readonly shape: StructuralShape;
  readonly centreMm: { readonly x: number; readonly y: number };
  readonly widthMm: number;
  readonly depthMm: number;
}): { readonly feature: CustomCutout; readonly featureId: FeatureId } {
  const id = mintFeatureId();
  const outline = buildOutlineForShape(
    input.shape,
    input.centreMm,
    input.widthMm,
    input.depthMm,
  );

  const feature: CustomCutout = {
    id,
    kind: "custom-cutout",
    position: { x: input.centreMm.x, y: input.centreMm.y },
    outline,
  };

  return { feature, featureId: id };
}

function buildOutlineForShape(
  shape: StructuralShape,
  centreMm: { readonly x: number; readonly y: number },
  widthMm: number,
  depthMm: number,
): ReadonlyArray<{ readonly x: number; readonly y: number }> {
  switch (shape) {
    case "circle":
      return buildCircularStructuralOutline(
        centreMm,
        Math.max(widthMm, depthMm),
      );
    case "rectangle":
      return buildRectangularStructuralOutline(centreMm, widthMm, depthMm);
    case "l-shape":
      return buildLShapeStructuralOutline(centreMm, widthMm, depthMm);
  }
}

/**
 * Build the matching FixtureMetadata for a structural cutout — the
 * `installationType: "structural"` flag is what unlocks resize.
 */
export function buildStructuralFixtureMetadata(
  shape: StructuralShape,
): FixtureMetadata {
  return {
    catalogueEntryId: null,
    brand: "Cutout",
    model:
      shape === "circle"
        ? "Round"
        : shape === "rectangle"
          ? "Rectangle"
          : "L-shape",
    mountType: null,
    cutoutTemplateSupplied: false,
    installationType: "structural",
  };
}

/**
 * Resize a structural cutout — recompute the outline at new dimensions
 * around the feature's existing centre. Returns the new outline.
 */
export function resizeStructuralOutline(
  feature: CustomCutout,
  shape: StructuralShape,
  widthMm: number,
  depthMm: number,
): ReadonlyArray<{ readonly x: number; readonly y: number }> {
  const centre = { x: feature.position.x, y: feature.position.y };
  return buildOutlineForShape(shape, centre, widthMm, depthMm);
}

/**
 * Detect whether a fixture metadata entry represents a structural cutout.
 */
export function isStructuralFixture(
  metadata: FixtureMetadata | undefined,
): boolean {
  return metadata?.installationType === "structural";
}
