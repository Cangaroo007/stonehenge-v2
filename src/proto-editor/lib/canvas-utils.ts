// apps/web/src/lib/canvas-utils.ts
//
// Round 4 — shared canvas math.
//
// Pure helpers for the visual layer: coordinate transforms between piece-
// local millimetres and on-screen pixels, edge-midpoint projection (used
// by tooltips), and zoom-level → grid-tier resolution. No Konva imports,
// no React imports — these are pure functions, lifted out of the canvas
// components so the components stay presentational.

import type { CanvasViewport } from "../types/editor";

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Project a piece-local millimetre point into on-screen pixel coordinates.
 * Mirrors the world-to-screen transform Konva applies on the Layer.
 */
export function worldToScreen(
  world: WorldPoint,
  viewport: CanvasViewport,
): ScreenPoint {
  return {
    x: (world.x - viewport.panMmX) / viewport.mmPerPx,
    y: (world.y - viewport.panMmY) / viewport.mmPerPx,
  };
}

/**
 * Project a screen-pixel point into piece-local millimetre coordinates.
 * Inverse of `worldToScreen`.
 */
export function screenToWorld(
  screen: ScreenPoint,
  viewport: CanvasViewport,
): WorldPoint {
  return {
    x: viewport.panMmX + screen.x * viewport.mmPerPx,
    y: viewport.panMmY + screen.y * viewport.mmPerPx,
  };
}

/** Midpoint between two world points. */
export function midpointMm(a: WorldPoint, b: WorldPoint): WorldPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Euclidean distance between two world points, in mm. */
export function distanceMm(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Offset a world point by a perpendicular distance (in screen pixels) from
 * a directed edge. The unit perpendicular is computed in world space, the
 * pixel offset is multiplied by `mmPerPx` so the visual offset is constant
 * regardless of zoom. Returns the point in world coordinates.
 */
export function offsetPerpendicularMm(
  base: WorldPoint,
  edgeStart: WorldPoint,
  edgeEnd: WorldPoint,
  pxOffset: number,
  mmPerPx: number,
): WorldPoint {
  const dx = edgeEnd.x - edgeStart.x;
  const dy = edgeEnd.y - edgeStart.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return base;
  const perpX = -dy / len;
  const perpY = dx / len;
  const mmOffset = pxOffset * mmPerPx;
  return { x: base.x + perpX * mmOffset, y: base.y + perpY * mmOffset };
}

/**
 * Grid tier resolved from current zoom. The grid adapts so that the
 * minor-line spacing stays visually consistent regardless of how far in
 * or out the operator has zoomed.
 *
 * Brief §3.2 zoom-tier table:
 *   > 5 mm/px      → minor 100, major 500, label every 500
 *   2..5 mm/px     → minor 50,  major 250, label every 250
 *   1..2 mm/px     → minor 10,  major 100, label every 100
 *   < 1 mm/px      → minor 5,   major 50,  label every 50
 */
export interface GridTier {
  readonly minorMm: number;
  readonly majorMm: number;
  readonly labelEveryMm: number;
}

export function gridTierFor(mmPerPx: number): GridTier {
  if (mmPerPx > 5) {
    return { minorMm: 100, majorMm: 500, labelEveryMm: 500 };
  }
  if (mmPerPx > 2) {
    return { minorMm: 50, majorMm: 250, labelEveryMm: 250 };
  }
  if (mmPerPx > 1) {
    return { minorMm: 10, majorMm: 100, labelEveryMm: 100 };
  }
  return { minorMm: 5, majorMm: 50, labelEveryMm: 50 };
}

/**
 * Clamp a numeric value to the inclusive range [lo, hi]. Equivalent to
 * `Math.max(lo, Math.min(hi, v))` but reads cleaner at call sites.
 */
export function clampNumber(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/**
 * Linear interpolation utility. Used for transitions between zoom levels
 * and for opacity easing on grid-tier crossfade.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
