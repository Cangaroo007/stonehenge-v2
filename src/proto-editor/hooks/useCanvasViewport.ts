"use client";

// apps/web/src/hooks/useCanvasViewport.ts
//
// Round 4 — viewport controller.
//
// Owns the (mm/px, panMmX, panMmY) tuple that the canvas applies to its
// Layer transform. Exposes:
//   - `viewport`            — the current state
//   - `setViewport`         — escape hatch for the existing inline wheel
//                             / drag-pan handlers in PolygonCanvas
//   - `zoomBy(factor, anchor?)` — apply a multiplicative zoom centred on
//                                 an anchor point in screen pixels
//   - `zoomIn` / `zoomOut`  — keyboard-style zoom step (no anchor)
//   - `fitTo(piece)`        — recompute pan + zoom so the piece fills the
//                             current container with padding
//
// The hook intentionally keeps the same `CanvasViewport` shape used by
// the rest of the editor — including `minX/minY/maxX/maxY` which are
// retained for the DimensionLabel transform math (UNCERTAIN: those four
// fields are no longer load-bearing inside PolygonCanvas itself, but
// `CanvasViewport` is a public type from `types/editor.ts` and changing
// it would require auditing every consumer).
//
// Zoom range: 0.5..15 mm/px (matches Round 3A — half-mm/px max-in
// gives a 300 mm tap-hole at ~600 px on a 1080 p screen, and 15 mm/px
// max-out fits a 6 m kitchen on a 400 px canvas).

import { useCallback, useMemo, useState } from "react";

import { clampNumber } from "../lib/canvas-utils";
import type { CanvasViewport } from "../types/editor";
import type { Piece } from "@stonehenge-proto/geometry";

export const ZOOM_MIN_MM_PER_PX = 0.5;
export const ZOOM_MAX_MM_PER_PX = 15;
export const ZOOM_STEP_MULTIPLIER = 1.08; // 8 % per tick — see brief §9.2
export const FIT_PADDING_MM = 250;

export interface UseCanvasViewportOptions {
  readonly piece: Piece;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface UseCanvasViewportApi {
  readonly viewport: CanvasViewport;
  readonly setViewport: (
    next: CanvasViewport | ((prev: CanvasViewport) => CanvasViewport),
  ) => void;
  readonly zoomBy: (
    factor: number,
    anchorPx?: { readonly x: number; readonly y: number },
  ) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly fitTo: (piece: Piece) => void;
}

export function useCanvasViewport(
  opts: UseCanvasViewportOptions,
): UseCanvasViewportApi {
  const { piece, widthPx, heightPx } = opts;
  const [viewport, setViewport] = useState<CanvasViewport>(() =>
    fitViewport(piece, widthPx, heightPx),
  );

  const zoomBy = useCallback(
    (factor: number, anchorPx?: { readonly x: number; readonly y: number }) => {
      setViewport((v) => {
        const next = clampNumber(
          v.mmPerPx * factor,
          ZOOM_MIN_MM_PER_PX,
          ZOOM_MAX_MM_PER_PX,
        );
        if (!anchorPx) {
          return { ...v, mmPerPx: next };
        }
        const worldX = v.panMmX + anchorPx.x * v.mmPerPx;
        const worldY = v.panMmY + anchorPx.y * v.mmPerPx;
        const panMmX = worldX - anchorPx.x * next;
        const panMmY = worldY - anchorPx.y * next;
        return { ...v, mmPerPx: next, panMmX, panMmY };
      });
    },
    [],
  );

  const zoomIn = useCallback(() => zoomBy(1 / ZOOM_STEP_MULTIPLIER), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(ZOOM_STEP_MULTIPLIER), [zoomBy]);

  const fitTo = useCallback(
    (target: Piece) => {
      setViewport(fitViewport(target, widthPx, heightPx));
    },
    [widthPx, heightPx],
  );

  return useMemo(
    () => ({ viewport, setViewport, zoomBy, zoomIn, zoomOut, fitTo }),
    [viewport, zoomBy, zoomIn, zoomOut, fitTo],
  );
}

/**
 * Compute the viewport that fits the entire piece bbox plus `FIT_PADDING_MM`
 * around it into a container of the given pixel size. Centres the piece in
 * the container.
 */
export function fitViewport(
  piece: Piece,
  widthPx: number,
  heightPx: number,
): CanvasViewport {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of piece.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  if (!Number.isFinite(minX)) {
    return {
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 1000,
      mmPerPx: 4,
      panMmX: -widthPx * 2,
      panMmY: -heightPx * 2,
    };
  }
  const widthMm = maxX - minX + FIT_PADDING_MM * 2;
  const heightMm = maxY - minY + FIT_PADDING_MM * 2;
  const mmPerPxX = widthMm / Math.max(1, widthPx);
  const mmPerPxY = heightMm / Math.max(1, heightPx);
  const mmPerPx = clampNumber(
    Math.max(mmPerPxX, mmPerPxY),
    ZOOM_MIN_MM_PER_PX,
    ZOOM_MAX_MM_PER_PX,
  );
  const panMmX = minX - FIT_PADDING_MM - (widthPx * mmPerPx - widthMm) / 2;
  const panMmY = minY - FIT_PADDING_MM - (heightPx * mmPerPx - heightMm) / 2;
  return { minX, minY, maxX, maxY, mmPerPx, panMmX, panMmY };
}
