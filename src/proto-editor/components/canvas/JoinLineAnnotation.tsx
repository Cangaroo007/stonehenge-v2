"use client";

// apps/web/src/components/canvas/JoinLineAnnotation.tsx
//
// Round 14 (Section A) — visual-only join line annotations.
//
// Stone masons think in CUT PIECES, not polygons. An L-shape is two
// pieces joined; a U-shape is three; an angled peninsula is two with a
// mitre at the angle. The prototype draws single polygons for editing
// convenience, but the manufacturing reality is that these polygons get
// SPLIT into rectangular pieces at join lines for CNC cutting and slab
// nesting.
//
// This module exposes two primitives used by `PolygonCanvas`:
//   - `JoinLineKonva`: dashed grey line drawn inside the Konva Layer
//     (world-coords, scaled with zoom).
//   - `JoinLineLabel`:  HTML label rendered in the overlay layer
//     (pixel-coords, anti-aliased at screen resolution).
//
// The piece remains a single polygon. The full split-into-pieces
// workflow (`packages/core/pieces`) is V3 Wave 4 scope. Detection
// (`computeJoinLineAnnotations`) lives in
// `apps/web/src/lib/join-line-annotations.ts`.

import { Line } from "react-konva";

import type { JoinLineAnnotation } from "../../lib/join-line-annotations";

export type { JoinLineAnnotation } from "../../lib/join-line-annotations";

// ─────────────────────────────────────────────────────────────────────────
// Konva line — rendered inside `<Layer>` in world (piece-local mm) coords.
// ─────────────────────────────────────────────────────────────────────────

export interface JoinLineKonvaProps {
  readonly annotation: JoinLineAnnotation;
  readonly mmPerPx: number;
}

export function JoinLineKonva({ annotation, mmPerPx }: JoinLineKonvaProps) {
  // Dashed grey line, ~1px screen-space wide.
  const dash = [12 * mmPerPx, 6 * mmPerPx];
  const strokeWidth = 1.25 * mmPerPx;
  return (
    <Line
      points={[
        annotation.startMm.x,
        annotation.startMm.y,
        annotation.endMm.x,
        annotation.endMm.y,
      ]}
      stroke="#a8a29e"
      opacity={0.55}
      strokeWidth={strokeWidth}
      dash={dash}
      listening={false}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// HTML label — rendered in the absolute-positioned overlay above the canvas.
// ─────────────────────────────────────────────────────────────────────────

export interface JoinLineLabelProps {
  readonly text: string;
  readonly screenX: number;
  readonly screenY: number;
}

export function JoinLineLabel(props: JoinLineLabelProps) {
  const { text, screenX, screenY } = props;
  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-stone-100/95 px-1.5 py-[1px] font-mono text-[10px] leading-none text-stone-600 shadow-sm"
      style={{ left: `${screenX}px`, top: `${screenY}px` }}
    >
      {text}
    </div>
  );
}
